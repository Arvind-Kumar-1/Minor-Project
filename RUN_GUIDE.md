# 🚀 CodeVault - Ultimate Run Guide

Follow these steps in order to start the full P2P Marketplace with two connected nodes on a single PC.

---

## 🛠️ Step 1: Clean Up (Start Fresh)
Run this command to kill any "ghost" IPFS processes running in the background:
```cmd
taskkill /F /IM ipfs.exe
```

---

## 📡 Step 2: Configure the IPFS Nodes
Open **two separate terminals** to configure the ports correctly.

### **Terminal A (Node 1 - Primary)**
```cmd
set IPFS_PATH=%CD%\ipfs-network\node1
ipfs config Addresses.API /ip4/127.0.0.1/tcp/5001
ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8080
ipfs config Addresses.Swarm --json "[\"/ip4/0.0.0.0/tcp/4001\"]"
```

### **Terminal B (Node 2 - Peer)**
```cmd
set IPFS_PATH=%CD%\ipfs-network\node2
ipfs config Addresses.API /ip4/127.0.0.1/tcp/5002
ipfs config Addresses.Gateway /ip4/127.0.0.1/tcp/8081
ipfs config Addresses.Swarm --json "[\"/ip4/0.0.0.0/tcp/4002\"]"
```

---

## 🏃 Step 3: Start the Services
Now, start the daemons in their respective terminals:

1.  **In Terminal A (Node 1)**: `ipfs daemon`
2.  **In Terminal B (Node 2)**: `ipfs daemon`
3.  **In a New Terminal C**: 
    ```cmd
    start-all.bat
    ```
    *(This starts the Blockchain, Backend, and Frontend automatically)*

---

## 🔗 Step 4: Connect the P2P Swarm
Once both nodes are "Online," open one more terminal to link them together:

1.  **Get Node 1's ID** (From Terminal A): Look for the `PeerID` in the log.
2.  **Connect from Node 2**:
    ```cmd
    set IPFS_PATH=%CD%\ipfs-network\node2
    ipfs swarm connect /ip4/127.0.0.1/tcp/4001/p2p/<NODE1_PEER_ID>
    ```

---

## 🌐 Step 5: Access the System
*   **Web UI**: [http://localhost:3000](http://localhost:3000)
*   **Network Map**: View it on the "Dashboard" tab.
*   **Performance Test**: Use the "Benchmarks" tab with CIDs from your "My Files" page.

---

## 💡 Troubleshooting
*   **UI says "No Peer Connected"**: Restart the Backend terminal. It likely tried to connect before IPFS was ready.
*   **Port in Use error**: Run the `taskkill` command from Step 1 again.
*   **MetaMask Error**: Ensure your MetaMask is set to `Localhost 8545`.
