console.log("LLM Carbon Estimator: content.js running on", location.href);

const TOKENS_PER_CHAR = 1 / 4; // rough heuristic for English
const G_CO2_PER_1K_TOKENS = 0.05; // placeholder coefficient (tune later)

function estimateTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.round(text.length * TOKENS_PER_CHAR));
}

async function addUsage(deltaTokens) {
  const { totalTokens = 0, totalCO2g = 0 } = await chrome.storage.local.get([
    "totalTokens",
    "totalCO2g",
  ]);

  const newTotalTokens = totalTokens + deltaTokens;
  const deltaCO2g = (deltaTokens / 1000) * G_CO2_PER_1K_TOKENS;
  const newTotalCO2g = totalCO2g + deltaCO2g;

  await chrome.storage.local.set({
    totalTokens: newTotalTokens,
    totalCO2g: newTotalCO2g,
  });

  // Optional: update badge text live
  updateBadge(newTotalTokens, newTotalCO2g);
}

// --------------------
// Visible badge (debug UI)
// --------------------
let badge = null;

function ensureBadge() {
  if (badge) return badge;

  badge = document.createElement("div");
  badge.innerText = "LLM Carbon Estimator Active";
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
  badge.style.maxWidth = "220px";
  badge.style.whiteSpace = "pre-line";
  badge.style.boxShadow = "0 4px 14px rgba(0,0,0,0.35)";

  // If body isn't ready yet, wait
  const attach = () => document.body && document.body.appendChild(badge);
  if (document.body) attach();
  else window.addEventListener("DOMContentLoaded", attach, { once: true });

  return badge;
}

function updateBadge(totalTokens, totalCO2g) {
  ensureBadge();
  badge.innerText =
    `LLM Carbon Estimator Active\n` +
    `Tokens (est): ${totalTokens}\n` +
    `CO₂e (est): ${Math.round(totalCO2g)} g`;
}

// Create badge immediately
ensureBadge();

// --------------------
// Naive text-length observer
// --------------------
let lastTextLen = 0;

const obs = new MutationObserver(async () => {
  const text = document.body?.innerText || "";
  const newLen = text.length;

  if (newLen > lastTextLen) {
    const deltaText = text.slice(lastTextLen);
    const deltaTokens = estimateTokens(deltaText);
    await addUsage(deltaTokens);
  }

  lastTextLen = newLen;
});

obs.observe(document.documentElement, { childList: true, subtree: true });

// Initialize badge with current stored totals
(async () => {
  const { totalTokens = 0, totalCO2g = 0 } = await chrome.storage.local.get([
    "totalTokens",
    "totalCO2g",
  ]);
  updateBadge(totalTokens, totalCO2g);
})();