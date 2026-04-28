const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
const IPFS_GATEWAY = process.env.REACT_APP_IPFS_GATEWAY || 'http://127.0.0.1:8080';

/**
 * Get IPFS node info and connected peers
 */
export async function getIPFSInfo() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/ipfs/info`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Failed to get IPFS info:', error);
    return { success: false, error: error.message, peerCount: 0, peers: [] };
  }
}

/**
 * Upload file to IPFS via backend
 */
export async function uploadToIPFS(file) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${BACKEND_URL}/api/ipfs/upload`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    throw new Error('Upload failed');
  }

  return await response.json();
}

/**
 * Download file from IPFS
 */
export async function downloadFromIPFS(cid) {
  const response = await fetch(`${BACKEND_URL}/api/ipfs/get/${cid}`);
  
  if (!response.ok) {
    throw new Error('Download failed');
  }

  return await response.json();
}

/**
 * Get file from IPFS gateway (direct URL)
 */
export function getIPFSUrl(cid) {
  return `${IPFS_GATEWAY}/ipfs/${cid}`;
}

/**
 * Get network statistics
 */
export async function getNetworkStats() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/stats`);
    return await response.json();
  } catch (error) {
    console.error('Failed to get network stats:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get pinned files
 */
export async function getPinnedFiles() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/ipfs/pins`);
    return await response.json();
  } catch (error) {
    console.error('Failed to get pinned files:', error);
    return { success: false, pins: [] };
  }
}

/**
 * Pin a file to local node
 */
export async function pinFile(cid) {
  const response = await fetch(`${BACKEND_URL}/api/ipfs/pin/${cid}`, {
    method: 'POST'
  });

  return await response.json();
}

/**
 * Run download benchmark
 */
export async function benchmarkDownload(cid) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/benchmark/p2p/${cid}`);
    return await response.json();
  } catch (error) {
    console.error('Benchmark failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Connect to a specific peer
 */
export async function connectToPeer(multiaddr) {
  const response = await fetch(`${BACKEND_URL}/api/ipfs/connect`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ multiaddr })
  });

  return await response.json();
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Split a file into chunks and upload sequentially or in small batches
 * @param {Blob|File} file - The file to chunk
 * @param {Function} onProgress - Progress callback
 * @param {number} chunkSize - Size of each chunk in bytes (default 2MB)
 */
export async function uploadChunksToIPFS(file, onProgress, chunkSize = 2 * 1024 * 1024) {
  const totalChunks = Math.ceil(file.size / chunkSize);
  const chunkCIDs = [];

  for (let i = 0; i < totalChunks; i++) {
    const start = i * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    const chunkBlob = file.slice(start, end);
    const chunkFile = new File([chunkBlob], `chunk-${i}`, { type: 'application/octet-stream' });
    
    // Upload chunk
    if (onProgress) onProgress(`Uploading chunk ${i + 1}/${totalChunks}...`);
    const result = await uploadToIPFS(chunkFile);
    if (!result.success) throw new Error(`Failed to upload chunk ${i}`);
    chunkCIDs.push(result.cid);
  }
  
  return chunkCIDs;
}

/**
 * Download chunks in parallel and assemble them
 * @param {string[]} chunkCIDs - Array of CIDs
 * @param {Function} onProgress - Callback indicating completed chunks
 */
export async function downloadChunksParallel(chunkCIDs, onProgress) {
  let completed = 0;
  
  const downloadChunk = async (cid, index) => {
    const response = await fetch(`${BACKEND_URL}/api/ipfs/download/${cid}`);
    if (!response.ok) throw new Error(`Failed to download chunk ${index}`);
    const blob = await response.blob();
    return { index, blob };
  };

  // Launch all requests in parallel
  // In a production app with hundreds of chunks, you would use a concurrency pool.
  const promises = chunkCIDs.map((cid, i) => {
    return downloadChunk(cid, i).then(res => {
      completed++;
      if (onProgress) onProgress(completed, chunkCIDs.length);
      return res;
    });
  });

  const results = await Promise.all(promises);
  
  // Sort chunks back into original order
  results.sort((a, b) => a.index - b.index);
  const blobs = results.map(r => r.blob);
  
  // Reassemble the blob
  return new Blob(blobs);
}
