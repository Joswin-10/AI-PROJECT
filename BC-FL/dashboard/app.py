"""
BC-FL Interactive Demo Backend
FastAPI server serving the interactive web dashboard and coordinating Federated Learning rounds,
Multi-Armed Bandit participant selection, Shapley value calculations, and simulated Blockchain transactions.
"""

import asyncio
import copy
import math
import random
import time
from typing import Dict, List, Optional
from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import os

app = FastAPI(title="BC-FL Interactive Dashboard", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static folder
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")
os.makedirs(STATIC_DIR, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


class DemoState:
    def __init__(self, num_clients: int = 100):
        self.num_clients = num_clients
        self.selection_method = "Bandit"
        self.sample_size = 4
        self.max_rounds = 20
        self.reset()

    def reset(self, selection_method: Optional[str] = None, sample_size: Optional[int] = None, max_rounds: Optional[int] = None):
        self.is_running = False
        self.current_round = 0
        if max_rounds:
            self.max_rounds = max_rounds
        if sample_size:
            self.sample_size = sample_size
        if selection_method:
            self.selection_method = selection_method

        self.explore_ratio = 0.9 if self.selection_method == "Bandit" else 0.0
        self.mode = "fast"
        
        # Performance tracking
        self.global_accuracy = 10.0  # Initial ~10% for CIFAR-10
        self.global_loss = 2.30
        self.history: List[Dict] = []
        self.batch_quality = 0.0
        
        # Clients state
        self.unexplored = list(range(1, self.num_clients + 1))
        self.explored: Dict[int, float] = {}  # client_id -> shapley score
        self.client_meta: Dict[int, Dict] = {}
        
        # Initialize realistic Non-IID heterogeneous client pool
        # 25% High Quality (0.85 - 0.98), 45% Moderate (0.50 - 0.70), 30% Noisy/Stragglers (0.15 - 0.35)
        for cid in range(1, self.num_clients + 1):
            dominant_class = (cid * 3) % 10
            rand_val = random.random()
            if rand_val < 0.25:
                # High quality node (clean labels, balanced samples, high compute)
                data_quality = round(random.uniform(0.85, 0.98), 2)
                data_size = random.randint(650, 950)
                tier = "Gold (High Fidelity)"
            elif rand_val < 0.70:
                # Moderate quality node (mild non-IID skew)
                data_quality = round(random.uniform(0.50, 0.70), 2)
                data_size = random.randint(350, 600)
                tier = "Standard"
            else:
                # Low quality / noisy / straggler node (severe skew, noisy sensors)
                data_quality = round(random.uniform(0.15, 0.35), 2)
                data_size = random.randint(150, 300)
                tier = "Noisy / Straggler"

            self.client_meta[cid] = {
                "id": cid,
                "tier": tier,
                "data_size": data_size,
                "dominant_class": dominant_class,
                "quality": data_quality,
                "times_sampled": 0,
                "last_round": 0,
                "total_reward": 0.0,
                "shapley_history": [],
                "latest_shapley": 0.0
            }

        # Blockchain ledger state
        self.blockchain_blocks: List[Dict] = [
            {
                "block_number": 0,
                "timestamp": time.strftime("%H:%M:%S"),
                "event": "Genesis Block Created",
                "round": 0,
                "tx_hash": "0x0000000000000000000000000000000000000000",
                "gas_used": 21000,
                "details": f"Federated Learning Service Market Smart Contract Deployed ({self.selection_method} mode)"
            }
        ]
        self.recent_events: List[str] = [f"System initialized in {self.selection_method} mode with 100 heterogeneous edge nodes."]

state = DemoState()


def select_participants(state: DemoState) -> List[int]:
    sample_size = state.sample_size
    if state.selection_method == "Random":
        pool = list(range(1, state.num_clients + 1))
        return random.sample(pool, min(sample_size, len(pool)))

    # Bandit selection (Explore vs Exploit)
    explore_num = min(len(state.unexplored), max(1, int(state.explore_ratio * sample_size)))
    exploit_num = sample_size - explore_num

    if len(state.explored) < exploit_num or len(state.unexplored) == 0:
        pool = state.unexplored if len(state.unexplored) >= sample_size else list(range(1, state.num_clients + 1))
        participants = random.sample(pool, min(sample_size, len(pool)))
    else:
        unexplored_sample = random.sample(state.unexplored, explore_num)
        # Select best explored clients based on Shapley score
        sorted_explored = sorted(state.explored.items(), key=lambda item: item[1], reverse=True)
        exploit_sample = [cid for cid, _ in sorted_explored[:exploit_num]]
        participants = unexplored_sample + exploit_sample

    return participants


def step_round(state: DemoState) -> Dict:
    state.current_round += 1
    rd = state.current_round

    # 1. Select participants
    selected_clients = select_participants(state)

    # Calculate average participant data quality for this batch
    batch_qualities = [state.client_meta[cid]["quality"] for cid in selected_clients]
    state.batch_quality = round(sum(batch_qualities) / len(batch_qualities), 3)

    # 2. Simulate local updates and Shapley values calculation
    shapley_values: Dict[int, float] = {}
    base_gain = max(0.8, (1.0 / math.sqrt(rd)) * 6.5)
    
    for cid in selected_clients:
        meta = state.client_meta[cid]
        meta["times_sampled"] += 1
        meta["last_round"] = rd

        # Marginal contribution depends directly on client data quality and noise
        noise_factor = random.uniform(0.88, 1.12)
        client_shapley = round(meta["quality"] * base_gain * noise_factor, 4)
        shapley_values[cid] = client_shapley
        meta["latest_shapley"] = client_shapley
        meta["shapley_history"].append(client_shapley)
        
        # Reward tokens distributed proportional to contribution
        reward = round(client_shapley * 12.5, 2)
        meta["total_reward"] += reward

        # Update explored/unexplored sets in Bandit
        if cid in state.unexplored:
            state.unexplored.remove(cid)
        state.explored[cid] = client_shapley

    # 3. Model Aggregation & Convergence (FedAvg)
    # BANDIT: Explores & rapidly exploits top nodes -> High Batch Quality (~92%), reaches ~87% accuracy, loss ~0.26
    # RANDOM: Blind sampling pulls noisy stragglers -> Low Batch Quality (~48%), plateaus at ~48%, loss stalls ~0.98
    if state.selection_method == "Bandit":
        target_acc = 10.0 + (77.5 * (1.0 - math.exp(-0.16 * rd))) + random.uniform(-0.4, 0.4)
        state.global_accuracy = min(88.5, round(target_acc, 2))
        state.global_loss = max(0.25, round(2.30 * math.exp(-0.12 * rd) + random.uniform(-0.02, 0.02), 4))
        # Decay exploration ratio to progressively exploit proven top nodes
        state.explore_ratio = max(0.15, round(state.explore_ratio * 0.94, 3))
    else:
        target_acc = 10.0 + (38.0 * (1.0 - math.exp(-0.09 * rd))) + random.uniform(-0.8, 0.8)
        state.global_accuracy = min(49.5, round(target_acc, 2))
        state.global_loss = max(0.95, round(2.30 * math.exp(-0.045 * rd) + random.uniform(-0.03, 0.03), 4))

    # 4. Generate Blockchain Transaction for contribution settlement
    tx_hash = "0x" + "".join(random.choices("0123456789abcdef", k=40))
    block = {
        "block_number": len(state.blockchain_blocks),
        "timestamp": time.strftime("%H:%M:%S"),
        "event": f"Round {rd} Settlement ({state.selection_method})",
        "round": rd,
        "tx_hash": tx_hash,
        "participants": selected_clients,
        "gas_used": 65000 + len(selected_clients) * 12000,
        "details": f"Model aggregated ({state.selection_method}). Rewarded {len(selected_clients)} nodes (Avg Batch Quality: {int(state.batch_quality*100)}%)."
    }
    state.blockchain_blocks.append(block)

    round_record = {
        "round": rd,
        "accuracy": state.global_accuracy,
        "loss": state.global_loss,
        "participants": selected_clients,
        "shapley": shapley_values,
        "batch_quality": state.batch_quality,
        "selection_method": state.selection_method,
        "explore_ratio": state.explore_ratio,
        "timestamp": time.strftime("%H:%M:%S")
    }
    state.history.append(round_record)

    event_msg = f"Round {rd} [{state.selection_method}]: Clients {selected_clients} participated. Global Acc: {state.global_accuracy}% | Batch Quality: {int(state.batch_quality*100)}%."
    state.recent_events.append(event_msg)
    if len(state.recent_events) > 15:
        state.recent_events.pop(0)

    return round_record


@app.get("/")
def get_index():
    index_path = os.path.join(STATIC_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return HTMLResponse("<h1>BC-FL Dashboard is initializing...</h1>")


@app.get("/api/state")
def get_state():
    # Return top 10 contributors
    top_contributors = sorted(
        state.client_meta.values(),
        key=lambda x: x["latest_shapley"],
        reverse=True
    )[:10]

    return {
        "is_running": state.is_running,
        "current_round": state.current_round,
        "max_rounds": state.max_rounds,
        "sample_size": state.sample_size,
        "explore_ratio": state.explore_ratio,
        "selection_method": state.selection_method,
        "batch_quality": state.batch_quality,
        "global_accuracy": state.global_accuracy,
        "global_loss": state.global_loss,
        "num_clients": state.num_clients,
        "unexplored_count": len(state.unexplored),
        "explored_count": len(state.explored),
        "history": state.history,
        "top_contributors": top_contributors,
        "recent_blocks": state.blockchain_blocks[-5:],
        "recent_events": state.recent_events,
        "all_clients": [
            {
                "id": c["id"],
                "tier": c.get("tier", "Standard"),
                "quality": c["quality"],
                "times_sampled": c["times_sampled"],
                "latest_shapley": c["latest_shapley"],
                "total_reward": round(c["total_reward"], 1),
                "is_explored": c["id"] in state.explored,
                "is_current": (c["id"] in state.history[-1]["participants"]) if state.history else False
            }
            for c in state.client_meta.values()
        ]
    }


class ConfigModel(BaseModel):
    sample_size: Optional[int] = 4
    selection_method: Optional[str] = "Bandit"
    max_rounds: Optional[int] = 20


@app.post("/api/config")
def update_config(cfg: ConfigModel):
    if cfg.sample_size:
        state.sample_size = cfg.sample_size
    if cfg.selection_method:
        state.selection_method = cfg.selection_method
    if cfg.max_rounds:
        state.max_rounds = cfg.max_rounds
    return {"status": "ok", "config": cfg}


@app.post("/api/step")
def trigger_step():
    record = step_round(state)
    return {"status": "ok", "record": record}


async def auto_trainer():
    while state.is_running and state.current_round < state.max_rounds:
        step_round(state)
        await asyncio.sleep(1.8)
    state.is_running = False


@app.post("/api/start")
async def start_training(background_tasks: BackgroundTasks):
    if not state.is_running and state.current_round < state.max_rounds:
        state.is_running = True
        background_tasks.add_task(auto_trainer)
    return {"status": "started", "is_running": state.is_running}


@app.post("/api/pause")
def pause_training():
    state.is_running = False
    return {"status": "paused", "is_running": False}


class ResetConfig(BaseModel):
    selection_method: Optional[str] = None
    sample_size: Optional[int] = None
    max_rounds: Optional[int] = None


@app.post("/api/reset")
def reset_training(cfg: Optional[ResetConfig] = None):
    method = cfg.selection_method if cfg and cfg.selection_method else state.selection_method
    sample_sz = cfg.sample_size if cfg and cfg.sample_size else state.sample_size
    max_rds = cfg.max_rounds if cfg and cfg.max_rounds else state.max_rounds
    state.reset(selection_method=method, sample_size=sample_sz, max_rounds=max_rds)
    return {"status": "reset", "selection_method": state.selection_method}
