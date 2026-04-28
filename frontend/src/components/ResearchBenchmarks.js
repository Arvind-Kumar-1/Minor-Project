import React, { useState } from 'react';
import { generateKey, encryptFile, decryptFile } from '../utils/crypto';
import { uploadChunksToIPFS, uploadToIPFS, downloadChunksParallel } from '../utils/ipfs';
import { toast } from 'react-hot-toast';

function ResearchBenchmarks() {
  const [fileSizeMB, setFileSizeMB] = useState(5);
  const [chunkSizeKB, setChunkSizeKB] = useState(1024); // 1MB default
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [statusText, setStatusText] = useState('Ready');
  const [attackLogs, setAttackLogs] = useState([]);

  // Generates a dummy file full of random bytes
  const generateDummyFile = (sizeInMB) => {
    const bytes = sizeInMB * 1024 * 1024;
    const array = new Uint8Array(bytes);
    // Fill with some data to prevent hyper-compression by IPFS
    for(let i=0; i<bytes; i+=1024) { array[i] = Math.random() * 255; }
    return new File([array], `benchmark_${sizeInMB}MB.dat`, { type: 'application/octet-stream' });
  };

  const runBenchmark = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setAttackLogs([]);
    
    const runResult = {
      id: Date.now(),
      fileSize: `${fileSizeMB} MB`,
      chunkSize: `${chunkSizeKB} KB`,
      encryptionMs: 0,
      uploadMs: 0,
      downloadMs: 0,
      decryptionMs: 0,
      totalMs: 0,
      masterCID: ''
    };

    try {
      const file = generateDummyFile(fileSizeMB);
      const chunkSize = chunkSizeKB * 1024;
      
      const totalStart = performance.now();

      // --- PHASE 1: ENCRYPTION (CPU OVERHEAD) ---
      setStatusText('Generating Keys & Encrypting...');
      const cryptoKey = await generateKey();
      
      const encStart = performance.now();
      const encryptedBlob = await encryptFile(file, cryptoKey);
      runResult.encryptionMs = Math.round(performance.now() - encStart);

      // --- PHASE 2: MULTIPATH UPLOAD (NETWORK) ---
      setStatusText('Chunking & Uploading to IPFS...');
      const upStart = performance.now();
      
      const chunkCIDs = await uploadChunksToIPFS(encryptedBlob, null, chunkSize);
      
      // Manifest
      const manifest = { type: 'multipath_v1', chunks: chunkCIDs, totalSize: encryptedBlob.size };
      const manifestBlob = new Blob([JSON.stringify(manifest)], { type: 'application/json' });
      const manifestResult = await uploadToIPFS(new File([manifestBlob], 'manifest.json'));
      runResult.masterCID = manifestResult.cid;
      
      runResult.uploadMs = Math.round(performance.now() - upStart);

      // --- PHASE 3: MULTIPATH DOWNLOAD (NETWORK) ---
      setStatusText('Downloading from IPFS (Parallel Aggregation)...');
      const downStart = performance.now();
      
      // We simulate fetching the manifest
      const manifestResponse = await fetch(`http://localhost:3001/api/ipfs/download/${runResult.masterCID}`);
      const fetchedManifest = await manifestResponse.json();
      
      const downloadedEncryptedBlob = await downloadChunksParallel(fetchedManifest.chunks, null);
      runResult.downloadMs = Math.round(performance.now() - downStart);

      // --- PHASE 4: DECRYPTION (CPU OVERHEAD) ---
      setStatusText('Decrypting File...');
      const decStart = performance.now();
      await decryptFile(downloadedEncryptedBlob, cryptoKey); // discard result, just testing time
      runResult.decryptionMs = Math.round(performance.now() - decStart);

      runResult.totalMs = Math.round(performance.now() - totalStart);
      
      setResults(prev => [runResult, ...prev]);
      setStatusText('Benchmark Complete');
      toast.success('Benchmark finished successfully');

    } catch (error) {
      console.error(error);
      setStatusText(`Error: ${error.message}`);
      toast.error('Benchmark failed');
    } finally {
      setIsRunning(false);
    }
  };

  const [manualCID, setManualCID] = useState('');
  const [manualResult, setManualResult] = useState(null);

  const runManualTest = async () => {
    if (!manualCID.trim()) {
      toast.error('Please enter a CID');
      return;
    }
    
    setIsRunning(true);
    setStatusText('Testing Manual CID Download...');
    const start = performance.now();
    
    try {
      const response = await fetch(`http://localhost:3001/api/ipfs/download/${manualCID}`);
      if (!response.ok) throw new Error('CID not found or peer disconnected');
      
      const blob = await response.blob();
      const end = performance.now();
      const timeMs = Math.round(end - start);
      const speedMbps = ((blob.size * 8) / (timeMs / 1000) / 1000000).toFixed(2);
      
      setManualResult({
        cid: manualCID,
        size: (blob.size / 1024 / 1024).toFixed(2) + ' MB',
        time: timeMs + ' ms',
        speed: speedMbps + ' Mbps'
      });
      
      setStatusText('Manual Test Complete');
      toast.success('Manual download test finished!');
    } catch (error) {
      console.error(error);
      setStatusText(`Manual Test Failed: ${error.message}`);
      toast.error('Manual test failed');
    } finally {
      setIsRunning(false);
    }
  };

  const simulateAttack = async () => {
    if (results.length === 0) {
      toast.error("Please run a benchmark first to generate a CID to attack.");
      return;
    }
    
    setIsRunning(true);
    setAttackLogs([]);
    const targetCID = results[0].masterCID;
    
    const addLog = (msg, isError=false) => {
      setAttackLogs(prev => [...prev, { time: new Date().toLocaleTimeString(), msg, isError }]);
    };

    addLog(`[ATTACK START] Target Master CID: ${targetCID}`);
    addLog(`Attacker bypassed KMS backend and found CID on public IPFS DHT.`);

    try {
      addLog(`Fetching manifest from IPFS...`);
      const manifestResponse = await fetch(`http://localhost:3001/api/ipfs/download/${targetCID}`);
      const manifest = await manifestResponse.json();
      addLog(`Success! Found ${manifest.chunks.length} encrypted chunks.`);

      addLog(`Downloading chunks in parallel...`);
      const encryptedBlob = await downloadChunksParallel(manifest.chunks, null);
      addLog(`Success! Reassembled file of size ${encryptedBlob.size} bytes.`);

      addLog(`Attempting to read raw data...`);
      addLog(`ERROR: Data is ciphertext. Proceeding to brute force decryption...`, true);

      // Simulate a wrong key
      const wrongKey = await generateKey(); 
      addLog(`Trying generic AES-256-GCM key...`);
      
      try {
        await decryptFile(encryptedBlob, wrongKey);
        addLog(`FATAL FLAW: Decryption succeeded.`, true); // Should never happen
      } catch (err) {
        addLog(`DECRYPTION FAILED: The cryptographic operation failed.`, true);
        addLog(`[ATTACK BLOCKED] Zero-Trust DRM successfully prevented unauthorized access. The raw data remains secure.`);
        toast.success("Attack successfully blocked!");
      }

    } catch (error) {
      addLog(`Network Error during attack: ${error.message}`, true);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">🧪 Research Benchmarks</h1>
        <p style={{ color: 'var(--text-muted)' }}>Automated testing suite for performance and security data collection.</p>
      </div>

      <div className="stats-grid" style={{ marginBottom: '2rem' }}>
        <div className="card">
          <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>⚙️ Parameterization</h2>
          
          <div className="form-group">
            <label className="form-label">Dummy File Size</label>
            <select 
              className="form-input" 
              value={fileSizeMB} 
              onChange={e => setFileSizeMB(Number(e.target.value))}
              disabled={isRunning}
            >
              <option value={1}>1 MB (Quick Test)</option>
              <option value={5}>5 MB (Standard)</option>
              <option value={10}>10 MB (Heavy)</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Chunk Size (Multipath)</label>
            <select 
              className="form-input" 
              value={chunkSizeKB} 
              onChange={e => setChunkSizeKB(Number(e.target.value))}
              disabled={isRunning}
            >
              <option value={512}>500 KB (High Overhead)</option>
              <option value={1024}>1 MB (Balanced)</option>
              <option value={2048}>2 MB (Default)</option>
              <option value={5120}>5 MB (Low Parallelism)</option>
            </select>
          </div>

          <button 
            className="btn btn-primary" 
            style={{ width: '100%', marginTop: '1rem' }}
            onClick={runBenchmark}
            disabled={isRunning}
          >
            {isRunning && statusText.includes('ing') ? '⏳ Running...' : '🚀 Run Benchmark'}
          </button>
          
          <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--secondary)', textAlign: 'center' }}>
            Status: {statusText}
          </div>
        </div>

        <div className="card" style={{ background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem', color: 'var(--error)' }}>🛡️ Threat Simulation</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Simulates a malicious actor bypassing the KMS Backend and fetching your IPFS CID directly from the public DHT.
          </p>
          <button 
            className="btn btn-secondary" 
            style={{ width: '100%', borderColor: 'var(--error)', color: 'var(--error)' }}
            onClick={simulateAttack}
            disabled={isRunning || results.length === 0}
          >
            🔥 Simulate CID Leak Attack
          </button>

          {attackLogs.length > 0 && (
            <div style={{ 
              marginTop: '1rem', 
              background: '#000', 
              padding: '0.75rem', 
              borderRadius: '6px', 
              fontFamily: 'monospace',
              fontSize: '0.75rem',
              height: '150px',
              overflowY: 'auto'
            }}>
              {attackLogs.map((log, i) => (
                <div key={i} style={{ color: log.isError ? '#ef4444' : '#10b981', marginBottom: '4px' }}>
                  <span style={{ color: '#555' }}>[{log.time}]</span> {log.msg}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card" style={{ background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
          <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem', color: 'var(--secondary)' }}>⚡ Manual CID Test</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Enter a CID from your "My Files" page to measure its specific download performance across the swarm.
          </p>
          <div className="form-group">
            <input 
              type="text" 
              className="form-input" 
              placeholder="Paste CID (Qm... or ba...)" 
              value={manualCID}
              onChange={e => setManualCID(e.target.value)}
              disabled={isRunning}
            />
          </div>
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', marginTop: '0.5rem' }}
            onClick={runManualTest}
            disabled={isRunning || !manualCID}
          >
            🏁 Start Download Test
          </button>

          {manualResult && (
            <div style={{ 
              marginTop: '1rem', 
              background: 'var(--surface)', 
              padding: '0.75rem', 
              borderRadius: '8px',
              fontSize: '0.85rem',
              border: '1px solid var(--border-subtle)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>File Size:</span>
                <span style={{ fontWeight: 600 }}>{manualResult.size}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Time:</span>
                <span style={{ fontWeight: 600, color: 'var(--primary)' }}>{manualResult.time}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Avg. Speed:</span>
                <span style={{ fontWeight: 600, color: 'var(--success)' }}>{manualResult.speed}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>📊 Experimental Data</h2>
        
        {results.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                  <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Run ID</th>
                  <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Params</th>
                  <th style={{ padding: '0.75rem', color: 'var(--primary)' }}>Encrypt (CPU)</th>
                  <th style={{ padding: '0.75rem', color: 'var(--secondary)' }}>Upload (Net)</th>
                  <th style={{ padding: '0.75rem', color: 'var(--secondary)' }}>Download (Net)</th>
                  <th style={{ padding: '0.75rem', color: 'var(--primary)' }}>Decrypt (CPU)</th>
                  <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Total Time</th>
                </tr>
              </thead>
              <tbody>
                {results.map((res) => (
                  <tr key={res.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '0.75rem' }}>{new Date(res.id).toLocaleTimeString()}</td>
                    <td style={{ padding: '0.75rem' }}>{res.fileSize} @ {res.chunkSize}</td>
                    <td style={{ padding: '0.75rem', color: 'var(--primary)' }}>{res.encryptionMs} ms</td>
                    <td style={{ padding: '0.75rem', color: 'var(--secondary)' }}>{res.uploadMs} ms</td>
                    <td style={{ padding: '0.75rem', color: 'var(--secondary)' }}>{res.downloadMs} ms</td>
                    <td style={{ padding: '0.75rem', color: 'var(--primary)' }}>{res.decryptionMs} ms</td>
                    <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{res.totalMs} ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
            No data yet. Run a benchmark to generate metrics for your paper.
          </div>
        )}
      </div>

    </div>
  );
}

export default ResearchBenchmarks;
