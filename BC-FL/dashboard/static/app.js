/**
 * BC-FL System Console Logic
 */

let convergenceChart = null;
let shapleyChart = null;
let selectedClientId = null;

document.addEventListener("DOMContentLoaded", () => {
  initCharts();
  setupEventListeners();
  fetchState();
  setInterval(fetchState, 1500);
});

function initCharts() {
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
          backgroundColor: "rgba(16, 185, 129, 0.08)",
          yAxisID: "y-acc",
          tension: 0.25,
          borderWidth: 2,
          pointRadius: 2,
          pointHoverRadius: 5,
          fill: true,
        },
        {
          label: "Loss",
          data: [2.3],
          borderColor: "#f59e0b",
          backgroundColor: "transparent",
          yAxisID: "y-loss",
          borderDash: [4, 4],
          tension: 0.25,
          borderWidth: 1.5,
          pointRadius: 2,
          pointHoverRadius: 5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      interaction: {
        mode: "index",
        intersect: false,
      },
      plugins: {
        legend: {
          labels: { color: "#94a3b8", font: { family: "Inter", size: 11 } },
        },
        tooltip: {
          backgroundColor: "#0f172a",
          titleFont: { family: "Inter" },
          bodyFont: { family: "Inter" },
          borderColor: "#334155",
          borderWidth: 1,
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#64748b" },
        },
        "y-acc": {
          type: "linear",
          position: "left",
          min: 0,
          max: 100,
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#10b981" },
        },
        "y-loss": {
          type: "linear",
          position: "right",
          min: 0,
          max: 4.0,
          grid: { drawOnChartArea: false },
          ticks: { color: "#f59e0b" },
        },
      },
    },
  });

  const ctxShap = document.getElementById("chart-shapley").getContext("2d");
  shapleyChart = new Chart(ctxShap, {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          label: "Shapley Value",
          data: [],
          backgroundColor: function (context) {
            const val = context.raw || 0;
            return val < 0 ? "#f43f5e" : "#8b5cf6";
          },
          borderWidth: 0,
          borderRadius: 3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          titleFont: { family: "Inter" },
          bodyFont: { family: "Inter" },
        },
      },
      scales: {
        x: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#94a3b8" },
        },
        y: {
          grid: { color: "rgba(255, 255, 255, 0.04)" },
          ticks: { color: "#8b5cf6" },
        },
      },
    },
  });
}

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

async function fetchState() {
  try {
    const res = await fetch("/api/state");
    const data = await res.json();
    renderState(data);
  } catch (err) {
    console.error("Failed to fetch state:", err);
  }
}

function renderState(data) {
  const btnStart = document.getElementById("btn-start");
  const btnLabel = document.getElementById("btn-start-label");
  if (data.is_running) {
    btnStart.dataset.running = "true";
    btnStart.classList.replace("btn-primary", "btn-secondary");
    btnLabel.textContent = "Pause";
  } else {
    btnStart.dataset.running = "false";
    btnStart.classList.replace("btn-secondary", "btn-primary");
    btnLabel.textContent = data.current_round >= data.max_rounds ? "Done" : "Start";
  }

  // Metrics
  document.getElementById("metric-acc").textContent = `${data.global_accuracy.toFixed(2)}%`;
  document.getElementById("metric-loss").textContent = data.global_loss.toFixed(4);
  document.getElementById("metric-round").innerHTML = `${data.current_round} <span class="metric-sub">/ ${data.max_rounds}</span>`;

  const sec = data.security;
  document.getElementById("metric-attacks").innerHTML = `${sec.attacks_intercepted} <span class="metric-sub">/ ${sec.attacks_attempted}</span>`;
  document.getElementById("metric-slashed-stake").innerHTML = `${sec.total_slashed_stake} <span class="metric-sub">FL</span>`;

  // Status pill
  const pillDefense = document.getElementById("pill-defense-status");
  const dotDefense = document.getElementById("dot-defense");
  const textDefense = document.getElementById("text-defense-status");

  if (sec.is_fortified) {
    pillDefense.className = "status-pill server-status";
    dotDefense.className = "status-dot pulse-emerald";
    textDefense.innerHTML = `Defense: <strong>${sec.defense_method}</strong>`;
  } else {
    pillDefense.className = "status-pill";
    pillDefense.style.borderColor = "#f43f5e";
    dotDefense.className = "status-dot pulse-rose";
    textDefense.innerHTML = `Defense: <strong style="color: #f43f5e;">Disabled</strong>`;
  }

  // Convergence Chart
  const rounds = [0];
  const accs = [10.0];
  const losses = [2.3];

  data.history.forEach((h) => {
    rounds.push(h.round);
    accs.push(h.accuracy);
    losses.push(h.loss);
  });

  convergenceChart.data.labels = rounds;
  convergenceChart.data.datasets[0].data = accs;
  convergenceChart.data.datasets[0].borderColor = sec.is_fortified ? "#10b981" : "#f43f5e";
  convergenceChart.data.datasets[0].backgroundColor = sec.is_fortified ? "rgba(16, 185, 129, 0.08)" : "rgba(244, 63, 94, 0.08)";
  convergenceChart.data.datasets[1].data = losses;
  convergenceChart.update();

  // Shapley Bar Chart
  const top10 = data.top_contributors.slice(0, 8);
  shapleyChart.data.labels = top10.map((c) => `#${c.id}`);
  shapleyChart.data.datasets[0].data = top10.map((c) => c.latest_shapley);
  shapleyChart.update();

  // Grid & Ledger
  renderClientGrid(data.all_clients);
  renderLedger(data.recent_blocks);
  renderEvents(data.recent_events);
}

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
    node.title = `Node #${c.id} | Stake: ${c.stake} FL | Samples: ${c.times_sampled}`;
    node.addEventListener("click", () => showClientDetail(c));
    container.appendChild(node);
  });
}

function showClientDetail(c) {
  const box = document.getElementById("client-detail-card");
  box.style.display = "block";

  document.getElementById("det-id").textContent = `Client #${c.id}`;
  const statusEl = document.getElementById("det-status");
  const roleEl = document.getElementById("det-role");

  if (c.is_slashed) {
    statusEl.textContent = "Slashed";
    statusEl.className = "badge badge-rose";
    roleEl.textContent = "Adversary (Banned)";
    roleEl.style.color = "#f43f5e";
  } else if (c.is_malicious) {
    statusEl.textContent = "Adversary";
    statusEl.className = "badge badge-rose";
    roleEl.textContent = "Adversary";
    roleEl.style.color = "#f43f5e";
  } else if (c.is_current) {
    statusEl.textContent = "Active";
    statusEl.className = "badge badge-emerald";
    roleEl.textContent = "Honest";
    roleEl.style.color = "#10b981";
  } else if (c.is_explored) {
    statusEl.textContent = "Explored";
    statusEl.className = "badge badge-cyan";
    roleEl.textContent = "Honest";
    roleEl.style.color = "#93c5fd";
  } else {
    statusEl.textContent = "Unexplored";
    statusEl.className = "badge badge-purple";
    roleEl.textContent = "Honest";
    roleEl.style.color = "#94a3b8";
  }

  document.getElementById("det-data").textContent = `${Math.round(c.quality * 500)}`;
  document.getElementById("det-quality").textContent = `${c.quality.toFixed(2)}`;
  document.getElementById("det-stake").textContent = `${c.stake} FL`;
  document.getElementById("det-sampled").textContent = `${c.times_sampled}`;
  document.getElementById("det-shapley").textContent = `${c.latest_shapley > 0 ? "+" : ""}${c.latest_shapley}`;
  document.getElementById("det-reward").textContent = `${c.total_reward} FL`;
}

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
        <div style="font-weight: 500; color: #f8fafc;">${b.event}</div>
        <div style="font-size: 0.72rem; color: #94a3b8;">${b.details}</div>
      </div>
      <div style="text-align: right;">
        <div class="ledger-hash">${b.tx_hash.substring(0, 10)}...</div>
        <div style="font-size: 0.7rem; color: #64748b;">Gas: ${b.gas_used.toLocaleString()} • ${b.timestamp}</div>
      </div>
    `;
      container.appendChild(item);
    });
}

function renderEvents(events) {
  const term = document.getElementById("event-terminal");
  term.innerHTML = "";
  events.forEach((ev) => {
    const row = document.createElement("div");
    if (ev.startsWith("[AUDIT]")) {
      row.style.color = "#f43f5e";
    } else if (ev.startsWith("[WARN]")) {
      row.style.color = "#f59e0b";
    } else if (ev.startsWith("[INFO]")) {
      row.style.color = "#10b981";
    } else {
      row.style.color = "#94a3b8";
    }
    row.textContent = ev;
    term.appendChild(row);
  });
  term.scrollTop = term.scrollHeight;
}
