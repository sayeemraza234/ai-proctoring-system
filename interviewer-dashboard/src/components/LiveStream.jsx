import React, { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { Camera, CameraOff, AlertTriangle, Maximize2, Minimize2, Wifi, WifiOff, Monitor, Radio } from 'lucide-react';

const BACKEND = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://127.0.0.1:5000'
  : (window.location.hostname.includes('loca.lt')
      ? `https://${window.location.hostname.replace('.loca.lt', '-api.loca.lt')}`
      : (window.location.hostname.includes('localtunnel.me')
          ? `https://${window.location.hostname.replace('.localtunnel.me', '-api.localtunnel.me')}`
          : 'http://127.0.0.1:5000'));

const LiveStream = ({ roomId, candidateName }) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const localVideoRef = useRef(null);
  const [streamActive, setStreamActive] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeFeed, setActiveFeed] = useState('camera');
  const [streamDuration, setStreamDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState('waiting');
  const [localStream, setLocalStream] = useState(null);

  // Capture local interviewer webcam
  useEffect(() => {
    let activeLocalStream;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setLocalStream(stream);
        activeLocalStream = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.warn('Interviewer camera/audio access denied or unavailable:', err);
      });

    return () => {
      if (activeLocalStream) {
        activeLocalStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Stream timer
  useEffect(() => {
    let timer;
    if (streamActive) {
      setConnectionQuality('good');
      timer = setInterval(() => setStreamDuration(t => t + 1), 1000);
    } else {
      setStreamDuration(0);
    }
    return () => clearInterval(timer);
  }, [streamActive]);

  // WebRTC connection
  useEffect(() => {
    setStreamActive(false);
    setHasError(false);
    setConnectionQuality('waiting');

    const socket = io(`${BACKEND}/signaling`);
    let peer;
    let offerHandled = false;

    socket.on('connect', () => {
      socket.emit('join_room', String(roomId));
    });

    socket.on('offer', data => {
      if (offerHandled) return;
      offerHandled = true;
      peer = new SimplePeer({ 
        initiator: false, 
        trickle: false,
        stream: localStream || undefined
      });

      peer.on('signal', signal => {
        socket.emit('answer', { roomId: String(roomId), signal });
      });

      peer.on('stream', stream => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.error);
          setStreamActive(true);
        }
      });

      peer.on('connect', () => setConnectionQuality('good'));
      peer.on('error', err => {
        console.error('WebRTC error:', err);
        setHasError(true);
        setConnectionQuality('error');
      });
      peer.on('close', () => {
        setStreamActive(false);
        setConnectionQuality('disconnected');
      });

      peer.signal(data.signal);
    });

    socket.on('disconnect', () => setConnectionQuality('disconnected'));

    return () => {
      socket.disconnect();
      if (peer) peer.destroy();
    };
  }, [roomId, localStream]);

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);

  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  const qualityColor = {
    waiting: 'rgba(143,160,184,0.4)',
    good: '#22c55e',
    error: '#ef4444',
    disconnected: '#f59e0b'
  }[connectionQuality];

  const qualityLabel = {
    waiting: 'Awaiting Connection',
    good: 'Stream Active',
    error: 'Connection Error',
    disconnected: 'Disconnected'
  }[connectionQuality];

  return (
    <div ref={containerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(5,13,26,0.6)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', overflow: 'hidden', position: 'relative' }}>
      {/* Header */}
      <div style={{ padding: '14px 18px', borderBottom: '1px solid rgba(255,255,255,0.04)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(5,13,26,0.4)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: streamActive ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)', border: `1px solid ${streamActive ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.05)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.3s' }}>
            <Camera style={{ width: '16px', height: '16px', color: streamActive ? '#22c55e' : 'rgba(143,160,184,0.4)' }} />
          </div>
          <div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: '16px', fontWeight: '600', color: '#f5f0e8', lineHeight: 1 }}>{candidateName}</h2>
            <p style={{ fontSize: '10px', color: 'rgba(143,160,184,0.4)', marginTop: '2px', fontFamily: "'JetBrains Mono', monospace" }}>
              Session ID: {String(roomId).slice(-8)}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Connection quality */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 10px', borderRadius: '6px', background: 'rgba(5,13,26,0.6)', border: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: qualityColor, animation: connectionQuality === 'good' ? 'pulseGold 2s ease infinite' : 'none' }} />
            <span style={{ fontSize: '10px', color: qualityColor, fontWeight: '600', letterSpacing: '0.04em' }}>{qualityLabel}</span>
          </div>

          {/* Live badge */}
          {streamActive && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '4px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <Radio style={{ width: '11px', height: '11px', color: '#ef4444' }} />
              <span style={{ fontSize: '10px', fontWeight: '800', color: '#fca5a5', letterSpacing: '0.06em' }}>LIVE</span>
            </div>
          )}

          {/* Uptime */}
          {streamActive && (
            <span style={{ fontSize: '11px', color: 'rgba(143,160,184,0.5)', fontFamily: "'JetBrains Mono', monospace", padding: '4px 10px', background: 'rgba(5,13,26,0.6)', border: '1px solid rgba(255,255,255,0.04)', borderRadius: '6px' }}>
              {fmtTime(streamDuration)}
            </span>
          )}

          {/* Fullscreen */}
          <button onClick={toggleFullscreen}
            style={{ width: '32px', height: '32px', borderRadius: '6px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(143,160,184,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {isFullscreen ? <Minimize2 style={{ width: '14px', height: '14px' }} /> : <Maximize2 style={{ width: '14px', height: '14px' }} />}
          </button>
        </div>
      </div>

      {/* Feed Toggle */}
      <div style={{ display: 'flex', gap: '6px', padding: '10px 18px', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
        {[
          { id: 'camera', label: 'Webcam Feed', Icon: Camera },
          { id: 'screen', label: 'Screen Monitor', Icon: Monitor },
        ].map(({ id, label, Icon }) => (
          <button key={id} onClick={() => setActiveFeed(id)}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '5px 14px', borderRadius: '6px', fontSize: '11px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.15s',
              border: `1px solid ${activeFeed === id ? 'rgba(212,160,23,0.3)' : 'rgba(255,255,255,0.05)'}`,
              background: activeFeed === id ? 'rgba(212,160,23,0.08)' : 'transparent',
              color: activeFeed === id ? '#d4a017' : 'rgba(143,160,184,0.5)' }}>
            <Icon style={{ width: '12px', height: '12px' }} /> {label}
          </button>
        ))}
      </div>

      {/* Main Video Area */}
      <div style={{ flex: 1, position: 'relative', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '280px' }}>
        {activeFeed === 'camera' ? (
          <>
            {/* Waiting state */}
            {!streamActive && !hasError && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center', padding: '24px' }}>
                <div style={{ position: 'relative', width: '64px', height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '3px solid rgba(212,160,23,0.1)', borderTopColor: 'rgba(212,160,23,0.4)', animation: 'spin 1.5s linear infinite' }} />
                  <CameraOff style={{ width: '24px', height: '24px', color: 'rgba(143,160,184,0.2)' }} />
                </div>
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: 'rgba(245,240,232,0.5)', marginBottom: '4px' }}>Awaiting live feed...</p>
                  <p style={{ fontSize: '12px', color: 'rgba(143,160,184,0.3)' }}>Candidate must click "Activate Camera & Begin Exam"</p>
                </div>
              </div>
            )}

            {/* Error state */}
            {hasError && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', textAlign: 'center', padding: '24px' }}>
                <AlertTriangle style={{ width: '40px', height: '40px', color: 'rgba(239,68,68,0.5)' }} />
                <div>
                  <p style={{ fontSize: '14px', fontWeight: '600', color: '#fca5a5', marginBottom: '4px' }}>WebRTC Connection Failed</p>
                  <p style={{ fontSize: '12px', color: 'rgba(143,160,184,0.4)' }}>Could not establish peer-to-peer video stream</p>
                </div>
              </div>
            )}

            {/* Video element */}
            <video ref={videoRef} autoPlay playsInline
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: streamActive ? 1 : 0, transition: 'opacity 0.5s ease' }} />

            {/* Local Interviewer Video Preview (Picture in Picture) */}
            {localStream && (
              <div style={{ position: 'absolute', bottom: '16px', right: '16px', width: '120px', height: '90px', borderRadius: '8px', overflow: 'hidden', border: '2px solid rgba(255,255,255,0.2)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 10 }}>
                <video ref={localVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
            )}

            {/* Scan lines overlay effect */}
            {streamActive && (
              <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px)', pointerEvents: 'none', zIndex: 1 }} />
            )}

            {/* Bottom status bar */}
            {streamActive && (
              <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to top, rgba(0,0,0,0.8) 0%, transparent 100%)', zIndex: 2 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Wifi style={{ width: '12px', height: '12px', color: '#22c55e' }} />
                  <span style={{ fontSize: '10px', color: 'rgba(245,240,232,0.6)', fontFamily: "'JetBrains Mono', monospace" }}>WebRTC P2P Connected</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ width: '2px', borderRadius: '1px', background: '#22c55e', height: `${i * 4}px`, animation: 'pulseGold 1s ease infinite', animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* Screen Monitor Panel */
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '20px' }}>
            <Monitor style={{ width: '48px', height: '48px', color: 'rgba(212,160,23,0.2)' }} />
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: '14px', fontWeight: '600', color: 'rgba(245,240,232,0.4)', marginBottom: '6px' }}>Desktop Screen Monitoring</p>
              <p style={{ fontSize: '12px', color: 'rgba(143,160,184,0.3)', maxWidth: '280px', lineHeight: 1.6 }}>
                Screen share capture will appear here when the candidate grants desktop access.
              </p>
            </div>
            <div style={{ padding: '6px 16px', borderRadius: '20px', background: 'rgba(212,160,23,0.06)', border: '1px solid rgba(212,160,23,0.15)', fontSize: '10px', color: 'rgba(212,160,23,0.5)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em' }}>
              DESKTOP-SHIELD: MONITORING
            </div>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes pulseGold { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>
    </div>
  );
};

export default LiveStream;
