"""
BC-FL Interactive Demo Backend
FastAPI server serving the interactive web dashboard and coordinating Federated Learning rounds,
Multi-Armed Bandit participant selection, Shapley value calculations,
Adversarial Poisoning Attacks, and Blockchain Byzantine Defense Consensus with Slashing.

Reference: 'Towards blockchain-enabled decentralized and secure federated learning'
Published in Information Sciences, Volume 665, April 2024.
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

from utils.security import BlockchainSecurityEngine

app = FastAPI(title="BC-FL Interactive Dashboard", version="2.0.0")

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

security_engine = BlockchainSecurityEngine()


class DemoState:
    def __init__(self, num_clients: int = 100):
        self.num_clients = num_clients
        self.selection_method = "Bandit"
        self.sample_size = 4
        self.max_rounds = 20
        self.malicious_ratio = 0.20  # 20% adversaries by default
        self.attack_type = "Sign-Flipping"  # Sign-Flipping, Label-Flipping, Extreme Noise
        self.defense_method = "Cosine-Filter"  # Cosine-Filter, Multi-Krum, Trimmed-Mean, None
        self.reset()

    def reset(
        self,
        selection_method: Optional[str] = None,
        sample_size: Optional[int] = None,
        max_rounds: Optional[int] = None,
        malicious_ratio: Optional[float] = None,
        attack_type: Optional[str] = None,
        defense_method: Optional[str] = None,
    ):
        self.is_running = False
        self.current_round = 0
        if max_rounds is not None:
            self.max_rounds = max_rounds
        if sample_size is not None:
            self.sample_size = sample_size
        if selection_method is not None:
            self.selection_method = selection_method
        if malicious_ratio is not None:
            self.malicious_ratio = max(0.0, min(0.50, malicious_ratio))
        if attack_type is not None:
            self.attack_type = attack_type
        if defense_method is not None:
            self.defense_method = defense_method

        self.explore_ratio = 0.9 if self.selection_method == "Bandit" else 0.0
        self.mode = "fast"

        # Performance tracking
        self.global_accuracy = 10.0  # Initial ~10% for CIFAR-10
        self.global_loss = 2.30
        self.history: List[Dict] = []
        self.batch_quality = 0.0

        # Security & Blockchain Audit metrics
        self.attacks_attempted = 0
        self.attacks_intercepted = 0
        self.total_slashed_stake = 0.0
        self.slashed_clients: List[int] = []

        # Designate malicious adversary clients based on ratio
        num_malicious = int(self.num_clients * self.malicious_ratio)
        # Seeded selection for consistency, spaced out across the 100 nodes
        random.seed(42)
        all_ids = list(range(1, self.num_clients + 1))
        self.malicious_clients: List[int] = sorted(random.sample(all_ids, num_malicious))
        random.seed(int(time.time()))

        # Clients state
        self.unexplored = list(range(1, self.num_clients + 1))
        self.explored: Dict[int, float] = {}  # client_id -> shapley score
        self.client_meta: Dict[int, Dict] = {}

        # Initialize realistic Non-IID heterogeneous client pool
        for cid in range(1, self.num_clients + 1):
            dominant_class = (cid * 3) % 10
            is_malicious = cid in self.malicious_clients

            if is_malicious:
                tier = "Adversary (Malicious Node)"
                data_quality = round(random.uniform(0.10, 0.25), 2)
                data_size = random.randint(200, 450)
            else:
                rand_val = random.random()
                if rand_val < 0.25:
                    data_quality = round(random.uniform(0.85, 0.98), 2)
                    data_size = random.randint(650, 950)
                    tier = "Gold (High Fidelity)"
                elif rand_val < 0.70:
                    data_quality = round(random.uniform(0.50, 0.70), 2)
                    data_size = random.randint(350, 600)
                    tier = "Standard"
                else:
                    data_quality = round(random.uniform(0.20, 0.40), 2)
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
                "latest_shapley": 0.0,
                "is_malicious": is_malicious,
                "is_slashed": False,
                "stake": 100.0,  # 100 FL security deposit tokens
            }

        # Blockchain ledger state
        self.blockchain_blocks: List[Dict] = [
            {
                "block_number": 0,
                "timestamp": time.strftime("%H:%M:%S"),
                "event": "Genesis Block Deployed",
                "round": 0,
                "tx_hash": "0x0000000000000000000000000000000000000000",
                "gas_used": 21000,
                "status": "CONFIRMED",
                "details": f"BC-FL Service Market Smart Contract Initialized. Defense: {self.defense_method} | Malicious Nodes: {len(self.malicious_clients)}/100 ({int(self.malicious_ratio*100)}%)"
            }
        ]
        self.recent_events: List[str] = [
            f"BC-FL Initialized: {self.num_clients} nodes, {len(self.malicious_clients)} adversaries, Defense: {self.defense_method}."
        ]


state = DemoState()


def select_participants(state: DemoState) -> List[int]:
    sample_size = state.sample_size
    # Slashed clients are strictly blacklisted from blockchain participation
    active_pool = [c for c in range(1, state.num_clients + 1) if c not in state.slashed_clients]
    if len(active_pool) < sample_size:
        active_pool = list(range(1, state.num_clients + 1))

    if state.selection_method == "Random":
        return random.sample(active_pool, min(sample_size, len(active_pool)))

    # Bandit selection (Explore vs Exploit)
    active_unexplored = [c for c in state.unexplored if c not in state.slashed_clients]
    active_explored = {k: v for k, v in state.explored.items() if k not in state.slashed_clients}

    explore_num = min(len(active_unexplored), max(1, int(state.explore_ratio * sample_size)))
    exploit_num = sample_size - explore_num

    if len(active_explored) < exploit_num or len(active_unexplored) == 0:
        participants = random.sample(active_pool, min(sample_size, len(active_pool)))
    else:
        unexplored_sample = random.sample(active_unexplored, explore_num)
        # Select best explored clients based on Shapley score
        sorted_explored = sorted(active_explored.items(), key=lambda item: item[1], reverse=True)
        exploit_sample = [cid for cid, _ in sorted_explored[:exploit_num]]
        participants = unexplored_sample + exploit_sample

    return participants


def step_round(state: DemoState) -> Dict:
    state.current_round += 1
    rd = state.current_round

    # 1. Select participants
    selected_clients = select_participants(state)

    # 2. Blockchain Audit & Byzantine Defense Consensus
    audit = security_engine.audit_participants(
        participants=selected_clients,
        malicious_ids=state.malicious_clients,
        defense_method=state.defense_method,
        attack_type=state.attack_type,
    )

    verified_clients = audit["verified"]
    slashed_in_batch = audit["slashed"]
    attacks_in_batch = audit["attacks_in_batch"]

    state.attacks_attempted += attacks_in_batch
    state.attacks_intercepted += len(slashed_in_batch)

    # 3. Handle Slashed Adversaries
    for cid in slashed_in_batch:
        if cid not in state.slashed_clients:
            state.slashed_clients.append(cid)
        meta = state.client_meta[cid]
        meta["is_slashed"] = True
        # Slash security deposit on-chain
        slash_amount = 50.0
        meta["stake"] = max(0.0, meta["stake"] - slash_amount)
        state.total_slashed_stake += slash_amount
        meta["latest_shapley"] = -1.5  # Penalized Shapley score
        meta["times_sampled"] += 1
        meta["last_round"] = rd

        # Record Slashing Block on Blockchain
        tx_hash = "0x" + "".join(random.choices("0123456789abcdef", k=40))
        slashed_block = {
            "block_number": len(state.blockchain_blocks),
            "timestamp": time.strftime("%H:%M:%S"),
            "event": f"🚨 POISONING DETECTED & SLASHED: Node #{cid}",
            "round": rd,
            "tx_hash": tx_hash,
            "status": "SLASHED",
            "participants": [cid],
            "gas_used": 89000,
            "details": f"Adversary Node #{cid} attempted {state.attack_type}. Intercepted via {state.defense_method}. Penalty: -{int(slash_amount)} FL slashed. Node permanently blacklisted from MAB pool."
        }
        state.blockchain_blocks.append(slashed_block)
        state.recent_events.append(f"🚨 Round {rd}: Adversary Node #{cid} caught by {state.defense_method}! Slashed -{int(slash_amount)} FL tokens.")

    # 4. Calculate Shapley values for verified clients
    batch_qualities = [state.client_meta[cid]["quality"] for cid in verified_clients]
    state.batch_quality = round(sum(batch_qualities) / max(1, len(batch_qualities)), 3)

    shapley_values: Dict[int, float] = {}
    base_gain = max(0.8, (1.0 / math.sqrt(rd)) * 6.5)

    for cid in verified_clients:
        meta = state.client_meta[cid]
        meta["times_sampled"] += 1
        meta["last_round"] = rd

        noise_factor = random.uniform(0.88, 1.12)
        client_shapley = round(meta["quality"] * base_gain * noise_factor, 4)
        shapley_values[cid] = client_shapley
        meta["latest_shapley"] = client_shapley
        meta["shapley_history"].append(client_shapley)

        # Honest verified nodes receive market reward tokens
        reward = round(client_shapley * 12.5, 2)
        meta["total_reward"] += reward

        # Update explored/unexplored sets in Bandit
        if cid in state.unexplored:
            state.unexplored.remove(cid)
        state.explored[cid] = client_shapley

    # 5. Global Model Aggregation & Convergence Dynamics
    # Impact of Attack vs Defense:
    unmitigated_attacks = attacks_in_batch - len(slashed_in_batch)

    if unmitigated_attacks > 0 and state.defense_method == "None":
        # POISONING CONTAMINATES THE GLOBAL MODEL!
        # Accuracy plummets or stalls drastically, loss spikes
        penalty = 8.5 * unmitigated_attacks + random.uniform(2.0, 5.0)
        state.global_accuracy = max(11.0, round(state.global_accuracy - penalty, 2))
        state.global_loss = min(3.8, round(state.global_loss + 0.45 * unmitigated_attacks + random.uniform(0.1, 0.25), 4))

        # Compromised block
        tx_hash = "0x" + "".join(random.choices("0123456789abcdef", k=40))
        compromised_block = {
            "block_number": len(state.blockchain_blocks),
            "timestamp": time.strftime("%H:%M:%S"),
            "event": f"⚠️ VULNERABLE AGGREGATION: Model Poisoned (Round {rd})",
            "round": rd,
            "tx_hash": tx_hash,
            "status": "COMPROMISED",
            "participants": selected_clients,
            "gas_used": 65000,
            "details": f"FedAvg merged {unmitigated_attacks} poisoned update(s) without Byzantine filter. Global accuracy dropped by {round(penalty, 1)}%."
        }
        state.blockchain_blocks.append(compromised_block)
        state.recent_events.append(f"⚠️ Round {rd}: Model poisoned by {unmitigated_attacks} adversarial update(s)! Accuracy fell to {state.global_accuracy}%.")

    else:
        # DEFENSE ACTIVE OR ALL PARTICIPANTS HONEST: Healthy convergence!
        if state.selection_method == "Bandit":
            target_acc = 10.0 + (77.5 * (1.0 - math.exp(-0.16 * rd))) + random.uniform(-0.4, 0.4)
            state.global_accuracy = min(88.5, round(target_acc, 2))
            state.global_loss = max(0.25, round(2.30 * math.exp(-0.12 * rd) + random.uniform(-0.02, 0.02), 4))
            state.explore_ratio = max(0.15, round(state.explore_ratio * 0.94, 3))
        else:
            target_acc = 10.0 + (38.0 * (1.0 - math.exp(-0.09 * rd))) + random.uniform(-0.8, 0.8)
            state.global_accuracy = min(49.5, round(target_acc, 2))
            state.global_loss = max(0.95, round(2.30 * math.exp(-0.045 * rd) + random.uniform(-0.03, 0.03), 4))

        # Verified Settlement Block
        tx_hash = "0x" + "".join(random.choices("0123456789abcdef", k=40))
        verified_block = {
            "block_number": len(state.blockchain_blocks),
            "timestamp": time.strftime("%H:%M:%S"),
            "event": f"✅ BLOCK MINED: Round {rd} Verified ({state.defense_method})",
            "round": rd,
            "tx_hash": tx_hash,
            "status": "VERIFIED",
            "participants": verified_clients,
            "gas_used": 58000 + len(verified_clients) * 11000,
            "details": f"Aggregated {len(verified_clients)} verified node(s). Defense: {state.defense_method}. Model Accuracy: {state.global_accuracy}%."
        }
        state.blockchain_blocks.append(verified_block)
        state.recent_events.append(f"✅ Round {rd}: {len(verified_clients)} verified updates aggregated via {state.defense_method}. Acc: {state.global_accuracy}%.")

    resistance_pct = round((state.attacks_intercepted / max(1, state.attacks_attempted)) * 100, 1)

    round_record = {
        "round": rd,
        "accuracy": state.global_accuracy,
        "loss": state.global_loss,
        "participants": selected_clients,
        "verified_clients": verified_clients,
        "slashed_clients": slashed_in_batch,
        "attacks_in_batch": attacks_in_batch,
        "shapley": shapley_values,
        "batch_quality": state.batch_quality,
        "selection_method": state.selection_method,
        "defense_method": state.defense_method,
        "attack_type": state.attack_type,
        "resistance_rate": resistance_pct,
        "timestamp": time.strftime("%H:%M:%S"),
    }
    state.history.append(round_record)

    if len(state.recent_events) > 20:
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
    top_contributors = sorted(
        state.client_meta.values(),
        key=lambda x: x["latest_shapley"],
        reverse=True
    )[:10]

    resistance_rate = round(
        (state.attacks_intercepted / max(1, state.attacks_attempted)) * 100, 1
    ) if state.attacks_attempted > 0 else 100.0

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
        "recent_blocks": state.blockchain_blocks[-8:],
        "recent_events": state.recent_events,
        # Security & Byzantine Attack Defense Stats
        "security": {
            "defense_method": state.defense_method,
            "attack_type": state.attack_type,
            "malicious_ratio": state.malicious_ratio,
            "malicious_count": len(state.malicious_clients),
            "slashed_count": len(state.slashed_clients),
            "attacks_attempted": state.attacks_attempted,
            "attacks_intercepted": state.attacks_intercepted,
            "resistance_rate": resistance_rate,
            "total_slashed_stake": state.total_slashed_stake,
            "is_fortified": state.defense_method != "None",
        },
        "all_clients": [
            {
                "id": c["id"],
                "tier": c.get("tier", "Standard"),
                "quality": c["quality"],
                "times_sampled": c["times_sampled"],
                "latest_shapley": c["latest_shapley"],
                "total_reward": round(c["total_reward"], 1),
                "stake": round(c.get("stake", 100.0), 1),
                "is_malicious": c["is_malicious"],
                "is_slashed": c["is_slashed"],
                "is_explored": c["id"] in state.explored,
                "is_current": (c["id"] in state.history[-1]["participants"]) if state.history else False,
            }
            for c in state.client_meta.values()
        ],
    }


class ConfigModel(BaseModel):
    sample_size: Optional[int] = 4
    selection_method: Optional[str] = "Bandit"
    max_rounds: Optional[int] = 20
    malicious_ratio: Optional[float] = 0.20
    attack_type: Optional[str] = "Sign-Flipping"
    defense_method: Optional[str] = "Cosine-Filter"


@app.post("/api/config")
def update_config(cfg: ConfigModel):
    if cfg.sample_size is not None:
        state.sample_size = cfg.sample_size
    if cfg.selection_method is not None:
        state.selection_method = cfg.selection_method
    if cfg.max_rounds is not None:
        state.max_rounds = cfg.max_rounds
    if cfg.malicious_ratio is not None:
        state.malicious_ratio = cfg.malicious_ratio
        # Re-sample adversaries
        num_mal = int(state.num_clients * state.malicious_ratio)
        random.seed(42)
        state.malicious_clients = sorted(random.sample(list(range(1, state.num_clients + 1)), num_mal))
        random.seed(int(time.time()))
        for cid, meta in state.client_meta.items():
            meta["is_malicious"] = cid in state.malicious_clients
    if cfg.attack_type is not None:
        state.attack_type = cfg.attack_type
    if cfg.defense_method is not None:
        state.defense_method = cfg.defense_method

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
    malicious_ratio: Optional[float] = None
    attack_type: Optional[str] = None
    defense_method: Optional[str] = None


@app.post("/api/reset")
def reset_training(cfg: Optional[ResetConfig] = None):
    method = cfg.selection_method if cfg and cfg.selection_method else state.selection_method
    sample_sz = cfg.sample_size if cfg and cfg.sample_size else state.sample_size
    max_rds = cfg.max_rounds if cfg and cfg.max_rounds else state.max_rounds
    mal_ratio = cfg.malicious_ratio if cfg and cfg.malicious_ratio is not None else state.malicious_ratio
    atk_type = cfg.attack_type if cfg and cfg.attack_type else state.attack_type
    def_method = cfg.defense_method if cfg and cfg.defense_method else state.defense_method

    state.reset(
        selection_method=method,
        sample_size=sample_sz,
        max_rounds=max_rds,
        malicious_ratio=mal_ratio,
        attack_type=atk_type,
        defense_method=def_method,
    )
    return {
        "status": "reset",
        "selection_method": state.selection_method,
        "defense_method": state.defense_method,
        "malicious_ratio": state.malicious_ratio,
    }
