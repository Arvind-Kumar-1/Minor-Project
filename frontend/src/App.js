import React, { useState, useEffect, useCallback } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { Toaster, toast } from 'react-hot-toast';
import Marketplace from './components/Marketplace';
import Dashboard from './components/Dashboard';
import MyFiles from './components/MyFiles';
import UploadModal from './components/UploadModal';
import ResearchBenchmarks from './components/ResearchBenchmarks';
import { connectWallet, formatAddress } from './utils/web3';
import { getIPFSInfo } from './utils/ipfs';

function App() {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [networkInfo, setNetworkInfo] = useState(null);

  // Connect to MetaMask
  const handleConnectWallet = async () => {
    setIsConnecting(true);
    try {
      const { account: userAccount, contract: marketContract } = await connectWallet();
      setAccount(userAccount);
      setContract(marketContract);
      toast.success('Wallet connected!');
    } catch (error) {
      toast.error(error.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  // Fetch network info
  const fetchNetworkInfo = useCallback(async () => {
    try {
      const info = await getIPFSInfo();
      setNetworkInfo(info);
    } catch (error) {
      console.error('Failed to fetch network info:', error);
    }
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
          toast.success('Account changed');
        } else {
          setAccount(null);
          setContract(null);
        }
      });
    }
  }, []);

  // Fetch network info periodically
  useEffect(() => {
    fetchNetworkInfo();
    const interval = setInterval(fetchNetworkInfo, 10000);
    return () => clearInterval(interval);
  }, [fetchNetworkInfo]);

  return (
    <Router>
      <div className="app">
        <Toaster position="bottom-right" />
        
        {/* Navigation */}
        <nav className="navbar">
          <div className="logo">
            <div className="logo-icon">🔒</div>
            <span>CodeVault</span>
          </div>
          
          <Navigation />
          
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            {networkInfo && (
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '0.5rem',
                color: 'var(--text-muted)',
                fontSize: '0.85rem'
              }}>
                <span style={{ 
                  width: '8px', 
                  height: '8px', 
                  borderRadius: '50%', 
                  background: networkInfo.peerCount > 0 ? 'var(--success)' : 'var(--warning)'
                }}></span>
                {networkInfo.peerCount} peers
              </div>
            )}
            
            {account ? (
              <button className="wallet-btn">
                <span>🦊</span>
                <span className="wallet-address">{formatAddress(account)}</span>
              </button>
            ) : (
              <button 
                className="wallet-btn" 
                onClick={handleConnectWallet}
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : '🦊 Connect MetaMask'}
              </button>
            )}
          </div>
        </nav>

        {/* Main Content */}
        <main className="main-content">
          <Routes>
            <Route 
              path="/" 
              element={
                <Marketplace 
                  contract={contract} 
                  account={account}
                  onConnectWallet={handleConnectWallet}
                />
              } 
            />
            <Route 
              path="/dashboard" 
              element={
                <Dashboard 
                  networkInfo={networkInfo}
                  onRefresh={fetchNetworkInfo}
                />
              } 
            />
            <Route 
              path="/my-files" 
              element={
                <MyFiles 
                  contract={contract} 
                  account={account}
                  onUpload={() => setShowUploadModal(true)}
                />
              } 
            />
            <Route 
              path="/benchmarks" 
              element={
                <ResearchBenchmarks />
              } 
            />
          </Routes>
        </main>

        {/* Upload Modal */}
        {showUploadModal && (
          <UploadModal
            contract={contract}
            account={account}
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => {
              setShowUploadModal(false);
              toast.success('File uploaded successfully!');
            }}
          />
        )}
      </div>
    </Router>
  );
}

// Navigation Component
function Navigation() {
  const location = useLocation();
  
  return (
    <div className="nav-links">
      <Link 
        to="/" 
        className={`nav-link ${location.pathname === '/' ? 'active' : ''}`}
      >
        Marketplace
      </Link>
      <Link 
        to="/dashboard" 
        className={`nav-link ${location.pathname === '/dashboard' ? 'active' : ''}`}
      >
        Network
      </Link>
      <Link 
        to="/my-files" 
        className={`nav-link ${location.pathname === '/my-files' ? 'active' : ''}`}
      >
        My Files
      </Link>
      <Link 
        to="/benchmarks" 
        className={`nav-link ${location.pathname === '/benchmarks' ? 'active' : ''}`}
      >
        🧪 Benchmarks
      </Link>
    </div>
  );
}

export default App;
