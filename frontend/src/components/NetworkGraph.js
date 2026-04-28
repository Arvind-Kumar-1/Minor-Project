import React, { useMemo, useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

function NetworkGraph({ networkInfo }) {
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    // Resize observer to keep the graph responsive
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: 350
        });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const graphData = useMemo(() => {
    if (!networkInfo || !networkInfo.nodeId) return { nodes: [], links: [] };

    const nodes = [{
      id: networkInfo.nodeId,
      name: 'LOCAL NODE',
      group: 1,
      val: 20
    }];

    const links = [];

    if (networkInfo.peers && Array.isArray(networkInfo.peers)) {
      networkInfo.peers.forEach(peer => {
        // Prevent duplicate nodes if peer appears multiple times in raw data
        if (!nodes.find(n => n.id === peer.peerId)) {
          nodes.push({
            id: peer.peerId,
            name: peer.peerId.slice(0, 6) + '...' + peer.peerId.slice(-4),
            group: 2,
            val: 10,
            latency: peer.latency || '< 1ms'
          });
        }

        // Determine link color and thickness based on latency
        let latencyVal = 2;
        let color = '#10b981'; // success green

        if (peer.latency) {
          const ms = parseInt(peer.latency.replace(/[^0-9]/g, ''));
          if (!isNaN(ms)) {
            if (ms > 150) {
              color = '#ef4444'; // error red
              latencyVal = 0.5;
            } else if (ms > 50) {
              color = '#f59e0b'; // warning yellow
              latencyVal = 1;
            }
          }
        }

        links.push({
          source: networkInfo.nodeId,
          target: peer.peerId,
          color,
          value: latencyVal,
          label: peer.latency
        });
      });
    }

    return { nodes, links };
  }, [networkInfo]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '350px',
        background: '#0a0a0a',
        borderRadius: '12px',
        border: '1px solid #222',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      {dimensions.width > 0 && graphData.nodes.length > 0 ? (
        <ForceGraph2D
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeRelSize={6}
          linkColor="color"
          linkWidth={link => link.value}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={d => d.value * 0.005}
          backgroundColor="#0a0a0a"
          nodeCanvasObject={(node, ctx, globalScale) => {
            const label = node.name;
            const fontSize = Math.max(12 / globalScale, 10);
            ctx.font = `500 ${fontSize}px Inter`;

            // Draw Node Circle
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.group === 1 ? 8 : 5, 0, 2 * Math.PI, false);
            ctx.fillStyle = node.group === 1 ? '#8b5cf6' : '#333333';
            ctx.fill();

            // Draw Glow for local node
            if (node.group === 1) {
              ctx.shadowColor = '#8b5cf6';
              ctx.shadowBlur = 15;
              ctx.fill();
              ctx.shadowBlur = 0; // reset
            } else {
              ctx.strokeStyle = '#555';
              ctx.lineWidth = 1;
              ctx.stroke();
            }

            // Draw Label background
            const textWidth = ctx.measureText(label).width;
            const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
            ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y + 10 - bckgDimensions[1] / 2, ...bckgDimensions);

            // Draw Text
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = node.group === 1 ? '#ffffff' : '#a1a1aa';
            ctx.fillText(label, node.x, node.y + 10);
          }}
        />
      ) : (
        <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: '#71717a' }}>
          Initializing Map...
        </div>
      )}

      {/* Legend Overlay */}
      <div style={{
        position: 'absolute',
        top: '1rem',
        left: '1rem',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        padding: '0.75rem',
        borderRadius: '8px',
        border: '1px solid #333',
        fontSize: '0.8rem',
        color: '#a1a1aa'
      }}>
        <div style={{ marginBottom: '0.5rem', color: '#fff', fontWeight: 500 }}>Connection Latency</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }}></div> &lt; 50ms
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#f59e0b' }}></div> 50 - 150ms
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }}></div> &gt; 150ms
        </div>
      </div>
    </div>
  );
}

export default NetworkGraph;
