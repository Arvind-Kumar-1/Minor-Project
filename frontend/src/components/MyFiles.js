import React, { useState, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import { formatEther, formatAddress, signMessage } from '../utils/web3';
import { getFileCID } from '../utils/web3';
import { getIPFSUrl, downloadChunksParallel } from '../utils/ipfs';
import { importKey, decryptFile } from '../utils/crypto';

function MyFiles({ contract, account, onUpload }) {
  const [activeTab, setActiveTab] = useState('purchases');
  const [purchases, setPurchases] = useState([]);
  const [listings, setListings] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (contract && account) {
      fetchUserFiles();
    }
  }, [contract, account]);

  const fetchUserFiles = async () => {
    setLoading(true);
    try {
      // Get user's purchases
      const purchaseIds = await contract.getUserPurchases(account);
      const purchasedFiles = [];
      for (const id of purchaseIds) {
        const file = await contract.getFile(id);
        const cid = await contract.getFileCID(id); // Fetch the CID
        purchasedFiles.push({
          id: Number(id),
          title: file.title,
          description: file.description,
          price: file.price,
          seller: file.seller,
          cid: cid // Add CID to the object
        });
      }
      setPurchases(purchasedFiles);

      // Get user's listings
      const listingIds = await contract.getUserListings(account);
      const listedFiles = [];
      for (const id of listingIds) {
        const file = await contract.getFile(id);
        const cid = await contract.getFileCID(id); // Fetch the CID
        listedFiles.push({
          id: Number(id),
          title: file.title,
          description: file.description,
          price: file.price,
          totalSales: Number(file.totalSales),
          isActive: file.isActive,
          cid: cid // Add CID to the object
        });
      }
      setListings(listedFiles);

      // Get transaction history (FilePurchased events)
      try {
        const buyerFilter = contract.filters.FilePurchased(null, account, null);
        const sellerFilter = contract.filters.FilePurchased(null, null, account);
        
        const [buyerEvents, sellerEvents] = await Promise.all([
          contract.queryFilter(buyerFilter),
          contract.queryFilter(sellerFilter)
        ]);
        
        const allEvents = [...buyerEvents, ...sellerEvents].sort((a, b) => b.blockNumber - a.blockNumber);
        
        const txHistory = await Promise.all(allEvents.map(async (event) => {
          const block = await event.getBlock();
          const isBuyer = event.args[1].toLowerCase() === account.toLowerCase();
          return {
            id: event.transactionHash,
            fileId: Number(event.args[0]),
            type: isBuyer ? 'Purchase' : 'Sale',
            counterparty: isBuyer ? event.args[2] : event.args[1],
            price: event.args[3],
            timestamp: block.timestamp * 1000,
            hash: event.transactionHash
          };
        }));
        setTransactions(txHistory);
      } catch (txError) {
        console.error("Error fetching transactions:", txError);
      }

    } catch (error) {
      console.error('Error fetching user files:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (file) => {
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
      a.download = file.title.replace(/\s+/g, '_') + '.zip';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
      
    } catch (error) {
      console.error('Download error:', error);
      toast.error('Download failed: ' + error.message, { id: 'dl-toast' });
    }
  };

  if (!account) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">🔒</div>
        <h2 className="empty-state-title">Connect Your Wallet</h2>
        <p>Please connect your MetaMask wallet to view your files</p>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">⚙️</div>
        <h2 className="empty-state-title">Contract Not Deployed</h2>
        <p>Deploy the smart contract first by running:</p>
        <pre style={{ 
          marginTop: '1rem',
          background: 'var(--surface)',
          padding: '1rem',
          borderRadius: '8px'
        }}>
          cd blockchain && npm run deploy
        </pre>
      </div>
    );
  }

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">📁 My Files</h1>
        <button className="btn btn-primary" onClick={onUpload}>
          ➕ Upload New File
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab ${activeTab === 'purchases' ? 'active' : ''}`}
          onClick={() => setActiveTab('purchases')}
        >
          🛒 Purchased ({purchases.length})
        </button>
        <button
          className={`tab ${activeTab === 'listings' ? 'active' : ''}`}
          onClick={() => setActiveTab('listings')}
        >
          📤 My Listings ({listings.length})
        </button>
        <button
          className={`tab ${activeTab === 'transactions' ? 'active' : ''}`}
          onClick={() => setActiveTab('transactions')}
        >
          📜 Transactions ({transactions.length})
        </button>
      </div>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
        </div>
      ) : (
        <>
          {/* Purchases Tab */}
          {activeTab === 'purchases' && (
            <div>
              {purchases.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">🛍️</div>
                  <h2 className="empty-state-title">No Purchases Yet</h2>
                  <p>Browse the marketplace to find files to purchase</p>
                </div>
              ) : (
                <div className="file-grid">
                  {purchases.map((file) => (
                    <div key={file.id} className="file-card">
                      <div className="file-preview">📄</div>
                      <div className="file-info">
                        <h3 className="file-title">{file.title}</h3>
                        <p className="file-description">{file.description}</p>
                        <div style={{ 
                           fontSize: '0.85rem', 
                           color: 'var(--text-muted)',
                           marginBottom: '0.75rem'
                         }}>
                           Purchased from: {formatAddress(file.seller)}
                         </div>
                         <div style={{ 
                           marginBottom: '1rem', 
                           padding: '0.5rem',
                           background: 'var(--surface)',
                           borderRadius: '6px',
                           fontSize: '0.8rem',
                           border: '1px solid var(--border-subtle)',
                           wordBreak: 'break-all',
                           color: 'var(--primary)'
                         }}>
                           <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>IPFS CID:</div>
                           {file.cid}
                         </div>
                        <button
                          className="btn btn-success"
                          style={{ width: '100%' }}
                          onClick={() => handleDownload(file)}
                        >
                          ⬇️ Download
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Listings Tab */}
          {activeTab === 'listings' && (
            <div>
              {listings.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-state-icon">📤</div>
                  <h2 className="empty-state-title">No Listings Yet</h2>
                  <p>Upload your first file to start selling!</p>
                  <button 
                    className="btn btn-primary" 
                    style={{ marginTop: '1rem' }}
                    onClick={onUpload}
                  >
                    ➕ Upload File
                  </button>
                </div>
              ) : (
                <div className="file-grid">
                  {listings.map((file) => (
                    <div key={file.id} className="file-card">
                      <div className="file-preview">📄</div>
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
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          <span style={{ 
                            width: '8px', 
                            height: '8px', 
                            borderRadius: '50%', 
                            background: file.isActive ? 'var(--success)' : 'var(--error)'
                          }}></span>
                          <div style={{ 
                             fontSize: '0.85rem',
                             color: 'var(--text-muted)'
                           }}>
                             {file.isActive ? 'Active' : 'Inactive'}
                           </div>
                         </div>
                         <div style={{ 
                           marginTop: '0.75rem', 
                           padding: '0.5rem',
                           background: 'var(--surface)',
                           borderRadius: '6px',
                           fontSize: '0.8rem',
                           border: '1px solid var(--border-subtle)',
                           wordBreak: 'break-all',
                           color: 'var(--primary)'
                         }}>
                           <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.2rem' }}>IPFS CID:</div>
                           {file.cid}
                         </div>
                        <div style={{ 
                          marginTop: '1rem',
                          background: 'rgba(16, 185, 129, 0.1)',
                          padding: '0.75rem',
                          borderRadius: '8px',
                          textAlign: 'center'
                        }}>
                          <div style={{ 
                            fontSize: '1.25rem', 
                            fontWeight: '700',
                            color: 'var(--secondary)'
                          }}>
                            {(Number(formatEther(file.price)) * file.totalSales).toFixed(4)} ETH
                          </div>
                          <div style={{ 
                            fontSize: '0.8rem',
                            color: 'var(--text-muted)'
                          }}>
                            Total Earnings
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === 'transactions' && (
            <div className="table-container">
              {transactions.length === 0 ? (
                <div className="empty-state" style={{ padding: '3rem' }}>
                  <div className="empty-state-icon">📜</div>
                  <h2 className="empty-state-title">No Transactions Found</h2>
                  <p>Your purchase and sale history will appear here.</p>
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>File ID</th>
                      <th>Amount</th>
                      <th>From / To</th>
                      <th>Date</th>
                      <th>Tx Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>
                          <span style={{
                            padding: '0.25rem 0.75rem',
                            borderRadius: '20px',
                            fontSize: '0.85rem',
                            fontWeight: '600',
                            background: tx.type === 'Purchase' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: tx.type === 'Purchase' ? 'var(--error)' : 'var(--success)'
                          }}>
                            {tx.type}
                          </span>
                        </td>
                        <td>#{tx.fileId}</td>
                        <td style={{ fontWeight: '600', color: 'var(--text)' }}>
                          {formatEther(tx.price)} ETH
                        </td>
                        <td>{formatAddress(tx.counterparty)}</td>
                        <td>{new Date(tx.timestamp).toLocaleString()}</td>
                        <td>
                          <a 
                            href={`#`} // In a real app, link to Etherscan
                            style={{ color: 'var(--primary)', textDecoration: 'none' }}
                            title={tx.hash}
                          >
                            {formatAddress(tx.hash)}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default MyFiles;
