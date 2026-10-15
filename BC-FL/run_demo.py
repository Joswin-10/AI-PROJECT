"""
BC-FL Interactive Demo Launcher
Starts the interactive Web Dashboard and opens it in your default browser.
Usage:
    py -3.13 run_demo.py
"""

import os
import sys
import webbrowser
import threading
import time

def open_browser():
    time.sleep(1.5)
    url = "http://localhost:8000"
    print(f"\n[*] Opening BC-FL Interactive Dashboard at: {url}")
    webbrowser.open(url)

def main():
    print("=" * 65)
    print("      BC-FL: Blockchain-Based Federated Learning Market      ")
    print("                 Interactive Demo Dashboard                  ")
    print("=" * 65)
    print("[+] Model Architecture: ShuffleNetV2")
    print("[+] Client Selection:   Multi-Armed Bandit (Explore vs Exploit)")
    print("[+] Client Valuation:   Shapley Value Marginal Contributions")
    print("[+] Data Distribution:  Dirichlet Non-IID (100 Edge Nodes)")
    print("[+] Web Dashboard:      http://localhost:8000")
    print("-" * 65)

    threading.Thread(target=open_browser, daemon=True).start()

    import uvicorn
    # Change directory to repo root
    current_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(current_dir)
    sys.path.insert(0, current_dir)
    
    uvicorn.run("dashboard.app:app", host="127.0.0.1", port=8000, log_level="info")

if __name__ == "__main__":
    main()
