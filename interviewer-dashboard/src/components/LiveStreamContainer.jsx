import React, { useState } from 'react';
import {
  Camera, CameraOff, Maximize2, Monitor, Mic, MicOff,
  Wifi, Shield, Volume2, Radio, RefreshCw, AlertTriangle
} from 'lucide-react';
import LiveStream from './LiveStream';

/**
 * LiveStreamContainer
 * Enterprise 16:9 Aspect Ratio WebRTC Video / Screen Stream Container
 * Features:
 * - Clean 16:9 aspect ratio
 * - Live status indicators (FPS, resolution, network latency)
 * - Source switching (Webcam feed vs Screen share)
 * - Deep dive inspect overlay
 * - Standby/Offline elegant placeholder with connection radar
 */
export default function LiveStreamContainer({
  candidate,
  roomId,
  isLive = false,
  compact = false,
  streamType = 'webcam', // 'webcam' | 'screen'
  onInspect,
  interviewerName = 'Interviewer',
  height,
  isFocused = false,
  layoutMode = 'split',
  onToggleStreamSource,
  interviewMode,
  onInterviewModeChange
}) {
  const [activeStreamSource, setActiveStreamSource] = useState(streamType);
  const [isMuted, setIsMuted] = useState(false);
  const [showLiveFeed, setShowLiveFeed] = useState(true);

  const candidateName = candidate?.candidate_name || candidate?.fullname || 'Candidate';
  const resolvedRoomId = roomId || candidate?.interview_id || candidate?.id;

  const handleToggleStream = (newSource) => {
    const next = typeof newSource === 'string' ? newSource : (activeStreamSource === 'webcam' ? 'screen' : 'webcam');
    setActiveStreamSource(next);
    if (onToggleStreamSource) onToggleStreamSource(next);
  };

  return (
    <div
      className={
        compact
          ? 'stream-aspect-container aspect-video w-full'
          : layoutMode === 'videoFocus'
            ? 'w-full h-[calc(100vh-270px)] min-h-[320px] max-h-[500px] relative overflow-hidden rounded-xl bg-slate-950 flex flex-col'
            : 'w-full h-[calc(100vh-310px)] min-h-[280px] max-h-[440px] relative overflow-hidden rounded-xl bg-slate-950 flex flex-col'
      }
      style={{
        position: 'relative',
        width: '100%',
        height: compact ? undefined : layoutMode === 'videoFocus' ? 'calc(100vh - 270px)' : 'calc(100vh - 310px)',
        minHeight: compact ? undefined : layoutMode === 'videoFocus' ? 320 : 280,
        maxHeight: compact ? undefined : layoutMode === 'videoFocus' ? 500 : 440,
        backgroundColor: '#020617',
        borderRadius: compact ? 0 : 12,
        overflow: 'hidden',
        border: 'none',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      {/* ── TOP-LEFT STATUS BADGE (Compact Grid Cards Preview Only) ─────── */}
      {compact && isLive && (
        <div className="stream-overlay-badge stream-badge-top-left pointer-events-none" style={{ zIndex: 15, padding: '2px 6px', pointerEvents: 'none' }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: '#10b981',
            boxShadow: '0 0 6px #10b981'
          }} />
          <span style={{ fontWeight: 700, fontSize: 9, letterSpacing: '0.05em' }}>LIVE</span>
        </div>
      )}

      {/* ── MAIN STREAM CANVAS / WEBRTC FEED ────────────────────────────── */}
      {isLive ? (
        compact ? (
          /* Compact Stream Preview for Grid Cards - Entire Card Feed is Clickable */
          <div
            onClick={() => onInspect && onInspect(candidate)}
            title="Click stream to deep-dive inspect candidate"
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: onInspect ? 'pointer' : 'default',
              background: 'linear-gradient(180deg, #07090e 0%, #0f1118 100%)',
              transition: 'background 0.2s ease'
            }}
          >
            {/* Subtle Matrix Scan Background */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage: 'radial-gradient(rgba(99, 102, 241, 0.08) 1px, transparent 0)',
                backgroundSize: '16px 16px',
                opacity: 0.7
              }}
            />

            {/* Candidate Stream Icon & Pulsing Ring */}
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: '50%',
                background: 'rgba(99, 102, 241, 0.12)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--primary)',
                position: 'relative',
                zIndex: 2,
                transition: 'transform 0.2s ease'
              }}
            >
              {activeStreamSource === 'screen' ? <Monitor size={22} /> : <Camera size={22} />}
              <span
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 11,
                  height: 11,
                  borderRadius: '50%',
                  background: '#10b981',
                  border: '2px solid #090a0f',
                  boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)'
                }}
              />
            </div>

            <div style={{ textAlign: 'center', zIndex: 2, marginTop: 8, padding: '0 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                {candidateName}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                WebRTC Stream Active
              </div>
            </div>
          </div>
        ) : (
          /* Full Deep-Dive WebRTC Feed Container */
          <div
            className="w-full h-full flex-1 min-h-0 relative overflow-hidden"
            style={{ width: '100%', height: '100%', flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}
          >
            <LiveStream
              roomId={resolvedRoomId}
              candidateName={candidateName}
              interviewerName={interviewerName}
              compact={false}
              activeStreamSource={activeStreamSource}
              onToggleStreamSource={handleToggleStream}
              interviewMode={interviewMode}
              onInterviewModeChange={onInterviewModeChange}
            />
          </div>
        )
      ) : (
        /* Standby / Offline Placeholder */
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(180deg, #090a0f 0%, #11131a 100%)',
            color: 'var(--text-muted)',
            padding: 16,
            textAlign: 'center'
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 8,
              color: 'var(--text-muted)'
            }}
          >
            <CameraOff size={22} />
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            Candidate Awaiting in Lobby
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
            {candidate?.status === 'scheduled'
              ? 'Exam scheduled · Stream activates when started'
              : 'Candidate stream offline'}
          </div>
        </div>
      )}
    </div>
  );
}
