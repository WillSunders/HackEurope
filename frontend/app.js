const pricePerTonEl = document.getElementById("pricePerTon");
const runningTotalEl = document.getElementById("runningTotal");
const totalAmountEl = document.getElementById("totalAmount");
const form = document.getElementById("checkoutForm");
const metricTonsInput = document.getElementById("metricTons");
const statusMessage = document.getElementById("statusMessage");
const checkoutButton = document.getElementById("checkoutButton");

let unitAmount = 0;
let currency = "usd";
let minimumOrderTons = 5;

function formatCurrency(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format(amount / 100);
}

function formatTons(value) {
  return `${value.toFixed(1)} tons`;
}

function showStatus(message) {
  statusMessage.textContent = message;
  statusMessage.hidden = false;
}

async function loadClimateProduct() {
  const response = await fetch("/api/climate/product");
  if (!response.ok) throw new Error("Unable to load climate pricing.");
  const data = await response.json();
  unitAmount = data.unitAmount;
  currency = data.currency;
  minimumOrderTons = data.minimumOrderTons;
  pricePerTonEl.textContent = `${formatCurrency(unitAmount)} per ton`;
}

async function loadRunningTotal() {
  const response = await fetch("/api/offset/summary");
  if (!response.ok) return;
  const data = await response.json();
  runningTotalEl.textContent = `${data.totalTons.toFixed(1)} tons`;
}

function updateTotal() {
  const metricTons = Number(metricTonsInput.value || 0);
  const total = Math.round(unitAmount * metricTons);
  totalAmountEl.textContent = formatCurrency(total);
}

function handleQueryState() {
  const params = new URLSearchParams(window.location.search);
  if (params.has("success")) {
    showStatus(
      `Payment complete. Your order will be batched once the total reaches ${minimumOrderTons} tons.`
    );
  }
  if (params.has("canceled")) {
    showStatus("Checkout canceled. You can update the amount and try again.");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  checkoutButton.disabled = true;
  const metricTons = Number(metricTonsInput.value);

  try {
    const response = await fetch("/api/checkout/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metricTons })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Unable to start checkout.");
    }

    window.location.href = data.url;
  } catch (err) {
    showStatus(err.message);
    checkoutButton.disabled = false;
  }
});

metricTonsInput.addEventListener("input", updateTotal);

(async () => {
  try {
    await loadClimateProduct();
    updateTotal();
    await loadRunningTotal();
    handleQueryState();
  } catch (err) {
    showStatus(err.message);
  }
})();
