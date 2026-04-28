/* global BigInt */
import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { getAllFiles, checkFileAccess, purchaseFile, getFileCID, formatEther, formatAddress, signMessage } from '../utils/web3';
import { downloadFromIPFS, getIPFSUrl, downloadChunksParallel } from '../utils/ipfs';
import { importKey, decryptFile } from '../utils/crypto';

function Marketplace({ contract, account, onConnectWallet }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accessMap, setAccessMap] = useState({});
  const [purchasing, setPurchasing] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');

  // Fetch files on mount
  useEffect(() => {
    fetchFiles();
  }, [contract]);

  // Check access for all files when account changes
  useEffect(() => {
    if (account && files.length > 0) {
      checkAccessForFiles();
    }
  }, [account, files]);

  const fetchFiles = async () => {
    setLoading(true);
    try {
      if (contract) {
        const fileList = await getAllFiles(contract);
        setFiles(fileList);
      } else {
        // Demo mode - show sample files
        setFiles([
          {
            id: 1,
            title: 'React Component Library',
            description: 'A collection of 50+ reusable React components with TypeScript support',
            price: BigInt('10000000000000000'), // 0.01 ETH
            seller: '0x0000000000000000000000000000000000000000',
            totalSales: 12,
            isActive: true
          },
          {
            id: 2,
            title: 'Python ML Starter Kit',
            description: 'Complete machine learning project template with TensorFlow and PyTorch examples',
            price: BigInt('20000000000000000'), // 0.02 ETH
            seller: '0x0000000000000000000000000000000000000000',
            totalSales: 8,
            isActive: true
          },
          {
            id: 3,
            title: 'Full-Stack Web App Template',
            description: 'Node.js + React + MongoDB boilerplate with authentication',
            price: BigInt('15000000000000000'), // 0.015 ETH
            seller: '0x0000000000000000000000000000000000000000',
            totalSales: 15,
            isActive: true
          }
        ]);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      toast.error('Failed to load files');
    } finally {
      setLoading(false);
    }
  };

  const checkAccessForFiles = async () => {
    const newAccessMap = {};
    for (const file of files) {
      try {
        const hasAccess = await checkFileAccess(contract, file.id, account);
        newAccessMap[file.id] = hasAccess;
      } catch (error) {
        newAccessMap[file.id] = false;
      }
    }
    setAccessMap(newAccessMap);
  };

  const handlePurchase = async (file) => {
    if (!account) {
      toast.error('Please connect your wallet first');
      onConnectWallet();
      return;
    }

    if (!contract) {
      toast.error('Contract not available. Deploy the smart contract first.');
      return;
    }

    setPurchasing(file.id);
    try {
      await purchaseFile(contract, file.id, file.price);
      toast.success(`Successfully purchased ${file.title}!`);
      setAccessMap(prev => ({ ...prev, [file.id]: true }));
    } catch (error) {
      console.error('Purchase error:', error);
      if (error.code === 'ACTION_REJECTED') {
        toast.error('Transaction cancelled');
      } else {
        toast.error('Purchase failed: ' + (error.reason || error.message));
      }
    } finally {
      setPurchasing(null);
    }
  };

  const handleDownload = async (file) => {
    if (!contract || !account) {
      toast.error('Contract or account not available');
      return;
    }

    setDownloading(file.id);
    try {
      // 1. Get the CID from the smart contract (acts as the access check)
      const cid = await getFileCID(contract, file.id);
      toast.success(`Access verified. Requesting decryption key...`, { id: 'dl-toast' });
      
      // 2. Sign a message to prove identity to the KMS
      const message = `Requesting access key for CID: ${cid}`;
      const signature = await signMessage(message);

      // 3. Fetch the AES encryption key from the KMS Backend
      toast.loading('Verifying signature with KMS...', { id: 'dl-toast' });
      const kmsResponse = await fetch('http://localhost:3001/api/kms/get-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileId: file.id,
          cid: cid,
          signature: signature,
          address: account
        })
      });

      if (!kmsResponse.ok) {
        const err = await kmsResponse.json();
        throw new Error(err.error || 'Failed to get decryption key from KMS');
      }

      const { aesKey } = await kmsResponse.json();
      const cryptoKey = await importKey(aesKey);

      // 4. Download the Master CID blob from IPFS
      toast.loading('Fetching manifest...', { id: 'dl-toast' });
      const fileResponse = await fetch(`http://localhost:3001/api/ipfs/download/${cid}`);
      if (!fileResponse.ok) throw new Error('Failed to download file from IPFS');
      const masterBlob = await fileResponse.blob();

      let encryptedBlob;
      
      // Check if this is a multipath manifest by reading the first 50 bytes
      const headerText = await masterBlob.slice(0, 50).text();
      if (headerText.includes('multipath_v1')) {
        const manifestText = await masterBlob.text();
        const manifest = JSON.parse(manifestText);
        
        toast.loading(`Multipath Aggregation: 0/${manifest.chunks.length} chunks...`, { id: 'dl-toast' });
        encryptedBlob = await downloadChunksParallel(manifest.chunks, (completed, total) => {
          toast.loading(`Multipath Aggregation: ${completed}/${total} chunks...`, { id: 'dl-toast' });
        });
      } else {
        // Legacy single-blob file
        toast.loading('Downloading encrypted file from IPFS...', { id: 'dl-toast' });
        encryptedBlob = masterBlob;
      }

      // 5. Decrypt the file locally
      toast.loading('Decrypting file locally...', { id: 'dl-toast' });
      const decryptedBlob = await decryptFile(encryptedBlob, cryptoKey);

      // 6. Trigger standard browser download
      toast.success('Decryption successful! Downloading...', { id: 'dl-toast' });
      const url = URL.createObjectURL(decryptedBlob);
      const a = document.createElement('a');
      a.href = url;
      // Remove the .encrypted extension if it exists, or just use the title
      a.download = file.title.replace(/\s+/g, '_') + '.zip'; // Defaulting to .zip for demo
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Download failed: ' + error.message, { id: 'dl-toast' });
    } finally {
      setDownloading(null);
    }
  };

  const getFileIcon = (title) => {
    if (title.toLowerCase().includes('react')) return '⚛️';
    if (title.toLowerCase().includes('python') || title.toLowerCase().includes('ml')) return '🐍';
    if (title.toLowerCase().includes('node') || title.toLowerCase().includes('web')) return '🌐';
    if (title.toLowerCase().includes('template')) return '📄';
    return '📁';
  };

  if (loading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">🛒 Marketplace</h1>
        <button className="btn btn-secondary" onClick={fetchFiles}>
          🔄 Refresh
        </button>
      </div>

      {!account && (
        <div style={{ 
          background: 'rgba(99, 102, 241, 0.1)', 
          border: '1px solid var(--primary)',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem',
          textAlign: 'center'
        }}>
          <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
            Connect your wallet to purchase and download files
          </p>
          <button className="btn btn-primary" onClick={onConnectWallet}>
            🦊 Connect MetaMask
          </button>
        </div>
      )}

      <div className="search-container">
        <input 
          type="text" 
          className="search-input" 
          placeholder="🔍 Search files by title or description..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select 
          className="category-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="All">All Categories</option>
          <option value="Web & Templates">Web & Templates</option>
          <option value="Data & ML">Data & ML</option>
          <option value="Other">Other</option>
        </select>
      </div>

      {files.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📦</div>
          <h2 className="empty-state-title">No files available</h2>
          <p>Be the first to upload a file to the marketplace!</p>
        </div>
      ) : (
        <div className="file-grid">
          {files.filter(file => {
            const matchesSearch = file.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  file.description.toLowerCase().includes(searchQuery.toLowerCase());
            
            let fileCategory = 'Other';
            const titleLower = file.title.toLowerCase();
            if (titleLower.includes('react') || titleLower.includes('web') || titleLower.includes('template') || titleLower.includes('node')) {
              fileCategory = 'Web & Templates';
            } else if (titleLower.includes('python') || titleLower.includes('ml') || titleLower.includes('data')) {
              fileCategory = 'Data & ML';
            }
            
            const matchesCategory = categoryFilter === 'All' || fileCategory === categoryFilter;
            
            return matchesSearch && matchesCategory;
          }).map((file) => (
            <div key={file.id} className="file-card">
              <div className="file-preview">
                {getFileIcon(file.title)}
              </div>
              <div className="file-info">
                <h3 className="file-title">{file.title}</h3>
                <p className="file-description">{file.description}</p>
                <div className="file-meta">
                  <span className="file-price">
                    {formatEther(file.price)} ETH
                  </span>
                  <span className="file-sales">
                    {file.totalSales} sales
                  </span>
                </div>
                <div style={{ 
                  marginTop: '0.75rem', 
                  fontSize: '0.8rem', 
                  color: 'var(--text-muted)' 
                }}>
                  Seller: {formatAddress(file.seller)}
                </div>
                <div style={{ marginTop: '1rem' }}>
                  {accessMap[file.id] ? (
                    <button
                      className="btn btn-success"
                      style={{ width: '100%' }}
                      onClick={() => handleDownload(file)}
                      disabled={downloading === file.id}
                    >
                      {downloading === file.id ? '⏳ Downloading...' : '⬇️ Download'}
                    </button>
                  ) : account && account.toLowerCase() === file.seller.toLowerCase() ? (
                    <button className="btn btn-secondary" style={{ width: '100%' }} disabled>
                      ✅ Your File
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                      onClick={() => handlePurchase(file)}
                      disabled={purchasing === file.id || !account}
                    >
                      {purchasing === file.id ? '⏳ Processing...' : '🛒 Buy Now'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Marketplace;
