import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { AlertCircle, EyeOff, Users, Monitor, Maximize, Shield, ShieldAlert, ShieldCheck, Clock, TrendingDown, BarChart2, Activity } from 'lucide-react';

const BACKEND = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5000'
  : (window.location.hostname.includes('loca.lt')
      ? `https://${window.location.hostname.replace('.loca.lt', '-api.loca.lt')}`
      : (window.location.hostname.includes('localtunnel.me')
          ? `https://${window.location.hostname.replace('.localtunnel.me', '-api.localtunnel.me')}`
          : 'http://127.0.0.1:5000'));

const ALERT_META = {
  'no_face': { label: 'Face Not Detected', icon: EyeOff, category: 'Identity' },
  'multiple_faces': { label: 'Multiple Faces', icon: Users, category: 'Identity' },
  'off_screen_gaze': { label: 'Off-Screen Gaze', icon: Monitor, category: 'Attention' },
  'window_switch_attempt': { label: 'Tab Switch Attempt', icon: Maximize, category: 'Navigation' },
  'dependency_error': { label: 'Engine Crash', icon: AlertCircle, category: 'System' },
  'camera_error': { label: 'Camera Offline', icon: AlertCircle, category: 'System' },
};

const SEVERITY_STYLE = {
  high:   { bg: 'rgba(127,29,29,0.2)',   border: 'rgba(239,68,68,0.3)',   dot: '#ef4444', text: '#fca5a5',  badge: 'CRITICAL' },
  medium: { bg: 'rgba(120,53,15,0.15)',  border: 'rgba(245,158,11,0.25)', dot: '#f59e0b', text: '#fcd34d',  badge: 'WARNING' },
  low:    { bg: 'rgba(23,37,84,0.15)',   border: 'rgba(99,102,241,0.2)',  dot: '#6366f1', text: '#a5b4fc',  badge: 'INFO' },
};

const AlertsPanel = ({ roomId }) => {
  const [alerts, setAlerts] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');

  useEffect(() => {
    setAlerts([]);

    const fetchLogs = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/interviews/${roomId}/logs`);
        if (res.ok) {
          const data = await res.json();
          const mapped = data.map(log => ({
            id: log.id,
            timestamp: new Date(log.timestamp),
            event: log.event,
            severity: log.severity,
            confidence: log.confidence || 1.0,
            count: 1
          }));
          setAlerts(mapped);
          if (mapped.length > 0) setLastUpdate(new Date());
        }
      } catch (err) {
        console.error('Failed to fetch logs:', err);
      }
    };

    fetchLogs();

    const socket = io(`${BACKEND}/proctor`);
    socket.on('connect', () => {
      setIsConnected(true);
      socket.emit('join_room', String(roomId));
    });
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('proctor_alert', (data) => {
      setLastUpdate(new Date());
      setAlerts(prev => {
        if (prev.length > 0 && prev[0].event === data.event) {
          const updated = [...prev];
          updated[0] = { ...updated[0], count: (updated[0].count || 1) + 1, timestamp: new Date() };
          return updated;
        }
        return [{ id: Date.now(), timestamp: new Date(), count: 1, ...data }, ...prev];
      });
    });

    socket.on('score_update', (data) => {
      // handled in parent component
    });

    return () => socket.disconnect();
  }, [roomId]);

  // ── Stats Aggregation ────────────────────────────────────────────────────
  const stats = alerts.reduce((acc, a) => {
    acc[a.event] = (acc[a.event] || 0) + (a.count || 1);
    return acc;
  }, {});

  const totalViolations = Object.values(stats).reduce((a, b) => a + b, 0);
  const highCount = alerts.filter(a => a.severity === 'high').reduce((s, a) => s + (a.count || 1), 0);
  const mediumCount = alerts.filter(a => a.severity === 'medium').reduce((s, a) => s + (a.count || 1), 0);

  // ── Status ───────────────────────────────────────────────────────────────
  let status = { label: 'All Clear', sub: 'No violations detected', color: '#22c55e', bg: 'rgba(21,128,61,0.12)', border: 'rgba(34,197,94,0.2)', Icon: ShieldCheck };
  if (highCount > 0 || totalViolations > 5) {
    status = { label: 'Critical Alert', sub: `${highCount} high severity flags`, color: '#ef4444', bg: 'rgba(127,29,29,0.2)', border: 'rgba(239,68,68,0.35)', Icon: ShieldAlert };
  } else if (totalViolations > 0) {
    status = { label: 'Suspicious Activity', sub: `${totalViolations} violation(s) logged`, color: '#f59e0b', bg: 'rgba(120,53,15,0.15)', border: 'rgba(245,158,11,0.3)', Icon: AlertCircle };
  }

  // ── Filter ───────────────────────────────────────────────────────────────
  const filteredAlerts = activeFilter === 'all' ? alerts : alerts.filter(a => a.severity === activeFilter);

  const fmtTime = (dt) => {
    if (!dt) return '—';
    const d = dt instanceof Date ? dt : new Date(dt);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: '0', background: 'rgba(5,13,26,0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(5,13,26,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity style={{ width: '16px', height: '16px', color: '#d4a017' }} />
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: '15px', fontWeight: '600', color: '#f5f0e8' }}>Proctoring Monitor</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: isConnected ? '#86efac' : '#fca5a5' }}>
            <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isConnected ? '#22c55e' : '#ef4444' }} />
            {isConnected ? 'Live' : 'Offline'}
          </span>
          <span style={{ padding: '2px 8px', borderRadius: '10px', background: 'rgba(212,160,23,0.1)', border: '1px solid rgba(212,160,23,0.2)', fontSize: '10px', fontWeight: '700', color: '#d4a017', fontFamily: "'JetBrains Mono', monospace" }}>
            {totalViolations} FLAGS
          </span>
        </div>
      </div>

      {/* Status Card */}
      <div style={{ margin: '12px', padding: '12px 16px', borderRadius: '8px', background: status.bg, border: `1px solid ${status.border}`, display: 'flex', alignItems: 'center', gap: '12px' }}>
        <status.Icon style={{ width: '20px', height: '20px', color: status.color, flexShrink: 0 }} />
        <div>
          <p style={{ fontSize: '12px', fontWeight: '700', color: status.color, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{status.label}</p>
          <p style={{ fontSize: '11px', color: 'rgba(245,240,232,0.5)', marginTop: '1px' }}>{status.sub}</p>
        </div>
      </div>

      {/* Metrics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', margin: '0 12px' }}>
        {[
          { label: 'Off-Screen', count: stats['off_screen_gaze'] || 0, color: '#fcd34d' },
          { label: 'Tab Switches', count: stats['window_switch_attempt'] || 0, color: '#fca5a5' },
          { label: 'No Face', count: stats['no_face'] || 0, color: '#f87171' },
          { label: 'Multi-Face', count: stats['multiple_faces'] || 0, color: '#f87171' },
        ].map(m => (
          <div key={m.label} style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(5,13,26,0.5)', border: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '11px', color: 'rgba(143,160,184,0.6)' }}>{m.label}</span>
            <span style={{ fontSize: '15px', fontWeight: '700', fontFamily: "'JetBrains Mono', monospace", color: m.count > 0 ? m.color : 'rgba(143,160,184,0.3)' }}>{m.count}</span>
          </div>
        ))}
      </div>

      {/* Filter Pills */}
      <div style={{ display: 'flex', gap: '6px', margin: '12px 12px 8px', flexShrink: 0 }}>
        <span style={{ fontSize: '10px', color: 'rgba(143,160,184,0.4)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.06em', alignSelf: 'center', marginRight: '2px' }}>Filter:</span>
        {['all', 'high', 'medium', 'low'].map(f => (
          <button key={f} onClick={() => setActiveFilter(f)}
            style={{ padding: '3px 10px', borderRadius: '12px', fontSize: '10px', fontWeight: '700', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.04em', transition: 'all 0.15s', border: `1px solid ${activeFilter === f ? (f === 'all' ? 'rgba(212,160,23,0.4)' : f === 'high' ? 'rgba(239,68,68,0.4)' : f === 'medium' ? 'rgba(245,158,11,0.4)' : 'rgba(99,102,241,0.4)') : 'rgba(255,255,255,0.06)'}`, background: activeFilter === f ? (f === 'all' ? 'rgba(212,160,23,0.1)' : f === 'high' ? 'rgba(239,68,68,0.1)' : f === 'medium' ? 'rgba(245,158,11,0.1)' : 'rgba(99,102,241,0.1)') : 'transparent', color: activeFilter === f ? (f === 'all' ? '#d4a017' : f === 'high' ? '#fca5a5' : f === 'medium' ? '#fcd34d' : '#a5b4fc') : 'rgba(143,160,184,0.5)' }}>
            {f}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div style={{ padding: '0 12px 4px', marginBottom: '4px' }}>
        <p style={{ fontSize: '10px', fontWeight: '700', color: 'rgba(143,160,184,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Security Timeline {filteredAlerts.length > 0 && `— ${filteredAlerts.length} events`}
        </p>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}>
        {filteredAlerts.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '120px', gap: '8px' }}>
            <Shield style={{ width: '32px', height: '32px', opacity: 0.12 }} />
            <p style={{ fontSize: '12px', color: 'rgba(143,160,184,0.25)' }}>
              {activeFilter === 'all' ? 'No violations recorded' : `No ${activeFilter} severity events`}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
            {filteredAlerts.map((alert, idx) => {
              const meta = ALERT_META[alert.event] || { label: alert.event, icon: AlertCircle, category: 'Unknown' };
              const sev = SEVERITY_STYLE[alert.severity] || SEVERITY_STYLE.low;
              const Icon = meta.icon;
              return (
                <div key={alert.id} className="timeline-item animate-slide-right" style={{ animationDelay: `${idx * 30}ms`, paddingBottom: '10px', marginBottom: '2px' }}>
                  {/* Timeline dot */}
                  <div className="timeline-dot" style={{ color: sev.dot, background: `${sev.dot}22` }} />
                  
                  <div style={{ padding: '10px 12px', borderRadius: '8px', background: sev.bg, border: `1px solid ${sev.border}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                        <Icon style={{ width: '13px', height: '13px', color: sev.text, flexShrink: 0 }} />
                        <span style={{ fontSize: '12px', fontWeight: '700', color: sev.text }}>{meta.label}</span>
                      </div>
                      <span style={{ padding: '1px 6px', borderRadius: '4px', fontSize: '9px', fontWeight: '800', letterSpacing: '0.06em', background: `${sev.dot}22`, color: sev.text, border: `1px solid ${sev.border}`, flexShrink: 0 }}>{sev.badge}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <span style={{ fontSize: '10px', color: 'rgba(143,160,184,0.5)' }}>Category: <span style={{ color: 'rgba(143,160,184,0.7)' }}>{meta.category}</span></span>
                        {alert.confidence < 1 && <span style={{ fontSize: '10px', color: 'rgba(143,160,184,0.5)' }}>Conf: {Math.round(alert.confidence * 100)}%</span>}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {alert.count > 1 && (
                          <span style={{ fontSize: '10px', fontWeight: '700', padding: '1px 7px', borderRadius: '10px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', color: '#f5f0e8', fontFamily: "'JetBrains Mono', monospace" }}>×{alert.count}</span>
                        )}
                        <span style={{ fontSize: '10px', color: 'rgba(143,160,184,0.35)', fontFamily: "'JetBrains Mono', monospace" }}>{fmtTime(alert.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {lastUpdate && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(5,13,26,0.4)' }}>
          <Clock style={{ width: '11px', height: '11px', color: 'rgba(143,160,184,0.3)' }} />
          <span style={{ fontSize: '10px', color: 'rgba(143,160,184,0.3)' }}>Last event: {fmtTime(lastUpdate)}</span>
        </div>
      )}
    </div>
  );
};

export default AlertsPanel;
