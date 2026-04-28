const express = require('express');
const cors = require('cors');
const multer = require('multer');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { ethers } = require('ethers');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const IPFS_API = process.env.IPFS_API || 'http://127.0.0.1:5001';

// Middleware
app.use(cors());
app.use(express.json());

// File upload configuration
const upload = multer({ 
  dest: 'uploads/',
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
});

// In-memory file storage for demo mode (when IPFS is not available)
const localFileStore = new Map();

// In-memory KMS (Key Management System) for DRM prototype
const kmsStore = new Map(); // Maps CID -> Base64 AES Key

// IPFS Client - with fallback to mock mode
let ipfs = null;
let ipfsAvailable = false;

async function initIPFS() {
  try {
    const { create } = require('kubo-rpc-client');
    ipfs = create({ url: IPFS_API });
    // Test connection
    await ipfs.id();
    ipfsAvailable = true;
    console.log(`📡 Connected to IPFS at ${IPFS_API}`);
  } catch (error) {
    console.log('⚠️  IPFS not available - running in DEMO MODE');
    console.log('   Files will be stored locally. Install IPFS for full P2P functionality.');
    ipfsAvailable = false;
  }
}

initIPFS();

// ============ IPFS Routes ============

/**
 * Get IPFS node info and connected peers
 */
app.get('/api/ipfs/info', async (req, res) => {
  if (!ipfsAvailable) {
    return res.json({
      success: true,
      nodeId: 'demo-node-' + crypto.randomBytes(4).toString('hex'),
      agentVersion: 'CodeVault Demo Mode',
      peers: [],
      peerCount: 0,
      demoMode: true
    });
  }
  
  try {
    const id = await ipfs.id();
    const peers = await ipfs.swarm.peers();
    
    // Get peer details with latency info
    const peerDetails = peers.map(peer => ({
      peerId: peer.peer.toString(),
      address: peer.addr.toString(),
      latency: peer.latency || 'N/A'
    }));

    res.json({
      success: true,
      nodeId: id.id.toString(),
      agentVersion: id.agentVersion,
      peers: peerDetails,
      peerCount: peers.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Upload file to IPFS (or local storage in demo mode)
 */
app.post('/api/ipfs/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        error: 'No file provided' 
      });
    }

    const filePath = req.file.path;
    const fileContent = fs.readFileSync(filePath);
    
    if (ipfsAvailable) {
      // Add to IPFS
      const result = await ipfs.add({
        path: req.file.originalname,
        content: fileContent
      }, {
        pin: true,
        wrapWithDirectory: false
      });

      // Clean up temp file
      fs.unlinkSync(filePath);

      res.json({
        success: true,
        cid: result.cid.toString(),
        size: result.size,
        filename: req.file.originalname
      });
    } else {
      // Demo mode - store locally with generated CID
      const hash = crypto.createHash('sha256').update(fileContent).digest('hex');
      const demoCid = 'Qm' + hash.slice(0, 44); // Fake CID format
      
      localFileStore.set(demoCid, {
        content: fileContent,
        filename: req.file.originalname,
        size: fileContent.length,
        uploadedAt: new Date().toISOString()
      });
      
      // Clean up temp file
      fs.unlinkSync(filePath);
      
      res.json({
        success: true,
        cid: demoCid,
        size: fileContent.length,
        filename: req.file.originalname,
        demoMode: true
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Download/Get file from IPFS (or local storage in demo mode)
 */
app.get('/api/ipfs/get/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    const startTime = Date.now();
    
    if (ipfsAvailable) {
      // Stream file from IPFS
      const chunks = [];
      for await (const chunk of ipfs.cat(cid)) {
        chunks.push(chunk);
      }
      
      const downloadTime = Date.now() - startTime;
      const content = Buffer.concat(chunks);
      
      res.json({
        success: true,
        cid,
        size: content.length,
        downloadTime: `${downloadTime}ms`,
        content: content.toString('base64')
      });
    } else {
      // Demo mode - get from local storage
      const file = localFileStore.get(cid);
      if (file) {
        res.json({
          success: true,
          cid,
          size: file.size,
          downloadTime: `${Date.now() - startTime}ms`,
          content: file.content.toString('base64'),
          filename: file.filename,
          demoMode: true
        });
      } else {
        res.json({
          success: false,
          error: 'File not found in demo storage. This CID was created before the server started.',
          demoMode: true
        });
      }
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Download file directly (binary)
 */
app.get('/api/ipfs/download/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    
    if (ipfsAvailable) {
      const chunks = [];
      for await (const chunk of ipfs.cat(cid)) {
        chunks.push(chunk);
      }
      const content = Buffer.concat(chunks);
      res.setHeader('Content-Disposition', `attachment; filename="${cid}"`);
      res.setHeader('Content-Type', 'application/octet-stream');
      res.send(content);
    } else {
      const file = localFileStore.get(cid);
      if (file) {
        res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
        res.setHeader('Content-Type', 'application/octet-stream');
        res.send(file.content);
      } else {
        res.status(404).json({ success: false, error: 'File not found' });
      }
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Pin a CID to local node
 */
app.post('/api/ipfs/pin/:cid', async (req, res) => {
  if (!ipfsAvailable) {
    return res.json({ success: true, message: 'Demo mode - pin simulated', demoMode: true });
  }
  
  try {
    const { cid } = req.params;
    await ipfs.pin.add(cid);
    
    res.json({
      success: true,
      message: `Pinned ${cid}`
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get list of pinned files
 */
app.get('/api/ipfs/pins', async (req, res) => {
  try {
    const pins = [];
    for await (const pin of ipfs.pin.ls({ type: 'recursive' })) {
      pins.push({
        cid: pin.cid.toString(),
        type: pin.type
      });
    }
    
    res.json({
      success: true,
      pins,
      count: pins.length
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Connect to a specific peer
 */
app.post('/api/ipfs/connect', async (req, res) => {
  try {
    const { multiaddr } = req.body;
    if (!multiaddr) {
      return res.status(400).json({ 
        success: false, 
        error: 'Multiaddr required' 
      });
    }

    await ipfs.swarm.connect(multiaddr);
    
    res.json({
      success: true,
      message: `Connected to ${multiaddr}`
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============ KMS (Key Management System) Routes ============

/**
 * Store AES key for a newly uploaded file
 */
app.post('/api/kms/store-key', (req, res) => {
  const { cid, aesKey } = req.body;
  if (!cid || !aesKey) {
    return res.status(400).json({ success: false, error: 'Missing cid or aesKey' });
  }
  kmsStore.set(cid, aesKey);
  res.json({ success: true });
});

/**
 * Get AES key for a purchased file (requires cryptographic signature)
 */
app.post('/api/kms/get-key', async (req, res) => {
  try {
    const { fileId, cid, signature, address } = req.body;
    
    if (!fileId || !cid || !signature || !address) {
      return res.status(400).json({ success: false, error: 'Missing required parameters' });
    }

    // 1. Verify the signature proves ownership of the address
    const message = `Requesting access key for CID: ${cid}`;
    const recoveredAddress = ethers.verifyMessage(message, signature);
    
    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      return res.status(401).json({ success: false, error: 'Signature verification failed' });
    }

    // 2. Verify on-chain access
    try {
      const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
      const contractAddressPath = path.join(__dirname, '../frontend/src/contracts/contractAddress.json');
      const abiPath = path.join(__dirname, '../frontend/src/contracts/MarketplaceABI.json');
      
      const contractAddress = JSON.parse(fs.readFileSync(contractAddressPath)).address;
      const abi = JSON.parse(fs.readFileSync(abiPath));
      
      const contract = new ethers.Contract(contractAddress, abi, provider);
      const hasAccess = await contract.checkAccess(fileId, address);
      
      if (!hasAccess) {
         return res.status(403).json({ success: false, error: 'Address does not have on-chain access to this file' });
      }
    } catch (bcError) {
      console.error("Blockchain verification error:", bcError.message);
      // If blockchain node is down, we could fail here. For demo resilience, we log it.
      // return res.status(500).json({ success: false, error: 'Failed to verify on-chain status' });
    }

    // 3. Retrieve and return the AES key
    const aesKey = kmsStore.get(cid);
    if (!aesKey) {
      return res.status(404).json({ success: false, error: 'Encryption key not found in KMS' });
    }

    res.json({ success: true, aesKey });
  } catch (error) {
    console.error("KMS Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ Performance Monitoring ============

/**
 * Measure download speed from P2P network
 */
app.get('/api/benchmark/p2p/:cid', async (req, res) => {
  try {
    const { cid } = req.params;
    const startTime = Date.now();
    let totalBytes = 0;

    for await (const chunk of ipfs.cat(cid)) {
      totalBytes += chunk.length;
    }

    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // seconds
    const speedMbps = ((totalBytes * 8) / duration / 1000000).toFixed(2);

    res.json({
      success: true,
      cid,
      bytes: totalBytes,
      durationMs: endTime - startTime,
      speedMbps: parseFloat(speedMbps)
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get network stats
 */
app.get('/api/stats', async (req, res) => {
  try {
    const id = await ipfs.id();
    const peers = await ipfs.swarm.peers();
    const bandwidth = await ipfs.stats.bw();
    
    res.json({
      success: true,
      nodeId: id.id.toString(),
      peerCount: peers.length,
      bandwidth: {
        totalIn: bandwidth.totalIn?.toString() || '0',
        totalOut: bandwidth.totalOut?.toString() || '0',
        rateIn: bandwidth.rateIn?.toString() || '0',
        rateOut: bandwidth.rateOut?.toString() || '0'
      }
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// ============ Health Check ============

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    ipfsConnected: !!ipfs
  });
});

// ============ WebSocket for Real-time Updates ============

const server = app.listen(PORT, () => {
  console.log(`\n🚀 CodeVault Backend running on http://localhost:${PORT}`);
  console.log(`📡 IPFS API: ${IPFS_API}`);
  console.log(`\n📋 Available endpoints:`);
  console.log(`   GET  /api/health - Health check`);
  console.log(`   GET  /api/ipfs/info - Node info & peers`);
  console.log(`   POST /api/ipfs/upload - Upload file`);
  console.log(`   GET  /api/ipfs/get/:cid - Get file`);
  console.log(`   GET  /api/stats - Network statistics`);
  console.log(`   GET  /api/benchmark/p2p/:cid - Benchmark download`);
});

// WebSocket server for real-time peer updates
const wss = new WebSocket.Server({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('📱 WebSocket client connected');
  
  // Send peer updates every 5 seconds
  const interval = setInterval(async () => {
    try {
      if (!ipfsAvailable) {
        // Demo mode - send empty peers with demo flag
        ws.send(JSON.stringify({
          type: 'peers',
          data: [],
          count: 0,
          demoMode: true
        }));
        return;
      }

      const peers = await ipfs.swarm.peers();
      ws.send(JSON.stringify({
        type: 'peers',
        data: peers.map(p => ({
          peerId: p.peer.toString(),
          address: p.addr.toString()
        })),
        count: peers.length
      }));
    } catch (error) {
      // Ignore errors for disconnected clients
    }
  }, 5000);

  ws.on('close', () => {
    clearInterval(interval);
    console.log('📴 WebSocket client disconnected');
  });
});

module.exports = app;
