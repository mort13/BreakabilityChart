let loadouts = [];
let chart;
let marker = null;

// --- INIT ---
window.addEventListener("DOMContentLoaded", async () => {
  await loadMiningData();
  setupTabs();
  setupShipSelect();
  setupChart();
});

// --- Tabs ---
function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.target).classList.add('active');
    });
  });
}

// --- Ship selection & loadout setup ---
function setupShipSelect() {
  const shipSelect = document.getElementById('shipSelect');
  shipSelect.addEventListener('change', () => renderLaserSlots(shipSelect.value));
  renderLaserSlots(shipSelect.value);
}

function renderLaserSlots(ship) {
  const slotCount = ship === "Mole" ? 3 : 1;
  const container = document.getElementById('laserSlots');
  container.innerHTML = '';
  loadouts = [];

  for (let i = 0; i < slotCount; i++) {
    const div = document.createElement('div');
    div.className = 'laser-slot';
    div.innerHTML = `
      <h3>Laser ${i + 1}</h3>
      <label>Laserhead:</label>
      <select class="laserheadSelect">${miningData.laserheads.map(l => `<option value="${l.name}">${l.name}</option>`).join('')}</select>
      <br>
      <label>Modules:</label>
      ${[0,1,2].map(j => `<select class="moduleSelect"><option value="">None</option>${miningData.modules.map(m => `<option value="${m.name}">${m.name}</option>`).join('')}</select>`).join('')}
      <div class="stats"></div>
    `;
    container.appendChild(div);
  }
}

// --- Graph ---
function setupChart() {
  const ctx = document.getElementById('miningChart').getContext('2d');
  chart = new Chart(ctx, {
    type: 'line',
    data: { datasets: [] },
    options: {
      scales: { x: { title: { display: true, text: 'Resistance (R)' }, min: 0, max: 1 },
                y: { title: { display: true, text: 'm(R)' } } },
      plugins: { legend: { display: true } }
    }
  });
}

// Compute m(R) functions
function computeCurve(P, r_mod) {
  const data = [];
  for (let R = 0; R <= 1; R += 0.01)
    data.push({ x: R, y: P / ((1 + R * r_mod) * 0.2) });
  return data;
}

// Update marker based on user input
function updateMarker() {
  const m = parseFloat(document.getElementById('massInput').value);
  const R = parseFloat(document.getElementById('resistanceInput').value);
  if (!chart) return;

  if (marker) chart.data.datasets = chart.data.datasets.filter(ds => ds.label !== "Marker");

  chart.data.datasets.push({
    label: "Marker",
    data: [{ x: R, y: m }],
    type: "scatter",
    backgroundColor: "red",
    pointRadius: 6
  });

  chart.update();
}
