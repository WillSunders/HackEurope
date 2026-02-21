async function load() {
  const { totalTokens = 0, totalEnergyKwh = 0, totalCO2g = 0 } =
    await chrome.storage.local.get([
      "totalTokens",
      "totalEnergyKwh",
      "totalCO2g",
    ]);

  document.getElementById("tokens").textContent = String(totalTokens);
  const energyKwh =
    totalEnergyKwh ||
    (totalCO2g ? (totalCO2g / 1000) / 0.187 : 0);
  document.getElementById("energy").textContent = `${energyKwh.toFixed(4)} kWh`;
}

document.getElementById("reset").addEventListener("click", async () => {
  await chrome.storage.local.set({ totalTokens: 0, totalEnergyKwh: 0, totalCO2g: 0 });
  await load();
});

load();
