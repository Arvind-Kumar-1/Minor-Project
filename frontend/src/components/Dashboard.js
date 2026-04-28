import React, { useState, useEffect } from 'react';
import { getNetworkStats, formatBytes, connectToPeer } from '../utils/ipfs';
import { toast } from 'react-hot-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import NetworkGraph from './NetworkGraph';

function Dashboard({ networkInfo, onRefresh }) {
  const [stats, setStats] = useState(null);
  const [peerAddress, setPeerAddress] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    const data = await getNetworkStats();
    if (data.success) {
      setStats(data);
      
      // Update chart data with simulated Centralized vs actual P2P rates
      const p2pRate = data.bandwidth ? (parseInt(data.bandwidth.rateIn) / 1024) : 0; // KB/s
      // Simulate centralized server lagging under load compared to P2P swarm
      const centralizedRate = Math.max(10, p2pRate * 0.5 + Math.random() * 20); 
      
      setChartData(prev => {
        const newPoint = {
          time: new Date().toLocaleTimeString([], { hour12: false }), // HH:MM:SS
          'P2P Swarm': parseFloat(p2pRate.toFixed(2)),
          'Centralized Server': parseFloat(centralizedRate.toFixed(2))
        };
        const newData = [...prev, newPoint];
        // Keep last 15 points
        if (newData.length > 15) return newData.slice(newData.length - 15);
        return newData;
      });
    }
  };

  const handleConnectPeer = async () => {
    if (!peerAddress.trim()) {
      toast.error('Please enter a peer multiaddr');
      return;
    }

    setConnecting(true);
    try {
      const result = await connectToPeer(peerAddress);
      if (result.success) {
        toast.success('Connected to peer!');
        setPeerAddress('');
        onRefresh();
      } else {
        toast.error(result.error || 'Failed to connect');
      }
    } catch (error) {
      toast.error('Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div>
      <div className="section-header">
        <h1 className="section-title">📊 Network Dashboard</h1>
        <button className="btn btn-secondary" onClick={onRefresh}>
          🔄 Refresh
        </button>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">
            {networkInfo?.peerCount ?? '—'}
          </div>
          <div className="stat-label">Connected Peers</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: '1.2rem' }}>
            {networkInfo?.nodeId ? `${networkInfo.nodeId.slice(0, 8)}...` : '—'}
          </div>
          <div className="stat-label">Node ID</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">
            {stats?.bandwidth ? formatBytes(parseInt(stats.bandwidth.totalIn)) : '—'}
          </div>
          <div className="stat-label">Data Received</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">
            {stats?.bandwidth ? formatBytes(parseInt(stats.bandwidth.totalOut)) : '—'}
          </div>
          <div className="stat-label">Data Sent</div>
        </div>
      </div>

      {/* Performance Visualizer Chart */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>📈 Live Download Speed (KB/s)</h2>
        <div style={{ width: '100%', height: 300, padding: '1rem 0' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
              <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={12} tickMargin={10} />
              <YAxis stroke="var(--text-muted)" fontSize={12} />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--surface)', 
                  border: '1px solid var(--glass-border)',
                  borderRadius: '8px',
                  color: 'var(--text)'
                }} 
              />
              <Legend verticalAlign="top" height={36} />
              <Line 
                type="monotone" 
                dataKey="P2P Swarm" 
                stroke="var(--primary)" 
                strokeWidth={3}
                dot={false}
                activeDot={{ r: 6 }} 
              />
              <Line 
                type="monotone" 
                dataKey="Centralized Server" 
                stroke="var(--error)" 
                strokeWidth={2}
                strokeDasharray="5 5"
                dot={false} 
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Node Info Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>🖥️ Node Information</h2>
        
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1rem'
        }}>
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Status</div>
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem',
              marginTop: '0.25rem'
            }}>
              <span style={{ 
                width: '10px', 
                height: '10px', 
                borderRadius: '50%', 
                background: networkInfo?.success !== false ? 'var(--success)' : 'var(--error)'
              }}></span>
              {networkInfo?.success !== false ? 'Online' : 'Offline'}
            </div>
          </div>
          
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Agent Version</div>
            <div style={{ marginTop: '0.25rem' }}>
              {networkInfo?.agentVersion || 'N/A'}
            </div>
          </div>
          
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Download Rate</div>
            <div style={{ marginTop: '0.25rem', color: 'var(--secondary)' }}>
              {stats?.bandwidth ? `${(parseInt(stats.bandwidth.rateIn) / 1024).toFixed(2)} KB/s` : '0 KB/s'}
            </div>
          </div>
          
          <div>
            <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Upload Rate</div>
            <div style={{ marginTop: '0.25rem', color: 'var(--primary)' }}>
              {stats?.bandwidth ? `${(parseInt(stats.bandwidth.rateOut) / 1024).toFixed(2)} KB/s` : '0 KB/s'}
            </div>
          </div>
        </div>
      </div>

      {/* Connect to Peer */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>🔗 Connect to Peer</h2>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <input
            type="text"
            className="form-input"
            placeholder="/ip4/192.168.1.x/tcp/4001/p2p/QmPeerId..."
            value={peerAddress}
            onChange={(e) => setPeerAddress(e.target.value)}
            style={{ flex: 1 }}
          />
          <button 
            className="btn btn-primary"
            onClick={handleConnectPeer}
            disabled={connecting}
          >
            {connecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
        <p style={{ 
          marginTop: '0.75rem', 
          fontSize: '0.85rem', 
          color: 'var(--text-muted)' 
        }}>
          Enter the multiaddr of another IPFS node to connect directly
        </p>
      </div>

      {/* Network Topology Visualizer */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>🌐 Live Network Topology</h2>
        <NetworkGraph networkInfo={networkInfo} />
      </div>

      {/* Peer List */}
      <div className="card">
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>👥 Connected Peers</h2>
        
        {networkInfo?.peers && networkInfo.peers.length > 0 ? (
          <div className="peer-list">
            {networkInfo.peers.map((peer, index) => (
              <div key={index} className="peer-item">
                <div className="peer-status"></div>
                <div style={{ flex: 1 }}>
                  <div className="peer-id">
                    {peer.peerId.slice(0, 20)}...{peer.peerId.slice(-8)}
                  </div>
                  <div style={{ 
                    fontSize: '0.75rem', 
                    color: 'var(--text-muted)',
                    marginTop: '0.25rem'
                  }}>
                    {peer.address}
                  </div>
                </div>
                <div className="peer-latency">
                  {peer.latency || '< 1ms'}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ 
            textAlign: 'center', 
            padding: '2rem',
            color: 'var(--text-muted)'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🔌</div>
            <p>No peers connected</p>
            <p style={{ fontSize: '0.85rem', marginTop: '0.5rem' }}>
              Start another IPFS node and connect to expand the network
            </p>
          </div>
        )}
      </div>

      {/* Instructions for Single PC */}
      <div className="card" style={{ marginTop: '1.5rem', background: 'rgba(99, 102, 241, 0.1)' }}>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>💡 Single PC Setup</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>
          To test P2P on a single PC, run two IPFS nodes on different ports:
        </p>
        <pre style={{ 
          background: 'var(--surface)', 
          padding: '1rem', 
          borderRadius: '8px',
          overflow: 'auto',
          fontSize: '0.85rem'
        }}>
{`# Terminal 1 (Node 1 - Port 5001)
set IPFS_PATH=./ipfs-network/node1
ipfs daemon

# Terminal 2 (Node 2 - Port 5002)  
set IPFS_PATH=./ipfs-network/node2
ipfs daemon

# Connect Node2 to Node1
set IPFS_PATH=./ipfs-network/node2
ipfs swarm connect /ip4/127.0.0.1/tcp/4001/p2p/<NODE1_PEER_ID>`}
        </pre>
      </div>
    </div>
  );
}

export default Dashboard;
