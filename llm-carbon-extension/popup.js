async function load() {
  const { totalTokens = 0, totalCO2g = 0 } = await chrome.storage.local.get([
    "totalTokens",
    "totalCO2g",
  ]);

  document.getElementById("tokens").textContent = String(totalTokens);
  document.getElementById("co2").textContent = `${Math.round(totalCO2g)} g`;
}

document.getElementById("reset").addEventListener("click", async () => {
  await chrome.storage.local.set({ totalTokens: 0, totalCO2g: 0 });
  await load();
});

load();