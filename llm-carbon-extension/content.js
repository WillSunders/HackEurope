console.log("LLM Energy Estimator: content.js running on", location.href);

const TOKENS_PER_CHAR = 1 / 4;            // rough heuristic for English
const KG_CO2_PER_KWH = 0.187;             // used only for migration fallback
const KWH_PER_1K_TOKENS = 0.00027;        // placeholder energy coefficient
const MWH_PER_KWH = 1000000;              // 1 kWh = 1,000,000 mWh

// ---- Extension lifecycle safety ----
let EXT_CONTEXT_VALID = true;

window.addEventListener("beforeunload", () => {
  EXT_CONTEXT_VALID = false;
});

function isInvalidationError(e) {
  const msg = String(e?.message || e);
  return msg.includes("Extension context invalidated") ||
         msg.includes("context invalidated");
}

async function safeStorageGet(keys) {
  if (!EXT_CONTEXT_VALID) return null;
  try {
    return await chrome.storage.local.get(keys);
  } catch (e) {
    if (isInvalidationError(e)) return null;
    throw e;
  }
}

async function safeStorageSet(obj) {
  if (!EXT_CONTEXT_VALID) return false;
  try {
    await chrome.storage.local.set(obj);
    return true;
  } catch (e) {
    if (isInvalidationError(e)) return false;
    throw e;
  }
}

async function getSettings() {
  const res = await safeStorageGet([
    "orgId",
    "userId",
    "deviceId",
    "apiUrl",
    "enableUpload",
  ]);
  return {
    orgId: res?.orgId || "",
    userId: res?.userId || "",
    deviceId: res?.deviceId || "",
    apiUrl: res?.apiUrl || "http://localhost:4242",
    enableUpload: Boolean(res?.enableUpload),
  };
}

async function appendPendingRecord(record) {
  const res = await safeStorageGet(["pendingMetrics"]);
  const pending = Array.isArray(res?.pendingMetrics) ? res.pendingMetrics : [];
  pending.push(record);
  // keep last 500 to avoid unbounded growth
  const trimmed = pending.slice(-500);
  await safeStorageSet({ pendingMetrics: trimmed });
}

async function sendRecord(record, settings) {
  if (!settings.enableUpload || !settings.apiUrl) return;
  try {
    console.log("LLM Energy Estimator: sending metric", record);
    await fetch(
      `${settings.apiUrl.replace(/\/$/, "")}/api/metrics/ingest?target=llm_energy_metrics`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(record),
      }
    );
  } catch (e) {
    console.warn("LLM Energy Estimator: failed to send metric", e);
    // swallow network errors; record is kept in pending list
  }
}

function estimateTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length * TOKENS_PER_CHAR));
}

// --- Simple hash for dedupe keys (fast + good enough for this use) ---
function hashString(str) {
  // djb2-ish
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h) ^ str.charCodeAt(i);
  return (h >>> 0).toString(16);
}

// --- Conversation identifier (prevents cross-chat collisions) ---
function getConversationId() {
  // ChatGPT: /c/<id> (common), but fall back to path
  const m = location.pathname.match(/\/c\/([a-zA-Z0-9-]+)/);
  return m ? m[1] : location.pathname;
}

// --- Best-effort extraction of chat messages from the page ---
// This is intentionally defensive. We’ll try multiple selector patterns.
function getMessageNodes() {
  // Common patterns on chat UIs:
  // - article elements
  // - elements with data attributes (varies)
  const selectors = [
    "main article",
    "article",
    "[data-message-author-role]",
    "[data-testid*='message']",
  ];

  for (const sel of selectors) {
    const nodes = Array.from(document.querySelectorAll(sel));
    if (nodes.length > 0) return nodes;
  }
  return [];
}

function inferRole(node) {
  // If a role attribute exists, use it
  const roleAttr = node.getAttribute("data-message-author-role");
  if (roleAttr) return roleAttr; // "user" or "assistant" on some builds

  // Fallback heuristic:
  // Many UIs tag user messages differently, but if we can't tell,
  // mark as "unknown" so we still dedupe.
  return "unknown";
}

function extractText(node) {
  // Prefer innerText because it matches what user sees.
  // Trim to avoid minor whitespace reflows causing new hashes.
  const t = (node.innerText || "").trim();
  // Avoid counting empty UI containers
  if (t.length < 2) return "";
  return t;
}

// --- Badge UI (debug) ---
let badge = null;

function ensureBadge() {
  if (badge) return badge;
  badge = document.createElement("div");
  badge.style.position = "fixed";
  badge.style.bottom = "20px";
  badge.style.right = "20px";
  badge.style.background = "black";
  badge.style.color = "white";
  badge.style.padding = "10px";
  badge.style.zIndex = "9999";
  badge.style.borderRadius = "8px";
  badge.style.fontSize = "12px";
  badge.style.lineHeight = "1.3";
  badge.style.maxWidth = "260px";
  badge.style.whiteSpace = "pre-line";
  badge.style.boxShadow = "0 4px 14px rgba(0,0,0,0.35)";
  const attach = () => document.body && document.body.appendChild(badge);
  if (document.body) attach();
  else window.addEventListener("DOMContentLoaded", attach, { once: true });
  return badge;
}

function updateBadge(totalTokens, totalEnergyKwh, countedCount) {
  ensureBadge();
  badge.innerText =
    `LLM Energy Estimator Active\n` +
    `Tokens (est): ${totalTokens}\n` +
    `Energy (est): ${totalEnergyKwh.toFixed(4)} kWh\n` +
    `Msgs counted: ${countedCount}`;
}

// --- Storage helpers ---
async function getState() {
  const res = await safeStorageGet([
    "totalTokens",
    "totalEnergyKwh",
    "totalCO2g",
    "countedKeys",
  ]);
  if (!res) {
    return { totalTokens: 0, totalEnergyKwh: 0, countedSet: new Set() };
  }

  const {
    totalTokens = 0,
    totalEnergyKwh = 0,
    totalCO2g = 0,
    countedKeys = [], // store as array; Set isn't serializable
  } = res;

  const migratedEnergyKwh =
    totalEnergyKwh || (totalCO2g ? (totalCO2g / 1000) / KG_CO2_PER_KWH : 0);

  return {
    totalTokens,
    totalEnergyKwh: migratedEnergyKwh,
    countedSet: new Set(countedKeys),
  };
}

async function saveState(totalTokens, totalEnergyKwh, countedSet) {
  await safeStorageSet({
    totalTokens,
    totalEnergyKwh,
    countedKeys: Array.from(countedSet),
  });
}

// --- Core: scan messages, count only unseen ones ---
async function scanAndCount() {
  if (!EXT_CONTEXT_VALID) return;

  const convId = getConversationId();
  const nodes = getMessageNodes();

  if (nodes.length === 0) return;

  const state = await getState();
  let { totalTokens, totalEnergyKwh, countedSet } = state;
  const settings = await getSettings();

  let addedTokens = 0;
  let newlyCounted = 0;

  for (const node of nodes) {
    const text = extractText(node);
    if (!text) continue;

    const role = inferRole(node);
    const key = `${convId}:${role}:${hashString(text)}`;

    if (countedSet.has(key)) continue; // already counted (prevents double count)

    const t = estimateTokens(text);
    addedTokens += t;
    countedSet.add(key);
    newlyCounted += 1;
  }

  if (addedTokens > 0) {
    totalTokens += addedTokens;
    const addedEnergyKwh = (addedTokens / 1000) * KWH_PER_1K_TOKENS;
    totalEnergyKwh += addedEnergyKwh;
    await saveState(totalTokens, totalEnergyKwh, countedSet);

    if (settings.orgId && settings.userId && settings.deviceId) {
      const record = {
        org_id: settings.orgId,
        user_id: settings.userId,
        device_id: settings.deviceId,
        start_time: new Date().toISOString(),
        state: "LLM usage",
        duration_seconds: 0,
        energy_drained_mwh: Number((addedEnergyKwh * MWH_PER_KWH).toFixed(4)),
      };
      await appendPendingRecord(record);
      await sendRecord(record, settings);
    }
  }

  updateBadge(totalTokens, totalEnergyKwh, countedSet.size);

  if (newlyCounted > 0) {
    console.log(
      `LLM Energy Estimator: +${addedTokens} tokens from ${newlyCounted} new message(s) in conv ${convId}`
    );
  }
}

// --- Observe DOM changes and rescan (debounced) ---
let timer = null;
function scheduleScan() {
  if (timer) return;
  timer = setTimeout(async () => {
    timer = null;
    try {
      await scanAndCount();
    } catch (e) {
      if (isInvalidationError(e)) return;
      console.warn("LLM Carbon Estimator scan error:", e);
    }
  }, 300);
}

ensureBadge();
scheduleScan();

const obs = new MutationObserver(scheduleScan);
obs.observe(document.documentElement, { childList: true, subtree: true });

window.addEventListener("beforeunload", () => {
  try { obs.disconnect(); } catch {}
});

// Also rescan on URL path changes (SPA navigation sometimes doesn’t reload the page)
let lastPath = location.pathname;
setInterval(() => {
  if (!EXT_CONTEXT_VALID) return;
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    scheduleScan();
  }
}, 500);
