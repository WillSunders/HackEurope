async function load() {
  const { totalTokens = 0, totalEnergyKwh = 0, totalCO2g = 0 } =
    await chrome.storage.local.get([
      "totalTokens",
      "totalEnergyKwh",
      "totalCO2g",
    ]);
  const {
    orgId = "",
    userId = "",
    deviceId = "",
    apiUrl = "http://localhost:4242",
    enableUpload = false,
  } = await chrome.storage.local.get([
    "orgId",
    "userId",
    "deviceId",
    "apiUrl",
    "enableUpload",
  ]);

  document.getElementById("tokens").textContent = String(totalTokens);
  const energyKwh =
    totalEnergyKwh ||
    (totalCO2g ? (totalCO2g / 1000) / 0.187 : 0);
  document.getElementById("energy").textContent = `${energyKwh.toFixed(4)} kWh`;

  const resolvedUserId = userId || crypto.randomUUID();
  const resolvedEnableUpload = enableUpload || true;

  document.getElementById("orgId").value = orgId;
  document.getElementById("userId").value = resolvedUserId;
  document.getElementById("deviceId").value = deviceId;
  document.getElementById("apiUrl").value = apiUrl;
  document.getElementById("enableUpload").checked = Boolean(resolvedEnableUpload);

  if (!userId || enableUpload !== resolvedEnableUpload) {
    await chrome.storage.local.set({
      userId: resolvedUserId,
      enableUpload: resolvedEnableUpload,
    });
  }
}

document.getElementById("reset").addEventListener("click", async () => {
  await chrome.storage.local.set({ totalTokens: 0, totalEnergyKwh: 0, totalCO2g: 0 });
  await load();
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.local.set({
    orgId: document.getElementById("orgId").value.trim(),
    userId: document.getElementById("userId").value.trim(),
    deviceId: document.getElementById("deviceId").value.trim(),
    apiUrl: document.getElementById("apiUrl").value.trim(),
    enableUpload: document.getElementById("enableUpload").checked,
  });
});

document.getElementById("download").addEventListener("click", async () => {
  const { pendingMetrics = [] } = await chrome.storage.local.get(["pendingMetrics"]);
  const lines = pendingMetrics.map((entry) => JSON.stringify(entry)).join("\n");
  const blob = new Blob([lines], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "llm-energy-metrics.jsonl";
  link.click();
  URL.revokeObjectURL(url);
});

load();
