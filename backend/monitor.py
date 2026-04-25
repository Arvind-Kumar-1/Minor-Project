import requests
import time
import matplotlib.pyplot as plt
from datetime import datetime

# Configuration
BACKEND_URL = "http://localhost:3001"
# Sample CID to benchmark (use one from your marketplace)
TEST_CID = "QmSampleCID1234567890abcdef" 
INTERVAL = 5  # Seconds between checks

def fetch_stats():
    """Fetch real-time P2P stats from the backend."""
    try:
        response = requests.get(f"{BACKEND_URL}/api/stats")
        return response.json()
    except Exception as e:
        print(f"Error fetching stats: {e}")
        return None

def run_benchmark():
    """Measure actual P2P download speed for a specific file."""
    try:
        response = requests.get(f"{BACKEND_URL}/api/benchmark/p2p/{TEST_CID}")
        data = response.json()
        return data.get('speedMbps', 0)
    except Exception:
        return 0

def start_monitor():
    plt.style.use('dark_background')
    fig, ax = plt.subplots(figsize=(10, 6))
    
    timestamps = []
    p2p_speeds = []
    centralized_baseline = [15.0] * 20 # Static 15 Mbps baseline for comparison

    print("📊 CodeVault Performance Monitor Started...")
    plt.ion() # Turn on interactive mode for live updates

    try:
        while True:
            # 1. Collect Data
            now = datetime.now().strftime("%H:%M:%S")
            current_speed = run_benchmark()
            
            timestamps.append(now)
            p2p_speeds.append(current_speed)

            # Keep only the last 20 data points for clarity
            if len(timestamps) > 20:
                timestamps.pop(0)
                p2p_speeds.pop(0)

            # 2. Update Plot
            ax.clear()
            ax.plot(timestamps, p2p_speeds, label='P2P Speed (Mbps)', color='#6366f1', marker='o', linewidth=2)
            ax.axhline(y=15, color='red', linestyle='--', label='Centralized Baseline (Simulated)')
            
            ax.set_title("CodeVault: P2P vs Centralized Performance")
            ax.set_xlabel("Time")
            ax.set_ylabel("Speed (Mbps)")
            ax.legend(loc='upper left')
            plt.xticks(rotation=45)
            plt.grid(alpha=0.2)
            plt.tight_layout()

            plt.pause(INTERVAL)
            time.sleep(0.1)

    except KeyboardInterrupt:
        print("\nStopping monitor...")
        plt.ioff()
        plt.show()

if __name__ == "__main__":
    start_monitor()