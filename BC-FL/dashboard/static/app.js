/**
 * BC-FL Dashboard Interactive Client Logic
 * Implements Byzantine Attack Simulation and Blockchain Consensus Defense
 * (Information Sciences, April 2024)
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
          label: "Global Accuracy (%)",
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
          label: "Cross-Entropy Loss",
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
          max: 4.0,
          title: { display: true, text: "Loss", color: "#f59e0b" },
          grid: { drawOnChartArea: false },
          ticks: { color: "#f59e0b" },
        },
      },
    },
  });

  // 2. Shapley Values Bar Chart
  const ctxShap = document.getElementById("chart-shapley").getContext("2d");
  shapleyChart = new Chart(ctxShap, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Marginal Shapley Contribution",
          data: [],
          backgroundColor: function (context) {
            const val = context.raw || 0;
            return val < 0 ? "rgba(244, 63, 94, 0.85)" : "rgba(139, 92, 246, 0.75)";
          },
          borderColor: function (context) {
            const val = context.raw || 0;
            return val < 0 ? "#f43f5e" : "#8b5cf6";
          },
          borderWidth: 1.5,
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "rgba(15, 23, 42, 0.9)",
          titleFont: { family: "Outfit" },
          bodyFont: { family: "Inter" },
          callbacks: {
            label: (ctx) => `Contribution: ${ctx.raw} (Rewarded in FL-Tokens)`,
          },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#94a3b8" },
        },
        y: {
          title: { display: true, text: "Shapley Gain", color: "#64748b" },
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#8b5cf6" },
        },
      },
    },
  });
}

// Setup Event Listeners
function setupEventListeners() {
  const btnStart = document.getElementById("btn-start");
  const btnStep = document.getElementById("btn-step");
  const btnReset = document.getElementById("btn-reset");

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
    btnStep.disabled = true;
    try {
      await fetch("/api/step", { method: "POST" });
      await fetchState();
    } finally {
      btnStep.disabled = false;
    }
  });

  btnReset.addEventListener("click", async () => {
    await fetch("/api/reset", { method: "POST" });
    fetchState();
  });

  // Security & Configuration Dropdowns
  const selectDefense = document.getElementById("select-defense");
  const selectAttackType = document.getElementById("select-attack-type");
  const selectMaliciousRatio = document.getElementById("select-malicious-ratio");
  const selectAlgo = document.getElementById("select-algo");
  const selectSample = document.getElementById("select-sample");

  const updateConfig = async () => {
    const payload = {
      defense_method: selectDefense.value,
      attack_type: selectAttackType.value,
      malicious_ratio: parseFloat(selectMaliciousRatio.value),
      selection_method: selectAlgo.value,
      sample_size: parseInt(selectSample.value, 10),
    };
    await fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    fetchState();
  };

  selectDefense.addEventListener("change", updateConfig);
  selectAttackType.addEventListener("change", updateConfig);
  selectMaliciousRatio.addEventListener("change", updateConfig);
  selectAlgo.addEventListener("change", updateConfig);
  selectSample.addEventListener("change", updateConfig);
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
  const trendEl = document.getElementById("metric-acc-trend");
  if (accDiff >= 0) {
    trendEl.textContent = `+${accDiff}% from baseline`;
    trendEl.style.color = "#10b981";
  } else {
    trendEl.textContent = `${accDiff}% (Poisoned)`;
    trendEl.style.color = "#f43f5e";
  }

  document.getElementById("metric-loss").textContent = data.global_loss.toFixed(4);
  document.getElementById("metric-round").innerHTML = `${data.current_round} <span class="metric-sub">/ ${data.max_rounds}</span>`;

  const pct = Math.round((data.current_round / data.max_rounds) * 100);
  document.getElementById("metric-progress-pct").textContent = `Round ${data.current_round} completed (${pct}%)`;

  // Security Metrics
  const sec = data.security;
  document.getElementById("metric-attacks").innerHTML = `${sec.attacks_intercepted} <span class="metric-sub">/ ${sec.attacks_attempted} Intercepted</span>`;
  document.getElementById("metric-resistance-rate").textContent = `${sec.resistance_rate}% Byzantine Resistance`;

  document.getElementById("metric-slashed-stake").innerHTML = `${sec.total_slashed_stake} <span class="metric-sub">FL Slashed</span>`;
  document.getElementById("metric-slashed-count").textContent = `${sec.slashed_count} Adversary Nodes Blacklisted`;

  // Header Defense Status Pill
  const pillDefense = document.getElementById("pill-defense-status");
  const dotDefense = document.getElementById("dot-defense");
  const textDefense = document.getElementById("text-defense-status");
  const badgeChart = document.getElementById("badge-chart-defense");

  if (sec.is_fortified) {
    pillDefense.className = "status-pill server-status";
    dotDefense.className = "status-dot pulse-emerald";
    textDefense.innerHTML = `Defense: <strong>${sec.defense_method}</strong>`;
    badgeChart.textContent = `Fortified (${sec.defense_method})`;
    badgeChart.className = "badge badge-emerald";
  } else {
    pillDefense.className = "status-pill";
    pillDefense.style.borderColor = "rgba(244, 63, 94, 0.4)";
    dotDefense.className = "status-dot pulse-rose";
    textDefense.innerHTML = `Defense: <strong style="color: #f43f5e;">None (Vulnerable)</strong>`;
    badgeChart.textContent = `Vulnerable FedAvg`;
    badgeChart.className = "badge badge-rose";
  }

  // Update Callout Banner
  const calloutIcon = document.getElementById("callout-icon");
  const calloutTitle = document.getElementById("callout-title");
  const calloutDesc = document.getElementById("callout-desc");

  if (sec.is_fortified) {
    calloutIcon.textContent = "🛡️";
    calloutTitle.textContent = `Blockchain Defense (${sec.defense_method}) Fortified:`;
    calloutDesc.textContent = `Auditing local model updates using ${sec.defense_method}. When ${sec.attack_type} poisoning is attempted, the Byzantine validator consensus slashes 50 FL security deposit tokens and blacklists the adversary from future rounds.`;
  } else {
    calloutIcon.textContent = "⚠️";
    calloutTitle.textContent = "Defense Disabled (Vulnerable FedAvg):";
    calloutDesc.textContent = `Standard Federated Averaging is active with no Byzantine defense. Adversarial clients (${sec.malicious_count} in pool) injecting ${sec.attack_type} updates will successfully poison the global model, crashing accuracy!`;
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

  const chartLabel = sec.is_fortified
    ? `Accuracy (%) [${sec.defense_method} Defense]`
    : `Accuracy (%) [Vulnerable to ${sec.attack_type}]`;

  convergenceChart.data.labels = rounds;
  convergenceChart.data.datasets[0].label = chartLabel;
  convergenceChart.data.datasets[0].data = accs;
  convergenceChart.data.datasets[0].borderColor = sec.is_fortified ? "#10b981" : "#f43f5e";
  convergenceChart.data.datasets[0].backgroundColor = sec.is_fortified ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)";
  convergenceChart.data.datasets[1].data = losses;
  convergenceChart.update();

  // Update Shapley Values Bar Chart
  const top10 = data.top_contributors.slice(0, 8);
  shapleyChart.data.labels = top10.map((c) => `Node #${c.id}`);
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

    if (c.is_slashed) {
      node.classList.add("slashed");
    } else if (c.is_current) {
      node.classList.add("current");
    } else if (c.is_malicious) {
      node.classList.add("malicious");
    } else if (c.is_explored) {
      node.classList.add("explored");
    } else {
      node.classList.add("unexplored");
    }

    node.textContent = c.id;
    const role = c.is_slashed ? "SLASHED ADVERSARY" : c.is_malicious ? "Malicious Adversary" : "Honest Node";
    node.title = `Node #${c.id} [${role}] | Stake: ${c.stake} FL | Times Sampled: ${c.times_sampled}`;

    node.addEventListener("click", () => showClientDetail(c));
    container.appendChild(node);
  });
}

function showClientDetail(c) {
  const box = document.getElementById("client-detail-card");
  box.style.display = "block";

  document.getElementById("det-id").textContent = `Edge Node #${c.id} (${c.tier || "Standard"})`;
  const statusEl = document.getElementById("det-status");
  const roleEl = document.getElementById("det-role");

  if (c.is_slashed) {
    statusEl.textContent = "Slashed & Blacklisted ⚡";
    statusEl.className = "badge badge-rose";
    roleEl.textContent = "Detected Byzantine Adversary (Banned)";
    roleEl.style.color = "#f43f5e";
  } else if (c.is_malicious) {
    statusEl.textContent = "Active Adversary ⚔️";
    statusEl.className = "badge badge-rose";
    roleEl.textContent = "Malicious Node (Injecting Poison)";
    roleEl.style.color = "#f43f5e";
  } else if (c.is_current) {
    statusEl.textContent = "Active Participant (Current Round)";
    statusEl.className = "badge badge-emerald";
    roleEl.textContent = "Honest Edge Node";
    roleEl.style.color = "#10b981";
  } else if (c.is_explored) {
    statusEl.textContent = "Explored (Candidate for Bandit Exploitation)";
    statusEl.className = "badge badge-cyan";
    roleEl.textContent = "Honest Edge Node";
    roleEl.style.color = "#93c5fd";
  } else {
    statusEl.textContent = "Unexplored Node";
    statusEl.className = "badge badge-purple";
    roleEl.textContent = "Honest Edge Node";
    roleEl.style.color = "#94a3b8";
  }

  document.getElementById("det-data").textContent = `${Math.round(c.quality * 500)} (Dirichlet partitioned)`;
  document.getElementById("det-quality").textContent = `${Math.round(c.quality * 100)}% (${c.tier || "Standard"})`;
  document.getElementById("det-stake").textContent = `${c.stake} FL Tokens`;
  document.getElementById("det-sampled").textContent = `${c.times_sampled} rounds`;
  document.getElementById("det-shapley").textContent = `${c.latest_shapley > 0 ? "+" : ""}${c.latest_shapley}`;
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
      if (b.status === "SLASHED") {
        item.classList.add("status-slashed");
      } else if (b.status === "COMPROMISED") {
        item.classList.add("status-compromised");
      } else if (b.status === "VERIFIED") {
        item.classList.add("status-verified");
      }

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
    if (ev.includes("🚨") || ev.includes("Slashed")) {
      row.style.color = "#f43f5e";
    } else if (ev.includes("⚠️") || ev.includes("poisoned")) {
      row.style.color = "#f59e0b";
    } else if (ev.includes("✅")) {
      row.style.color = "#10b981";
    } else {
      row.style.color = "#38bdf8";
    }
    row.textContent = `> ${ev}`;
    term.appendChild(row);
  });
  term.scrollTop = term.scrollHeight;
}
