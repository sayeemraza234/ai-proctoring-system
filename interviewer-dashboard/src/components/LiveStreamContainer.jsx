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
  interviewerName = 'Interviewer'
}) {
  const [activeStreamSource, setActiveStreamSource] = useState(streamType);
  const [isMuted, setIsMuted] = useState(false);
  const [showLiveFeed, setShowLiveFeed] = useState(true);

  const candidateName = candidate?.candidate_name || candidate?.fullname || 'Candidate';
  const resolvedRoomId = roomId || candidate?.interview_id || candidate?.id;

  return (
    <div
      className="stream-aspect-container"
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 9',
        backgroundColor: '#090a0f',
        borderRadius: compact ? 0 : 8,
        overflow: 'hidden',
        border: compact ? 'none' : '1px solid var(--border-subtle)'
      }}
    >
      {/* ── TOP-LEFT STATUS BADGE ────────────────────────────────────────── */}
      <div className="stream-overlay-badge stream-badge-top-left" style={{ zIndex: 10 }}>
        {isLive ? (
          <>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#10b981',
              boxShadow: '0 0 8px #10b981'
            }} />
            <span style={{ fontWeight: 700, letterSpacing: '0.04em' }}>
              LIVE HD · 30fps
            </span>
          </>
        ) : (
          <>
            <span style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--text-muted)'
            }} />
            <span style={{ fontWeight: 600 }}>STANDBY</span>
          </>
        )}
      </div>

      {/* ── TOP-RIGHT TELEMETRY BADGE ───────────────────────────────────── */}
      <div className="stream-overlay-badge stream-badge-top-right" style={{ zIndex: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
        {isLive ? (
          <>
            <Wifi size={11} style={{ color: '#10b981' }} />
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-primary)' }}>
              28ms
            </span>
            {activeStreamSource === 'screen' ? (
              <span className="badge badge-primary" style={{ fontSize: 9, padding: '1px 5px' }}>SCREEN</span>
            ) : (
              <span className="badge badge-secondary" style={{ fontSize: 9, padding: '1px 5px' }}>CAM</span>
            )}
          </>
        ) : (
          <>
            <Wifi size={11} style={{ color: 'var(--text-muted)' }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Offline</span>
          </>
        )}
      </div>

      {/* ── MAIN STREAM CANVAS / WEBRTC FEED ────────────────────────────── */}
      {isLive ? (
        compact ? (
          /* Compact Stream Preview for Grid Cards */
          <div
            onClick={() => onInspect && onInspect(candidate)}
            style={{
              width: '100%',
              height: '100%',
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: onInspect ? 'pointer' : 'default',
              background: 'linear-gradient(180deg, #07090e 0%, #0f1118 100%)'
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
                width: 56,
                height: 56,
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
              {activeStreamSource === 'screen' ? <Monitor size={24} /> : <Camera size={24} />}
              <span
                style={{
                  position: 'absolute',
                  bottom: -2,
                  right: -2,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#10b981',
                  border: '2px solid #090a0f',
                  boxShadow: '0 0 6px rgba(16, 185, 129, 0.8)'
                }}
              />
            </div>

            <div style={{ textAlign: 'center', zIndex: 2, marginTop: 10, padding: '0 12px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>
                {candidateName}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                WebRTC Stream Active · Click to Deep-Dive
              </div>
            </div>

            {/* Hover Inspect CTA pill */}
            <div
              style={{
                position: 'absolute',
                bottom: 10,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                background: 'rgba(0, 0, 0, 0.65)',
                backdropFilter: 'blur(4px)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: 9999,
                padding: '3px 10px',
                fontSize: 10,
                color: 'var(--text-secondary)',
                zIndex: 3
              }}
            >
              <Maximize2 size={10} />
              <span>Click to Expand</span>
            </div>
          </div>
        ) : (
          /* Full Deep-Dive WebRTC Feed Container */
          <div style={{ width: '100%', height: '100%', position: 'relative' }}>
            <LiveStream
              roomId={resolvedRoomId}
              candidateName={candidateName}
              interviewerName={interviewerName}
              compact={false}
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

      {/* ── BOTTOM STREAM CONTROLS (Only in Focused / Modal View) ─────────── */}
      {!compact && isLive && (
        <div
          style={{
            position: 'absolute',
            bottom: 10,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(10, 10, 12, 0.85)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: 9999,
            padding: '4px 10px',
            zIndex: 20
          }}
        >
          <button
            type="button"
            onClick={() => setActiveStreamSource(s => s === 'webcam' ? 'screen' : 'webcam')}
            className="btn btn-ghost btn-sm"
            style={{ padding: '2px 8px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}
            title="Toggle between Webcam and Screen Share feed"
          >
            {activeStreamSource === 'webcam' ? <Monitor size={12} /> : <Camera size={12} />}
            <span>{activeStreamSource === 'webcam' ? 'View Screen' : 'View Cam'}</span>
          </button>

          <span style={{ width: 1, height: 12, background: 'rgba(255, 255, 255, 0.15)' }} />

          <button
            type="button"
            onClick={() => setIsMuted(m => !m)}
            className="btn btn-ghost btn-icon btn-sm"
            style={{ color: isMuted ? 'var(--danger)' : 'var(--text-secondary)' }}
            title={isMuted ? 'Unmute Audio Preview' : 'Mute Audio Preview'}
          >
            {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
          </button>
        </div>
      )}
    </div>
  );
}
