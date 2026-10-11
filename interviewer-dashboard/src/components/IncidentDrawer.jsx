import React, { useState } from 'react';
import {
  ShieldAlert, AlertTriangle, AlertCircle, Info, X, Filter,
  ExternalLink, ChevronRight, CheckCircle2, User, Clock
} from 'lucide-react';

export default function IncidentDrawer({
  isOpen = true,
  onClose,
  incidents = [],
  onSelectIncident,
  selectedCandidateId = null,
  allCandidates = []
}) {
  const [severityFilter, setSeverityFilter] = useState('all'); // 'all' | 'critical' | 'warning' | 'info'
  const [candidateFilter, setCandidateFilter] = useState('all');

  if (!isOpen) return null;

  // Filter incidents
  const filteredIncidents = incidents.filter(inc => {
    // Severity matching
    const sev = (inc.severity || 'medium').toLowerCase();
    const isCritical = sev === 'high' || sev === 'critical';
    const isWarning = sev === 'medium' || sev === 'warning';
    const isInfo = sev === 'low' || sev === 'info';

    if (severityFilter === 'critical' && !isCritical) return false;
    if (severityFilter === 'warning' && !isWarning) return false;
    if (severityFilter === 'info' && !isInfo) return false;

    // Candidate matching
    if (candidateFilter !== 'all' && inc.candidateId !== candidateFilter && inc.roomId !== candidateFilter) {
      return false;
    }

    return true;
  });

  const criticalCount = incidents.filter(i => (i.severity || '').toLowerCase() === 'high' || (i.severity || '').toLowerCase() === 'critical').length;
  const warningCount = incidents.filter(i => (i.severity || '').toLowerCase() === 'medium' || (i.severity || '').toLowerCase() === 'warning').length;

  const formatTime = (ts) => {
    if (!ts) return 'Just now';
    const d = new Date(ts);
    return isNaN(d.getTime()) ? 'Just now' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatEventTitle = (raw) => {
    if (!raw) return 'Telemetry Event';
    const rawClean = String(raw).trim();
    const map = {
      window_switch_attempt: 'Window Switch Attempt',
      window_switch: 'Window Switch Attempt',
      tab_switch_detected: 'Tab Switch Attempt',
      tab_switch: 'Tab Switch Attempt',
      tab_switches: 'Tab Switch Attempt',
      face_absent: 'Face Absent from Frame',
      no_face: 'Face Absent from Frame',
      face_not_found: 'Face Absent from Frame',
      multiple_faces: 'Multiple Faces in Frame',
      multi_face: 'Multiple Faces in Frame',
      speech_detected: 'Voice / Speech Detected',
      audio_detected: 'Acoustic Anomaly Flagged',
      suspicious_audio: 'Whisper / Speech Pattern',
      secondary_device: 'Unauthorized Secondary Device',
      phone_detected: 'Smartphone Detected in Frame',
      gaze_away: 'Prolonged Gaze Diversion',
      screen_share_lost: 'Screen Share Lost',
      device_disconnected: 'Device Disconnected'
    };
    const key = rawClean.toLowerCase().replace(/[\s-]+/g, '_');
    if (map[key]) return map[key];
    return rawClean
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <aside className="incident-drawer-panel" role="complementary" aria-label="Live Activity Audit Feed">
      {/* ── DRAWER HEADER ──────────────────────────────────────────────── */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-surface)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '1px solid rgba(239, 68, 68, 0.25)'
          }}>
            <ShieldAlert size={14} />
          </div>
          <div>
            <h3 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Live Audit Feed</h3>
            <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: 0 }}>Real-time telemetry stream</p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="btn btn-ghost btn-icon btn-sm"
          title="Collapse Audit Feed"
        >
          <X size={14} />
        </button>
      </div>

      {/* ── SEVERITY FILTER TABS ───────────────────────────────────────── */}
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', padding: 2, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
          {[
            { id: 'all', label: 'All', count: incidents.length },
            { id: 'critical', label: 'Critical', count: criticalCount, color: 'var(--danger)' },
            { id: 'warning', label: 'Warning', count: warningCount, color: 'var(--warning)' },
            { id: 'info', label: 'Info', count: incidents.length - criticalCount - warningCount }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setSeverityFilter(tab.id)}
              className="btn btn-ghost btn-sm"
              style={{
                flex: 1,
                fontSize: 10,
                padding: '4px 2px',
                borderRadius: 6,
                fontWeight: severityFilter === tab.id ? 700 : 500,
                background: severityFilter === tab.id ? 'var(--bg-card)' : 'transparent',
                color: severityFilter === tab.id ? (tab.color || 'var(--text-primary)') : 'var(--text-muted)',
                boxShadow: severityFilter === tab.id ? 'var(--shadow-sm)' : 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4
              }}
            >
              <span>{tab.label}</span>
              {tab.count > 0 && (
                <span style={{ fontSize: 9, opacity: 0.8, fontFamily: 'JetBrains Mono' }}>
                  ({tab.count})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Candidate Selector Filter if multiple candidates */}
        {allCandidates.length > 0 && (
          <select
            value={candidateFilter}
            onChange={e => setCandidateFilter(e.target.value)}
            className="toolbar-select"
            style={{ width: '100%', height: 32, fontSize: 11, padding: '0 24px 0 8px' }}
          >
            <option value="all">All Active Candidates</option>
            {allCandidates.map(c => (
              <option key={c.interview_id || c.candidate_id} value={c.interview_id || c.candidate_id}>
                {c.candidate_name || c.fullname} ({c.job_role || 'Candidate'})
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── TIMELINE INCIDENTS LIST ────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredIncidents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 14px', color: 'var(--text-muted)' }}>
            <CheckCircle2 size={32} style={{ color: 'var(--success)', opacity: 0.6, margin: '0 auto 8px' }} />
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', margin: 0 }}>Clean Telemetry Stream</p>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '4px 0 0' }}>No violations matching current filter criteria.</p>
          </div>
        ) : (
          filteredIncidents.map((item, idx) => {
            const sev = (item.severity || 'medium').toLowerCase();
            const isCritical = sev === 'high' || sev === 'critical';
            const isWarning = sev === 'medium' || sev === 'warning';

            const severityClass = isCritical
              ? 'severity-critical'
              : isWarning
                ? 'severity-warning'
                : 'severity-info';

            const Icon = isCritical ? AlertTriangle : isWarning ? AlertCircle : Info;
            const iconColor = isCritical ? 'var(--danger)' : isWarning ? 'var(--warning)' : 'var(--info)';
            const badgeLabel = isCritical ? 'Critical' : isWarning ? 'Warning' : 'Notice';

            return (
              <div
                key={item.id || idx}
                className={`incident-timeline-item ${severityClass}`}
                onClick={() => onSelectIncident && onSelectIncident(item)}
                title="Click to focus on candidate card"
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                    <Icon size={13} style={{ color: iconColor, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }} className="truncate">
                      {formatEventTitle(item.event || item.anomalyType)}
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 4,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        flexShrink: 0,
                        background: isCritical ? 'rgba(239, 68, 68, 0.15)' : isWarning ? 'rgba(245, 158, 11, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                        color: isCritical ? '#ef4444' : isWarning ? '#f59e0b' : 'var(--primary)',
                        border: `1px solid ${isCritical ? 'rgba(239, 68, 68, 0.3)' : isWarning ? 'rgba(245, 158, 11, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`
                      }}
                    >
                      {badgeLabel}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>
                    {formatTime(item.timestamp)}
                  </span>
                </div>

                {item.candidateName && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--primary)', marginTop: 2 }}>
                    <User size={10} />
                    <span style={{ fontWeight: 600 }}>{item.candidateName}</span>
                  </div>
                )}

                {item.details && (
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', margin: '3px 0 0', lineHeight: 1.4 }}>
                    {item.details}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* ── DRAWER FOOTER ──────────────────────────────────────────────── */}
      <div style={{
        padding: '8px 14px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        fontSize: 10,
        color: 'var(--text-muted)'
      }}>
        <span>Auto-logging enabled</span>
        <span>{filteredIncidents.length} event{filteredIncidents.length === 1 ? '' : 's'} recorded</span>
      </div>
    </aside>
  );
}
