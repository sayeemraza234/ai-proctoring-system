import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import {
  Camera, CameraOff, Maximize2, Minimize2, Mic, MicOff,
  SwitchCamera, Radio, Volume2, User
} from 'lucide-react';

const BACKEND = import.meta.env.VITE_BACKEND_URL
  || (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'http://127.0.0.1:5000'
      : (window.location.hostname.includes('loca.lt')
          ? `https://${window.location.hostname.replace('.loca.lt', '-api.loca.lt')}`
          : 'https://ai-proctoring-system-8nma.onrender.com'));

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' }
  ]
};

const LiveStream = ({
  roomId,
  candidateName,
  interviewerName = 'Interviewer',
  compact = false,
  onStartCall = null
}) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const localVideoRef = useRef(null);
  const relayCanvasRef = useRef(null);
  const peerRef = useRef(null);
  const socketRef = useRef(null);

  const [streamActive, setStreamActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamDuration, setStreamDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState('waiting');
  const [localStream, setLocalStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [hasRelayFrame, setHasRelayFrame] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);
  const [interviewerStarted, setInterviewerStarted] = useState(false);

  // Capture local interviewer webcam for 2-way interview
  useEffect(() => {
    let activeLocalStream = null;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        setLocalStream(stream);
        activeLocalStream = stream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }
      })
      .catch(err => {
        console.warn('Interviewer camera/audio access fallback:', err);
        navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          .then(vStream => {
            setLocalStream(vStream);
            activeLocalStream = vStream;
            if (localVideoRef.current) localVideoRef.current.srcObject = vStream;
          }).catch(() => {});
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

  // Toggle Mute Audio
  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle Video Off
  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  const startInterview = () => {
    if (!socketRef.current || !roomId) return;
    socketRef.current.emit('interviewer_started', { roomId: String(roomId), interviewerName });
    setInterviewerStarted(true);
    if (onStartCall) onStartCall();
  };

  // WebRTC & Fail-safe Relay Connection
  useEffect(() => {
    if (!roomId) return;
    setStreamActive(false);
    setHasRelayFrame(false);
    setConnectionQuality('waiting');

    const socket = io(`${BACKEND}/signaling`);
    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('[INTERVIEWER-SIGNAL] Connected, room:', roomId);
      socket.emit('join_room', String(roomId));
    });

    const createPeer = async (isInitiator) => {
      if (peerRef.current) {
        try { peerRef.current.close(); } catch {}
      }

      const pc = new RTCPeerConnection(rtcConfig);
      peerRef.current = pc;

      if (localStream) {
        localStream.getTracks().forEach(track => {
          pc.addTrack(track, localStream);
        });
      }

      pc.ontrack = (event) => {
        const remoteStream = event.streams[0] || new MediaStream([event.track]);
        if (videoRef.current) {
          videoRef.current.srcObject = remoteStream;
          videoRef.current.play().catch(e => console.warn('Autoplay prevented:', e));
          setStreamActive(true);
          setConnectionQuality('good');
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('ice_candidate', {
            roomId: String(roomId),
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setStreamActive(true);
          setConnectionQuality('good');
        } else if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          setConnectionQuality(hasRelayFrame ? 'good' : 'disconnected');
        }
      };

      if (isInitiator) {
        try {
          const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
          await pc.setLocalDescription(offer);
          socket.emit('offer', { roomId: String(roomId), signal: offer });
        } catch (err) {
          console.error('[INTERVIEWER-RTC] Offer error:', err);
        }
      }
    };

    socket.on('peer_present', () => createPeer(true));
    socket.on('user_joined', () => createPeer(true));

    socket.on('offer', async (data) => {
      await createPeer(false);
      const pc = peerRef.current;
      if (pc) {
        try {
          const sdp = data.signal || data;
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('answer', { roomId: String(roomId), signal: answer });
        } catch (err) {
          console.error('[INTERVIEWER-RTC] Answer error:', err);
        }
      }
    });

    socket.on('answer', async (data) => {
      const pc = peerRef.current;
      if (pc) {
        try {
          const sdp = data.signal || data;
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
        } catch(err) {
          console.error('[INTERVIEWER-RTC] Set remote desc error:', err);
        }
      }
    });

    socket.on('ice_candidate', async (data) => {
      const pc = peerRef.current;
      if (pc && data.candidate) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch {}
      }
    });

    // Fallback socket frame relay
    socket.on('remote_frame', (data) => {
      if (data && data.image) {
        setHasRelayFrame(true);
        setStreamActive(true);
        setConnectionQuality('good');
        const img = new Image();
        img.onload = () => {
          if (relayCanvasRef.current) {
            const ctx = relayCanvasRef.current.getContext('2d');
            relayCanvasRef.current.width = img.width;
            relayCanvasRef.current.height = img.height;
            ctx.drawImage(img, 0, 0);
          }
        };
        img.src = data.image;
      }
    });

    // Interviewer periodic frame relay to candidate
    const relayInterval = setInterval(() => {
      if (localVideoRef.current && localVideoRef.current.videoWidth > 0) {
        try {
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = 320;
          tempCanvas.height = 240;
          const ctx = tempCanvas.getContext('2d');
          ctx.drawImage(localVideoRef.current, 0, 0, 320, 240);
          const frameData = tempCanvas.toDataURL('image/jpeg', 0.45);
          socket.emit('relay_frame', {
            roomId: String(roomId),
            role: 'interviewer',
            image: frameData
          });
        } catch {}
      }
    }, 1500);

    return () => {
      clearInterval(relayInterval);
      if (peerRef.current) {
        try { peerRef.current.close(); } catch {}
      }
      socket.disconnect();
    };
  }, [roomId, localStream]);

  // Fullscreen
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const fmtTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div
      ref={containerRef}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-subtle)',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-sm)',
        position: 'relative'
      }}
    >
      {/* Top Stream Bar */}
      <div
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'var(--bg-surface)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 8px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: '600',
            background: streamActive ? 'var(--success-bg)' : 'var(--bg-elevated)',
            color: streamActive ? 'var(--success)' : 'var(--text-muted)',
            border: `1px solid ${streamActive ? 'var(--success-border)' : 'var(--border-subtle)'}`
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: streamActive ? 'var(--success)' : 'var(--text-muted)',
              boxShadow: streamActive ? '0 0 6px var(--success)' : 'none'
            }} />
            <span>{streamActive ? 'Live Video' : interviewerStarted ? 'Waiting for Candidate' : 'Session Ready'}</span>
          </div>

          {streamActive && (
            <span style={{
              fontSize: '11px',
              fontFamily: "'JetBrains Mono', monospace",
              color: 'var(--text-secondary)',
              background: 'var(--bg-elevated)',
              padding: '2px 8px',
              borderRadius: '4px',
              border: '1px solid var(--border-faint)'
            }}>
              {fmtTime(streamDuration)}
            </span>
          )}
        </div>

        {/* Video & Audio Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setIsSwapped(value => !value)}
            title="Switch primary video view"
            className="btn btn-ghost btn-icon btn-sm"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            <SwitchCamera size={13} />
          </button>

          {!interviewerStarted && !streamActive && (
            <button
              onClick={startInterview}
              className="btn btn-primary btn-sm"
            >
              <Radio size={12} />
              <span>Start Interview Broadcast</span>
            </button>
          )}

          <button
            onClick={toggleMute}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`btn btn-sm ${isMuted ? 'btn-danger-outline' : 'btn-secondary'}`}
          >
            {isMuted ? <MicOff size={13} /> : <Mic size={13} />}
            <span>{isMuted ? 'Muted' : 'Mic'}</span>
          </button>

          <button
            onClick={toggleVideo}
            title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
            className={`btn btn-sm ${isVideoOff ? 'btn-danger-outline' : 'btn-secondary'}`}
          >
            {isVideoOff ? <CameraOff size={13} /> : <Camera size={13} />}
            <span>{isVideoOff ? 'Camera Off' : 'Camera'}</span>
          </button>

          <button
            onClick={toggleFullscreen}
            title="Toggle fullscreen video"
            className="btn btn-ghost btn-icon btn-sm"
            style={{ border: '1px solid var(--border-subtle)' }}
          >
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* Main Video View Stage */}
      <div
        style={{
          position: 'relative',
          background: '#040711',
          height: compact ? '260px' : 'clamp(320px, 46vh, 520px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden'
        }}
      >
        {/* Waiting Placeholder */}
        {!streamActive && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px',
            textAlign: 'center',
            padding: '24px',
            maxWidth: '380px'
          }}>
            <div style={{
              width: '52px',
              height: '52px',
              borderRadius: '50%',
              background: 'var(--primary-light)',
              border: '1px solid var(--primary-border)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)'
            }}>
              <Camera size={22} />
            </div>
            <div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', marginBottom: '4px' }}>
                {interviewerStarted ? `Connecting to ${candidateName || 'candidate'}...` : 'Ready to start the video stream'}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {interviewerStarted
                  ? 'Waiting for candidate to open exam terminal and activate their camera feed.'
                  : 'Click "Start Interview Broadcast" to signal the candidate and begin two-way video.'}
              </div>
            </div>
          </div>
        )}

        {/* Candidate Remote Video Stream */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          style={{
            position: 'absolute',
            inset: isSwapped ? '12px auto auto 12px' : 0,
            width: isSwapped ? 'clamp(140px, 15vw, 200px)' : '100%',
            height: isSwapped ? 'clamp(95px, 11vw, 140px)' : '100%',
            objectFit: 'cover',
            borderRadius: isSwapped ? 8 : 0,
            border: isSwapped ? '2px solid var(--primary)' : 'none',
            opacity: streamActive && !hasRelayFrame ? 1 : 0,
            transition: 'opacity 0.2s ease',
            zIndex: isSwapped ? 10 : 1
          }}
        />

        {/* Canvas for Socket Relay */}
        <canvas
          ref={relayCanvasRef}
          style={{
            position: 'absolute',
            inset: isSwapped ? '12px auto auto 12px' : 0,
            width: isSwapped ? 'clamp(140px, 15vw, 200px)' : '100%',
            height: isSwapped ? 'clamp(95px, 11vw, 140px)' : '100%',
            objectFit: 'cover',
            borderRadius: isSwapped ? 8 : 0,
            border: isSwapped ? '2px solid var(--primary)' : 'none',
            display: hasRelayFrame ? 'block' : 'none',
            zIndex: isSwapped ? 10 : 2
          }}
        />

        {/* Remote Candidate Label */}
        {streamActive && !isSwapped && (
          <div style={{
            position: 'absolute',
            top: 12,
            left: 12,
            background: 'rgba(9, 13, 22, 0.75)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-subtle)',
            borderRadius: '6px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: '600',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            zIndex: 5
          }}>
            <User size={12} style={{ color: 'var(--text-muted)' }} />
            <span>{candidateName || 'Candidate'}</span>
          </div>
        )}

        {/* Local PiP Interviewer Video */}
        {localStream && (
          <div
            style={{
              position: 'absolute',
              bottom: isSwapped ? 'auto' : '12px',
              right: isSwapped ? 'auto' : '12px',
              top: isSwapped ? '12px' : 'auto',
              left: isSwapped ? '12px' : 'auto',
              width: isSwapped ? '100%' : 'clamp(140px, 15vw, 200px)',
              height: isSwapped ? '100%' : 'clamp(95px, 11vw, 140px)',
              borderRadius: isSwapped ? 0 : '8px',
              overflow: 'hidden',
              border: isSwapped ? 'none' : '2px solid var(--border-medium)',
              boxShadow: isSwapped ? 'none' : 'var(--shadow-lg)',
              zIndex: isSwapped ? 1 : 10,
              background: '#09101d'
            }}
          >
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: isVideoOff ? 'none' : 'block'
              }}
            />
            {isVideoOff && (
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'var(--bg-card)',
                color: 'var(--text-muted)',
                gap: 4
              }}>
                <CameraOff size={18} />
                <span style={{ fontSize: 10 }}>Camera Off</span>
              </div>
            )}
            <div style={{
              position: 'absolute',
              bottom: 4,
              left: 6,
              fontSize: 10,
              fontWeight: 700,
              color: '#ffffff',
              background: 'rgba(0, 0, 0, 0.65)',
              padding: '2px 6px',
              borderRadius: 4,
              letterSpacing: 0.5
            }}>
              YOU {isMuted ? '• Muted' : ''}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveStream;
