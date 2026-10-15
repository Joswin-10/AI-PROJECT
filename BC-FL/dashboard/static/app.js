/**
 * BC-FL Dashboard Interactive Client Logic
 */

let convergenceChart = null;
let shapleyChart = null;
let isPolling = false;
let selectedClientId = null;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  initCharts();
  setupEventListeners();
  fetchState();
  setInterval(fetchState, 1500);
});

// Setup Chart.js
function initCharts() {
  // 1. Model Convergence Chart (Dual Axis: Accuracy & Loss)
  const ctxConv = document.getElementById("chart-convergence").getContext("2d");
  convergenceChart = new Chart(ctxConv, {
    type: "line",
    data: {
      labels: [0],
      datasets: [
        {
          label: "Accuracy (%)",
          data: [10.0],
          borderColor: "#10b981",
          backgroundColor: "rgba(16, 185, 129, 0.12)",
          yAxisID: "y-acc",
          tension: 0.35,
          borderWidth: 2.5,
          pointRadius: 3,
          pointHoverRadius: 6,
          fill: true,
        },
        {
          label: "Loss",
          data: [2.3],
          borderColor: "#f59e0b",
          backgroundColor: "transparent",
          yAxisID: "y-loss",
          borderDash: [5, 5],
          tension: 0.35,
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          labels: { color: "#94a3b8", font: { family: "Inter", size: 11 } },
        },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          titleFont: { family: "Outfit" },
          bodyFont: { family: "Inter" },
          borderColor: "rgba(255, 255, 255, 0.1)",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          title: { display: true, text: "FL Training Round", color: "#64748b" },
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#64748b" },
        },
        "y-acc": {
          type: "linear",
          position: "left",
          min: 0,
          max: 100,
          title: { display: true, text: "Accuracy (%)", color: "#10b981" },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#10b981" },
        },
        "y-loss": {
          type: "linear",
          position: "right",
          min: 0,
          max: 2.5,
          title: { display: true, text: "Loss", color: "#f59e0b" },
          grid: { drawOnChartArea: false },
          ticks: { color: "#f59e0b" },
        },
      },
    },
  });

  // 2. Shapley Values Horizontal Bar Chart
  const ctxShapley = document.getElementById("chart-shapley").getContext("2d");
  shapleyChart = new Chart(ctxShapley, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Shapley Contribution Value",
          data: [],
          backgroundColor: "rgba(6, 182, 212, 0.75)",
          borderColor: "#06b6d4",
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: "y",
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          callbacks: {
            label: (ctx) => `Shapley Marginal Gain: +${ctx.raw}%`,
          },
        },
      },
      scales: {
        x: {
          title: { display: true, text: "Marginal Value Gain", color: "#64748b" },
          grid: { color: "rgba(255, 255, 255, 0.05)" },
          ticks: { color: "#94a3b8" },
        },
        y: {
          grid: { display: false },
          ticks: { color: "#f8fafc", font: { weight: 600 } },
        },
      },
    },
  });
}

// Event Listeners for Controls
function setupEventListeners() {
  const btnStart = document.getElementById("btn-start");
  const btnStep = document.getElementById("btn-step");
  const btnReset = document.getElementById("btn-reset");

  const selectAlgo = document.getElementById("select-algo");
  const selectSample = document.getElementById("select-sample");
  const selectMaxRounds = document.getElementById("select-max-rounds");

  btnStart.addEventListener("click", async () => {
    const isRunning = btnStart.dataset.running === "true";
    if (isRunning) {
      await fetch("/api/pause", { method: "POST" });
    } else {
      await fetch("/api/start", { method: "POST" });
    }
    fetchState();
  });

  btnStep.addEventListener("click", async () => {
    await fetch("/api/step", { method: "POST" });
    fetchState();
  });

  btnReset.addEventListener("click", async () => {
    if (confirm("Reset Federated Learning simulation to initial round?")) {
      await fetch("/api/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selection_method: selectAlgo.value,
          sample_size: parseInt(selectSample.value),
          max_rounds: parseInt(selectMaxRounds.value),
        }),
      });
      fetchState();
    }
  });

  const updateConfig = async () => {
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        selection_method: selectAlgo.value,
        sample_size: parseInt(selectSample.value),
        max_rounds: parseInt(selectMaxRounds.value),
      }),
    });
    fetchState();
  };

  selectAlgo.addEventListener("change", updateConfig);
  selectSample.addEventListener("change", updateConfig);
  selectMaxRounds.addEventListener("change", updateConfig);
}

// Fetch Full State from Server
async function fetchState() {
  try {
    const res = await fetch("/api/state");
    const data = await res.json();
    renderState(data);
  } catch (err) {
    console.error("Failed to fetch state:", err);
  }
}

// Render UI Components
function renderState(data) {
  // Update Buttons
  const btnStart = document.getElementById("btn-start");
  const btnLabel = document.getElementById("btn-start-label");
  if (data.is_running) {
    btnStart.dataset.running = "true";
    btnStart.classList.replace("btn-primary", "btn-secondary");
    btnLabel.textContent = "Pause Training";
  } else {
    btnStart.dataset.running = "false";
    btnStart.classList.replace("btn-secondary", "btn-primary");
    btnLabel.textContent = data.current_round >= data.max_rounds ? "Completed" : "Start Training";
  }

  // Update Ribbon Metrics
  document.getElementById("metric-acc").textContent = `${data.global_accuracy.toFixed(2)}%`;
  const initialAcc = 10.0;
  const accDiff = (data.global_accuracy - initialAcc).toFixed(2);
  document.getElementById("metric-acc-trend").textContent = `+${accDiff}% overall improvement`;

  document.getElementById("metric-loss").textContent = data.global_loss.toFixed(4);
  document.getElementById("metric-round").innerHTML = `${data.current_round} <span class="metric-sub">/ ${data.max_rounds}</span>`;

  const pct = Math.round((data.current_round / data.max_rounds) * 100);
  document.getElementById("metric-progress-pct").textContent = `${pct}% Complete`;

  document.getElementById("metric-explore").textContent = `${(data.explore_ratio * 100).toFixed(1)}%`;
  const isBandit = data.selection_method === "Bandit";
  document.getElementById("metric-explore-desc").textContent = isBandit 
    ? "Decaying exploration to exploit top nodes" 
    : "Inactive (Uniform Random Sampling)";

  // Update Batch Data Quality Metric
  if (data.batch_quality > 0) {
    document.getElementById("metric-batch-quality").textContent = `${Math.round(data.batch_quality * 100)}%`;
    document.getElementById("metric-batch-desc").textContent = isBandit
      ? "Exploiting High-Fidelity Nodes"
      : "Blind Sampling (Contains Noisy Nodes)";
  } else {
    document.getElementById("metric-batch-quality").textContent = "--%";
    document.getElementById("metric-batch-desc").textContent = "Waiting for round...";
  }

  // Update Callout Banner
  const calloutTitle = document.getElementById("callout-title");
  const calloutDesc = document.getElementById("callout-desc");
  if (isBandit) {
    calloutTitle.textContent = "Bandit (MAB) Active:";
    calloutDesc.textContent = "Intelligently recruits clients using historical Shapley contributions. Filters out noisy stragglers and exploits high-quality edge nodes, converging rapidly to ~88% accuracy.";
  } else {
    calloutTitle.textContent = "Random Selection Active:";
    calloutDesc.textContent = "Selects clients uniformly at random without valuation memory. Low-quality and noisy nodes frequently contaminate gradient updates, causing slower learning and a lower plateau at ~68-70%.";
  }

  // Update Convergence Chart
  const rounds = [0];
  const accs = [10.0];
  const losses = [2.3];

  data.history.forEach((h) => {
    rounds.push(h.round);
    accs.push(h.accuracy);
    losses.push(h.loss);
  });

  const methodLabel = isBandit ? "Bandit Accuracy (%) [Peak ~88%]" : "Random Accuracy (%) [Plateau ~49%]";
  convergenceChart.data.labels = rounds;
  convergenceChart.data.datasets[0].label = methodLabel;
  convergenceChart.data.datasets[0].data = accs;
  convergenceChart.data.datasets[1].data = losses;
  convergenceChart.update();

  // Update Shapley Values Bar Chart
  const top10 = data.top_contributors.filter((c) => c.latest_shapley > 0).slice(0, 8);
  shapleyChart.data.labels = top10.map((c) => `Client #${c.id}`);
  shapleyChart.data.datasets[0].data = top10.map((c) => c.latest_shapley);
  shapleyChart.update();

  // Render 100 Client Grid
  renderClientGrid(data.all_clients);

  // Render Blockchain Ledger
  renderLedger(data.recent_blocks);

  // Render Terminal Events
  renderEvents(data.recent_events);
}

// Render Client Node Grid
function renderClientGrid(clients) {
  const container = document.getElementById("clients-grid");
  container.innerHTML = "";

  clients.forEach((c) => {
    const node = document.createElement("div");
    node.className = "client-node";

    if (c.is_current) {
      node.classList.add("current");
    } else if (c.is_explored) {
      node.classList.add("explored");
    } else {
      node.classList.add("unexplored");
    }

    node.textContent = c.id;
    node.title = `Client #${c.id} | Times Sampled: ${c.times_sampled} | Shapley: ${c.latest_shapley}`;

    node.addEventListener("click", () => showClientDetail(c));
    container.appendChild(node);
  });
}

function showClientDetail(c) {
  const box = document.getElementById("client-detail-card");
  box.style.display = "block";

  document.getElementById("det-id").textContent = `Edge Client #${c.id} (${c.tier || 'Standard'})`;
  const statusEl = document.getElementById("det-status");
  if (c.is_current) {
    statusEl.textContent = "Active Participant (Current Round)";
    statusEl.className = "badge badge-emerald";
  } else if (c.is_explored) {
    statusEl.textContent = "Explored (Candidate for Bandit Exploitation)";
    statusEl.className = "badge badge-cyan";
  } else {
    statusEl.textContent = "Unexplored Node";
    statusEl.className = "badge badge-purple";
  }

  document.getElementById("det-data").textContent = `${Math.round(c.quality * 500)} (Dirichlet partitioned)`;
  document.getElementById("det-quality").textContent = `${Math.round(c.quality * 100)}% (${c.tier || 'Standard'})`;
  document.getElementById("det-sampled").textContent = `${c.times_sampled} rounds`;
  document.getElementById("det-shapley").textContent = `+${c.latest_shapley}`;
  document.getElementById("det-reward").textContent = `${c.total_reward} FL-Tokens`;
}

// Render Blockchain Blocks
function renderLedger(blocks) {
  const container = document.getElementById("blockchain-ledger");
  container.innerHTML = "";

  blocks
    .slice()
    .reverse()
    .forEach((b) => {
      const item = document.createElement("div");
      item.className = "ledger-item";
      item.innerHTML = `
      <div>
        <div style="font-weight: 600; color: #f8fafc;">Block #${b.block_number}: ${b.event}</div>
        <div style="font-size: 0.72rem; color: #94a3b8;">${b.details}</div>
      </div>
      <div style="text-align: right;">
        <div class="ledger-hash">${b.tx_hash.substring(0, 10)}...${b.tx_hash.substring(34)}</div>
        <div style="font-size: 0.7rem; color: #64748b;">Gas: ${b.gas_used.toLocaleString()} • ${b.timestamp}</div>
      </div>
    `;
      container.appendChild(item);
    });
}

// Render Terminal Stream
function renderEvents(events) {
  const term = document.getElementById("event-terminal");
  term.innerHTML = "";
  events.forEach((ev) => {
    const row = document.createElement("div");
    row.textContent = `> ${ev}`;
    term.appendChild(row);
  });
  term.scrollTop = term.scrollHeight;
}
