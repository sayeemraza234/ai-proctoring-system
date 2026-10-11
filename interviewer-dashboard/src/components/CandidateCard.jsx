import React, { useState, useEffect } from 'react';
import {
  Camera, Maximize2, MessageSquare, AlertTriangle, PhoneOff, Play,
  Wifi, Shield, Clock, ExternalLink, Flag, MoreVertical, Radio, Check, Tv
} from 'lucide-react';
import ViolationPills from './ViolationPills';
import LiveStreamContainer from './LiveStreamContainer';

export default function CandidateCard({
  candidate,
  isSelected = false,
  onInspect,
  onQuickExpand,
  onPiP,
  onIntervene,
  onFlagIncident,
  onTerminate,
  onActivate
}) {
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [showQuickActionMenu, setShowQuickActionMenu] = useState(false);

  const isLive = candidate.status === 'active' || candidate.status === 'in_progress';
  const isFlagged = candidate.isFlagged || (candidate.trust_score && candidate.trust_score < 70);

  // Active session timer
  useEffect(() => {
    let interval;
    if (isLive) {
      interval = setInterval(() => {
        setElapsedSecs(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isLive]);

  const formatTimer = (s) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Integrity Trust Score formatting
  const trustScore = Math.round(candidate.trust_score ?? 100);
  const getTrustClass = (score) => score >= 80 ? 'trust-high' : score >= 50 ? 'trust-medium' : 'trust-low';
  const getTrustColor = (score) => score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
  const getTrustLabel = (score) => score >= 80 ? 'Optimal' : score >= 50 ? 'Moderate Risk' : 'Critical Flag';

  // Extract or mock violations from candidate metadata
  const tabSwitches = candidate.tab_switches ?? candidate.tabSwitches ?? (candidate.status === 'active' ? (candidate.trust_score < 80 ? 2 : 0) : 0);
  const faceStatus = candidate.face_status ?? candidate.faceStatus ?? (candidate.trust_score < 60 ? 'multiple' : 'normal');
  const audioStatus = candidate.audio_status ?? candidate.audioStatus ?? (candidate.trust_score < 70 ? 'speech' : 'quiet');
  const screenShare = candidate.screen_share ?? candidate.screenShare ?? (isLive ? 'active' : 'inactive');

  return (
    <div
      className={`candidate-card-wrapper ${isSelected ? 'card-focused' : ''} ${isFlagged ? 'card-flagged' : ''}`}
      role="article"
      aria-label={`Monitoring session for ${candidate.candidate_name}`}
    >
      {/* ── CARD HEADER ──────────────────────────────────────────────── */}
      <div style={{
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)'
      }}>
        {/* Candidate Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <div style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: isLive ? 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)' : 'var(--bg-elevated)',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isLive ? '#ffffff' : 'var(--text-primary)',
            fontWeight: 800,
            fontSize: 12,
            flexShrink: 0
          }}>
            {(candidate.candidate_name || candidate.fullname || 'C')[0].toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <h3 style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--text-primary)',
                margin: 0,
                lineHeight: 1.2
              }} className="truncate">
                {candidate.candidate_name || candidate.fullname}
              </h3>
              <span className={`badge ${isLive ? 'badge-active' : candidate.status === 'scheduled' ? 'badge-scheduled' : 'badge-completed'}`} style={{ fontSize: 9, padding: '1px 6px' }}>
                {isLive ? 'Live' : candidate.status}
              </span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
              <span>{candidate.job_role || 'Software Engineer'}</span>
            </div>
          </div>
        </div>

        {/* Live Elapsed Timer */}
        {/* Live Elapsed Timer & Corner Quick Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {isLive && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 7px',
              borderRadius: 9999,
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              fontSize: 11,
              fontFamily: 'JetBrains Mono',
              fontWeight: 600,
              color: 'var(--text-primary)'
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              <span>{formatTimer(elapsedSecs)}</span>
            </div>
          )}

          {/* Picture-in-Picture & Quick-Expand Corner Buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onPiP && onPiP(candidate); }}
              className="btn btn-ghost btn-icon btn-sm"
              style={{ width: 22, height: 22, padding: 0, color: 'var(--text-muted)' }}
              title="Picture-in-Picture floating stream"
              aria-label="Picture-in-Picture"
            >
              <Tv size={11} />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onQuickExpand && onQuickExpand(candidate); }}
              className="btn btn-ghost btn-icon btn-sm"
              style={{ width: 22, height: 22, padding: 0, color: 'var(--text-muted)' }}
              title="Quick-Expand candidate into full overlay modal"
              aria-label="Quick-Expand"
            >
              <Maximize2 size={11} />
            </button>
          </div>
        </div>
      </div>

      {/* ── 16:9 STREAM WINDOW ────────────────────────────────────────── */}
      <LiveStreamContainer
        candidate={candidate}
        roomId={candidate.interview_id || candidate.id}
        isLive={isLive}
        compact={true}
        onInspect={onInspect}
      />

      {/* ── METRICS & TELEMETRY ROW ────────────────────────────────────── */}
      <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Trust Score Gauge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Shield size={13} style={{ color: getTrustColor(trustScore) }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>Integrity Score:</span>
            <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'JetBrains Mono', color: getTrustColor(trustScore) }}>
              {trustScore}%
            </span>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, color: getTrustColor(trustScore), textTransform: 'uppercase', letterSpacing: 0.3 }}>
            {getTrustLabel(trustScore)}
          </span>
        </div>

        {/* Visual Progress Bar */}
        <div className="trust-bar-track">
          <div className={`trust-bar-fill ${getTrustClass(trustScore)}`} style={{ width: `${trustScore}%` }} />
        </div>

        {/* Compact Real-Time Violation Badges */}
        <ViolationPills
          tabSwitches={tabSwitches}
          faceStatus={faceStatus}
          audioStatus={audioStatus}
          screenShare={screenShare}
          compact
        />
      </div>

      {/* ── STANDARDIZED ACTION TOOLBAR ─────────────────────────────────── */}
      <div style={{
        marginTop: 'auto',
        padding: '8px 12px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 6
      }}>
        {/* Primary Inspect CTA */}
        <button
          type="button"
          onClick={() => onInspect && onInspect(candidate)}
          className="btn btn-primary btn-sm"
          style={{ flex: 1, padding: '5px 12px', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
          title="Inspect stream, synchronized code, and telemetry in focused view"
        >
          <Maximize2 size={12} />
          <span>Inspect</span>
        </button>

        {/* Compact Icon Buttons: Warn, Flag, Terminate */}
        <button
          type="button"
          onClick={() => onIntervene && onIntervene(candidate)}
          className="btn btn-secondary btn-icon btn-sm"
          title="Send warning message to candidate"
          aria-label="Send warning message"
        >
          <MessageSquare size={13} />
        </button>

        <button
          type="button"
          onClick={() => onFlagIncident && onFlagIncident(candidate)}
          className="btn btn-secondary btn-icon btn-sm"
          title="Flag proctoring incident"
          aria-label="Flag incident"
        >
          <Flag size={13} />
        </button>

        {isLive && (
          <button
            type="button"
            onClick={() => onTerminate && onTerminate(candidate)}
            className="btn btn-danger-outline btn-icon btn-sm"
            title="Terminate candidate session"
            aria-label="Terminate session"
          >
            <PhoneOff size={13} />
          </button>
        )}

        {candidate.status === 'scheduled' && onActivate && (
          <button
            type="button"
            onClick={() => onActivate(candidate.interview_id || candidate.id)}
            className="btn btn-success btn-icon btn-sm"
            title="Activate scheduled exam"
            aria-label="Activate exam"
          >
            <Play size={13} />
          </button>
        )}
      </div>
    </div>
  );
}
