import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import {
  AlertCircle, ShieldCheck, ShieldAlert, Activity,
  Eye, Monitor, Users, Volume2, Send, Check
} from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL
  || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://127.0.0.1:5000'
      : (window.location.hostname.includes('loca.lt')
          ? `https://${window.location.hostname.replace('.loca.lt', '-api.loca.lt')}`
          : 'https://ai-proctoring-system-8nma.onrender.com'));

const ALERT_TITLES = {
  'no_face': 'Face Not Detected',
  'multiple_faces': 'Multiple Faces Detected',
  'off_screen_gaze': 'Off-Screen Gaze Shift',
  'window_switch_attempt': 'Tab / Window Switch Attempt',
  'keyboard_shortcut_attempt': 'Blocked Keyboard Shortcut',
  'copy_attempt': 'Clipboard Copy Blocked',
  'paste_detected': 'Clipboard Paste Blocked',
  'c_attempt': 'Copy Shortcut Blocked',
  'v_attempt': 'Paste Shortcut Blocked',
  'x_attempt': 'Cut Shortcut Blocked',
  'suspicious_material': 'Unauthorized Object Flagged',
  'speech_detected': 'Background Speech Detected',
  'camera_error': 'Camera Feed Interrupted',
  'dependency_error': 'System Notice'
};

const AlertsPanel = ({ roomId, onSendCandidateWarning }) => {
  const [alerts, setAlerts] = useState([]);
  const [activeFilter, setActiveFilter] = useState('all');
  const [sentWarning, setSentWarning] = useState(null);

  useEffect(() => {
    setAlerts([]);
    if (!roomId) return;

    const fetchLogs = async () => {
      try {
        const res = await fetch(`${BACKEND}/api/interviews/${roomId}/logs`);
        if (res.ok) {
          const data = await res.json();
          const mapped = data.map(log => ({
            id: log.id || log._id || Date.now() + Math.random(),
            timestamp: new Date(log.timestamp),
            event: log.event || log.anomalyType,
            severity: log.severity || 'medium',
            confidence: log.confidence || 1.0,
            details: log.details || '',
            count: 1
          }));
          setAlerts(mapped);
        }
      } catch (err) {
        console.error('Failed to fetch logs:', err);
      }
    };

    fetchLogs();

    const socket = io(`${BACKEND}/proctor`);
    socket.emit('join_room', String(roomId));

    socket.on('proctor_alert', (data) => {
      setAlerts(prev => {
        const newEvent = data.event || data.anomalyType;
        if (prev.length > 0 && prev[0].event === newEvent) {
          const updated = [...prev];
          updated[0] = {
            ...updated[0],
            count: (updated[0].count || 1) + 1,
            timestamp: new Date()
          };
          return updated;
        }
        return [{
          id: Date.now(),
          timestamp: new Date(),
          event: newEvent,
          severity: data.severity || 'medium',
          confidence: data.confidence || 1.0,
          details: data.details || '',
          count: 1
        }, ...prev];
      });
    });

    return () => socket.disconnect();
  }, [roomId]);

  // Quick broadcast warning to candidate
  const handleQuickWarning = (text) => {
    if (onSendCandidateWarning) {
      onSendCandidateWarning(text);
      setSentWarning(text);
      setTimeout(() => setSentWarning(null), 3000);
    }
  };

  // Count aggregates
  const counts = {
    offScreen: alerts.filter(a => a.event === 'off_screen_gaze').reduce((s, a) => s + (a.count || 1), 0),
    tabSwitch: alerts.filter(a => a.event === 'window_switch_attempt').reduce((s, a) => s + (a.count || 1), 0),
    noFace: alerts.filter(a => a.event === 'no_face' || a.event === 'camera_error').reduce((s, a) => s + (a.count || 1), 0),
    multiFace: alerts.filter(a => a.event === 'multiple_faces').reduce((s, a) => s + (a.count || 1), 0),
  };

  const totalViolations = alerts.reduce((sum, a) => sum + (a.count || 1), 0);
  const highSeverityCount = alerts.filter(a => a.severity === 'high').reduce((s, a) => s + (a.count || 1), 0);

  const filteredAlerts = activeFilter === 'all'
    ? alerts
    : alerts.filter(a => a.severity === activeFilter);

  const fmtTime = (dt) => {
    if (!dt) return '—';
    const d = dt instanceof Date ? dt : new Date(dt);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)'
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={15} style={{ color: 'var(--primary)' }} />
          <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--text-primary)' }}>
            Proctoring Telemetry
          </span>
        </div>
        <span className={`badge ${totalViolations === 0 ? 'badge-active' : highSeverityCount > 0 ? 'badge-danger' : 'badge-warning'}`}>
          {totalViolations === 0 ? 'Clean Session' : `${totalViolations} Event${totalViolations > 1 ? 's' : ''}`}
        </span>
      </div>

      <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, overflow: 'hidden' }}>
        {/* Compliance Status Card */}
        <div style={{
          padding: '12px 14px',
          borderRadius: '8px',
          background: totalViolations === 0 ? 'var(--success-bg)' : (highSeverityCount > 0 ? 'var(--danger-bg)' : 'var(--warning-bg)'),
          border: `1px solid ${totalViolations === 0 ? 'var(--success-border)' : (highSeverityCount > 0 ? 'var(--danger-border)' : 'var(--warning-border)')}`,
          display: 'flex',
          alignItems: 'center',
          gap: '12px'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '6px',
            background: 'var(--bg-card)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}>
            {totalViolations === 0 ? (
              <ShieldCheck size={18} style={{ color: 'var(--success)' }} />
            ) : highSeverityCount > 0 ? (
              <ShieldAlert size={18} style={{ color: 'var(--danger)' }} />
            ) : (
              <AlertCircle size={18} style={{ color: 'var(--warning)' }} />
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: '12px',
              fontWeight: '700',
              color: totalViolations === 0 ? 'var(--success)' : (highSeverityCount > 0 ? 'var(--danger)' : 'var(--warning)')
            }}>
              {totalViolations === 0 ? 'Candidate Compliant' : (highSeverityCount > 0 ? 'High Severity Violations' : 'Minor Behavioral Flags')}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }} className="truncate">
              {totalViolations === 0
                ? 'AI vision & environment models report normal behavior.'
                : `${totalViolations} flagged events in room timeline.`}
            </div>
          </div>
        </div>

        {/* 2x2 Metric Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {[
            { label: 'Gaze Shifts', val: counts.offScreen, icon: Eye, color: counts.offScreen > 0 ? 'var(--warning)' : 'var(--text-muted)' },
            { label: 'Tab Switches', val: counts.tabSwitch, icon: Monitor, color: counts.tabSwitch > 0 ? 'var(--danger)' : 'var(--text-muted)' },
            { label: 'Face Absent', val: counts.noFace, icon: ShieldAlert, color: counts.noFace > 0 ? 'var(--danger)' : 'var(--text-muted)' },
            { label: 'Multi-Face', val: counts.multiFace, icon: Users, color: counts.multiFace > 0 ? 'var(--danger)' : 'var(--text-muted)' },
          ].map(m => {
            const Icon = m.icon;
            return (
              <div key={m.label} style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Icon size={12} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{m.label}</span>
                </div>
                <span style={{
                  fontSize: '12px',
                  fontWeight: '700',
                  fontFamily: "'JetBrains Mono', monospace",
                  color: m.color
                }}>
                  {m.val}
                </span>
              </div>
            );
          })}
        </div>

        {/* Quick Warning Broadcast Actions */}
        {onSendCandidateWarning && (
          <div style={{ padding: '8px 10px', borderRadius: '8px', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <span style={{ fontSize: '10px', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'block', marginBottom: '6px' }}>
              Broadcast Reminder to Candidate
            </span>
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {[
                'Please keep eyes on screen',
                'Ensure webcam is centered',
                'Please minimize background noise'
              ].map(txt => (
                <button
                  key={txt}
                  type="button"
                  onClick={() => handleQuickWarning(txt)}
                  className="btn btn-ghost btn-sm"
                  style={{
                    fontSize: '10px',
                    padding: '3px 8px',
                    background: sentWarning === txt ? 'var(--success-bg)' : 'var(--bg-elevated)',
                    border: `1px solid ${sentWarning === txt ? 'var(--success-border)' : 'var(--border-faint)'}`,
                    color: sentWarning === txt ? 'var(--success)' : 'var(--text-secondary)'
                  }}
                >
                  {sentWarning === txt ? <Check size={10} /> : <Send size={10} />}
                  <span>{txt.split(' ')[2] || txt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filter bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '2px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', color: 'var(--text-muted)', letterSpacing: '0.4px', textTransform: 'uppercase' }}>
            Event Log ({filteredAlerts.length})
          </span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['all', 'high', 'medium'].map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setActiveFilter(f)}
                className="btn btn-ghost btn-sm"
                style={{
                  fontSize: '10px',
                  fontWeight: '700',
                  padding: '2px 8px',
                  background: activeFilter === f ? 'var(--primary-light)' : 'transparent',
                  color: activeFilter === f ? 'var(--primary)' : 'var(--text-muted)',
                  border: `1px solid ${activeFilter === f ? 'var(--primary-border)' : 'transparent'}`,
                  textTransform: 'uppercase'
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Timeline */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          paddingRight: '2px'
        }}>
          {filteredAlerts.length === 0 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-muted)',
              textAlign: 'center',
              padding: '24px'
            }}>
              <ShieldCheck size={28} style={{ opacity: 0.35, marginBottom: '8px' }} />
              <div style={{ fontSize: '12px', fontWeight: '600' }}>No Security Incidents</div>
              <div style={{ fontSize: '11px', marginTop: '2px', opacity: 0.7 }}>Candidate integrity within normal thresholds</div>
            </div>
          ) : (
            filteredAlerts.map(a => {
              const isHigh = a.severity === 'high';
              const title = ALERT_TITLES[a.event] || a.event.replace(/_/g, ' ');
              return (
                <div
                  key={a.id}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '6px',
                    background: isHigh ? 'var(--danger-bg)' : 'var(--warning-bg)',
                    border: `1px solid ${isHigh ? 'var(--danger-border)' : 'var(--warning-border)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{
                      fontSize: '11px',
                      fontWeight: '700',
                      color: isHigh ? 'var(--danger)' : 'var(--warning)'
                    }}>
                      {title}
                    </span>
                    <span style={{ fontSize: '10px', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
                      {fmtTime(a.timestamp)}
                    </span>
                  </div>
                  {a.details && (
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
                      {a.details}
                    </div>
                  )}
                  {a.count > 1 && (
                    <span style={{
                      fontSize: '10px',
                      fontWeight: '700',
                      color: isHigh ? 'var(--danger)' : 'var(--warning)'
                    }}>
                      Occurred {a.count} times
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default AlertsPanel;
