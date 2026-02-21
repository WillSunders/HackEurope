console.log("LLM Carbon Estimator: content.js running on", location.href);

const TOKENS_PER_CHAR = 1 / 4;            // rough heuristic for English
const G_CO2_PER_1K_TOKENS = 0.05;         // placeholder coefficient

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

function updateBadge(totalTokens, totalCO2g, countedCount) {
  ensureBadge();
  badge.innerText =
    `LLM Carbon Estimator Active\n` +
    `Tokens (est): ${totalTokens}\n` +
    `CO₂e (est): ${Math.round(totalCO2g)} g\n` +
    `Msgs counted: ${countedCount}`;
}

// --- Storage helpers ---
async function getState() {
  const {
    totalTokens = 0,
    totalCO2g = 0,
    countedKeys = [], // store as array; Set isn't serializable
  } = await chrome.storage.local.get(["totalTokens", "totalCO2g", "countedKeys"]);

  return {
    totalTokens,
    totalCO2g,
    countedSet: new Set(countedKeys),
  };
}

async function saveState(totalTokens, totalCO2g, countedSet) {
  await chrome.storage.local.set({
    totalTokens,
    totalCO2g,
    countedKeys: Array.from(countedSet),
  });
}

// --- Core: scan messages, count only unseen ones ---
async function scanAndCount() {
  const convId = getConversationId();
  const nodes = getMessageNodes();

  if (nodes.length === 0) return;

  const state = await getState();
  let { totalTokens, totalCO2g, countedSet } = state;

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
    totalCO2g += (addedTokens / 1000) * G_CO2_PER_1K_TOKENS;
    await saveState(totalTokens, totalCO2g, countedSet);
  }

  updateBadge(totalTokens, totalCO2g, countedSet.size);

  if (newlyCounted > 0) {
    console.log(
      `LLM Carbon Estimator: +${addedTokens} tokens from ${newlyCounted} new message(s) in conv ${convId}`
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
      console.warn("LLM Carbon Estimator scan error:", e);
    }
  }, 300);
}

ensureBadge();
scheduleScan();

const obs = new MutationObserver(scheduleScan);
obs.observe(document.documentElement, { childList: true, subtree: true });

// Also rescan on URL path changes (SPA navigation sometimes doesn’t reload the page)
let lastPath = location.pathname;
setInterval(() => {
  if (location.pathname !== lastPath) {
    lastPath = location.pathname;
    scheduleScan();
  }
}, 500);