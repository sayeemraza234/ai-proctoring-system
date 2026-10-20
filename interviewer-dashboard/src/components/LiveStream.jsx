import { useEffect, useRef, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  Camera, CameraOff, Maximize2, Minimize2, Mic, MicOff,
  SwitchCamera, Radio, Volume2, User, Monitor, Wifi
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
  onStartCall = null,
  activeStreamSource = 'webcam',
  onToggleStreamSource = null,
  interviewMode: controlledMode,
  onInterviewModeChange = null
}) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const localVideoRef = useRef(null);
  const relayCanvasRef = useRef(null);
  const peerRef = useRef(null);
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const streamRef = localStreamRef; // alias for streamRef.current
  const isMutedRef = useRef(false);
  const isVideoOffRef = useRef(false);

  const [streamActive, setStreamActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [streamDuration, setStreamDuration] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState('waiting');
  const [localStream, setLocalStream] = useState(null);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  // Aliases for compatibility
  const isMuted = isMicMuted;
  const setIsMuted = setIsMicMuted;
  const [hasRelayFrame, setHasRelayFrame] = useState(false);
  const [isSwapped, setIsSwapped] = useState(false);
  const [interviewerStarted, setInterviewerStarted] = useState(false);
  const [currentStreamSource, setCurrentStreamSource] = useState(activeStreamSource);
  const [interviewMode, setInterviewMode] = useState(controlledMode || 'exam');

  useEffect(() => {
    if (controlledMode) setInterviewMode(controlledMode);
  }, [controlledMode]);

  useEffect(() => {
    setCurrentStreamSource(activeStreamSource);
  }, [activeStreamSource]);

  const handleToggleStreamSource = () => {
    const next = currentStreamSource === 'webcam' ? 'screen' : 'webcam';
    setCurrentStreamSource(next);
    if (onToggleStreamSource) {
      onToggleStreamSource(next);
    }
  };

  // Synchronously update stream state, refs, and attach to peer if active
  const updateLocalStream = useCallback((stream) => {
    localStreamRef.current = stream;
    setLocalStream(stream);
    if (typeof window !== 'undefined') {
      window.localStream = stream;
      window.__interviewerLocalStream = stream;
    }
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }
    if (peerRef.current && stream) {
      try {
        const existingTrackIds = new Set(peerRef.current.getSenders().map(s => s.track?.id).filter(Boolean));
        stream.getTracks().forEach(track => {
          if (track.kind === 'audio' && isMutedRef.current) track.enabled = false;
          if (track.kind === 'video' && isVideoOffRef.current) track.enabled = false;
          if (!existingTrackIds.has(track.id)) {
            peerRef.current.addTrack(track, stream);
          }
        });
      } catch (err) {
        console.warn('[INTERVIEWER-RTC] Could not attach track to existing peer:', err);
      }
    }
  }, []);

  // Helper to ensure interviewer camera & microphone are acquired
  const ensureLocalMedia = useCallback(async () => {
    let current = localStreamRef.current || localStream || (typeof window !== 'undefined' ? (window.localStream || window.__interviewerLocalStream) : null);
    if (current) {
      const liveTracks = current.getTracks().filter(t => t.readyState === 'live');
      if (liveTracks.length > 0) return current;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      updateLocalStream(stream);
      return stream;
    } catch (err) {
      console.warn('[INTERVIEWER] Audio+video capture error, falling back to video-only:', err);
      try {
        const vStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        updateLocalStream(vStream);
        return vStream;
      } catch (e) {
        console.warn('[INTERVIEWER] Camera access denied:', e);
        return null;
      }
    }
  }, [localStream, updateLocalStream]);

  // Robust stream retriever: dynamically acquires audio/video tracks if missing
  const getActiveStream = useCallback(async (requestedKind = null) => {
    let stream = localStreamRef.current || localStream || (typeof window !== 'undefined' ? (window.localStream || window.__interviewerLocalStream) : null);

    if (stream) {
      if (requestedKind === 'audio') {
        const liveAudio = stream.getAudioTracks().filter(t => t.readyState === 'live');
        if (liveAudio.length > 0) return stream;
        try {
          const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const newAudioTrack = audioStream.getAudioTracks()[0];
          if (newAudioTrack) {
            stream.addTrack(newAudioTrack);
            if (peerRef.current) {
              peerRef.current.addTrack(newAudioTrack, stream);
            }
            updateLocalStream(stream);
            return stream;
          }
        } catch (err) {
          console.warn('[INTERVIEWER] Could not dynamically acquire audio track:', err);
        }
      } else if (requestedKind === 'video') {
        const liveVideo = stream.getVideoTracks().filter(t => t.readyState === 'live');
        if (liveVideo.length > 0) return stream;
        try {
          const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
          const newVideoTrack = videoStream.getVideoTracks()[0];
          if (newVideoTrack) {
            stream.addTrack(newVideoTrack);
            if (peerRef.current) {
              peerRef.current.addTrack(newVideoTrack, stream);
            }
            updateLocalStream(stream);
            return stream;
          }
        } catch (err) {
          console.warn('[INTERVIEWER] Could not dynamically acquire video track:', err);
        }
      } else {
        return stream;
      }
    }

    try {
      const freshStream = await ensureLocalMedia();
      return freshStream;
    } catch {
      return null;
    }
  }, [localStream, updateLocalStream, ensureLocalMedia]);

  // Capture local interviewer webcam for 2-way interview on mount
  useEffect(() => {
    let activeLocalStream = null;
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then(stream => {
        activeLocalStream = stream;
        updateLocalStream(stream);
      })
      .catch(err => {
        console.warn('Interviewer camera/audio access fallback:', err);
        navigator.mediaDevices.getUserMedia({ video: true, audio: false })
          .then(vStream => {
            activeLocalStream = vStream;
            updateLocalStream(vStream);
          }).catch(() => {});
      });

    return () => {
      if (activeLocalStream) {
        activeLocalStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [updateLocalStream]);

  // Robust callback ref for local video node
  const setLocalVideoNode = useCallback((node) => {
    localVideoRef.current = node;
    const stream = localStreamRef.current || localStream;
    if (node && stream) {
      node.srcObject = stream;
      node.play().catch(() => {});
    }
  }, [localStream]);

  useEffect(() => {
    const stream = localStreamRef.current || localStream;
    if (localVideoRef.current && stream) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
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
  const toggleMute = useCallback(async () => {
    let stream = localStreamRef.current || localStream || (typeof window !== 'undefined' ? (window.localStream || window.__interviewerLocalStream) : null);
    if (!stream || stream.getAudioTracks().length === 0) {
      stream = await getActiveStream('audio');
    }

    if (!stream) {
      const nextState = !isMicMuted;
      setIsMicMuted(nextState);
      isMutedRef.current = nextState;
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      const nextState = !isMicMuted;
      setIsMicMuted(nextState);
      isMutedRef.current = nextState;
      return;
    }

    // Toggle: if currently muted (isMicMuted = true), we unmute (targetEnabled = true)
    // If currently unmuted, we mute (targetEnabled = false)
    const targetEnabled = isMicMuted;
    audioTracks.forEach(track => {
      track.enabled = targetEnabled;
    });

    if (peerRef.current) {
      peerRef.current.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'audio') {
          sender.track.enabled = targetEnabled;
        }
      });
    }

    const newMuted = !targetEnabled;
    setIsMicMuted(newMuted);
    isMutedRef.current = newMuted;

    if (socketRef.current && roomId) {
      socketRef.current.emit('call_action', {
        roomId: String(roomId),
        action: 'interviewer_media_state',
        isMicMuted: newMuted,
        isVideoOff: isVideoOffRef.current
      });
    }
  }, [isMicMuted, localStream, getActiveStream, roomId]);

  // Toggle Video Off
  const toggleVideo = useCallback(async () => {
    let stream = localStreamRef.current || localStream || (typeof window !== 'undefined' ? (window.localStream || window.__interviewerLocalStream) : null);
    if (!stream || stream.getVideoTracks().length === 0) {
      stream = await getActiveStream('video');
    }

    if (!stream) {
      const nextState = !isVideoOff;
      setIsVideoOff(nextState);
      isVideoOffRef.current = nextState;
      return;
    }

    const videoTracks = stream.getVideoTracks();
    if (videoTracks.length === 0) {
      const nextState = !isVideoOff;
      setIsVideoOff(nextState);
      isVideoOffRef.current = nextState;
      return;
    }

    // Toggle: if currently video is off (isVideoOff = true), we turn on (targetEnabled = true)
    // If currently video is on, we turn off (targetEnabled = false)
    const targetEnabled = isVideoOff;
    videoTracks.forEach(track => {
      track.enabled = targetEnabled;
    });

    if (peerRef.current) {
      peerRef.current.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'video') {
          sender.track.enabled = targetEnabled;
        }
      });
    }

    const newVideoOff = !targetEnabled;
    setIsVideoOff(newVideoOff);
    isVideoOffRef.current = newVideoOff;

    if (targetEnabled && localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
      localVideoRef.current.play().catch(() => {});
    }

    if (socketRef.current && roomId) {
      socketRef.current.emit('call_action', {
        roomId: String(roomId),
        action: 'interviewer_media_state',
        isMicMuted: isMutedRef.current,
        isVideoOff: newVideoOff
      });
    }
  }, [isVideoOff, localStream, getActiveStream, roomId]);

  const handleSetInterviewMode = (newMode) => {
    setInterviewMode(newMode);
    if (socketRef.current && roomId) {
      socketRef.current.emit('call_action', {
        roomId: String(roomId),
        action: 'interview_mode',
        mode: newMode
      });
    }
    if (onInterviewModeChange) {
      onInterviewModeChange(newMode);
    }
    if (newMode === 'face_to_face' && !interviewerStarted) {
      startInterview();
    }
  };

  const startInterview = async () => {
    let stream = localStreamRef.current || localStream;
    if (!stream) {
      stream = await ensureLocalMedia();
    }
    setInterviewerStarted(true);
    if (socketRef.current && roomId) {
      socketRef.current.emit('interviewer_started', {
        roomId: String(roomId),
        interviewerName
      });
      socketRef.current.emit('call_action', {
        roomId: String(roomId),
        action: 'interview_mode',
        mode: interviewMode
      });
    }
    if (peerRef.current && stream) {
      try {
        const existingTrackIds = new Set(peerRef.current.getSenders().map(s => s.track?.id).filter(Boolean));
        stream.getTracks().forEach(track => {
          if (track.kind === 'audio' && isMutedRef.current) {
            track.enabled = false;
          }
          if (track.kind === 'video' && isVideoOffRef.current) {
            track.enabled = false;
          }
          if (!existingTrackIds.has(track.id)) {
            peerRef.current.addTrack(track, stream);
          }
        });
        const offer = await peerRef.current.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
        await peerRef.current.setLocalDescription(offer);
        socketRef.current?.emit('offer', { roomId: String(roomId), signal: offer });
      } catch (err) {
        console.warn('[INTERVIEWER-RTC] Offer error on startInterview:', err);
      }
    } else if (socketRef.current) {
      socketRef.current.emit('peer_present');
    }
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

      const streamToAdd = localStreamRef.current || localStream;
      if (streamToAdd) {
        streamToAdd.getTracks().forEach(track => {
          if (track.kind === 'audio' && isMutedRef.current) {
            track.enabled = false;
          }
          if (track.kind === 'video' && isVideoOffRef.current) {
            track.enabled = false;
          }
          pc.addTrack(track, streamToAdd);
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

    // Remote call_action listener (Mode sync)
    socket.on('call_action', (data) => {
      if ((data?.action === 'interview_mode' || data?.action === 'set_mode') && (data.mode === 'face_to_face' || data.mode === 'exam')) {
        setInterviewMode(data.mode);
        if (onInterviewModeChange) onInterviewModeChange(data.mode);
      }
    });

    // Interviewer periodic frame relay to candidate
    const relayInterval = setInterval(() => {
      if (!isVideoOffRef.current && localVideoRef.current && localVideoRef.current.videoWidth > 0) {
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
  }, [roomId]);

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
      className="w-full h-full flex flex-col relative overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: compact ? '1px solid var(--border-subtle)' : 'none',
        borderRadius: compact ? '8px' : 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: compact ? 'var(--shadow-sm)' : 'none',
        position: 'relative',
        width: '100%',
        height: '100%'
      }}
    >
      {/* Top Stream Bar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 bg-slate-900/90 border-b border-slate-800 z-20 flex-shrink-0"
        style={{
          padding: '8px 14px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'rgba(15, 23, 42, 0.95)',
          flexShrink: 0,
          zIndex: 20
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
            background: streamActive ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-elevated)',
            color: streamActive ? '#10b981' : 'var(--text-muted)',
            border: `1px solid ${streamActive ? 'rgba(16, 185, 129, 0.3)' : 'var(--border-subtle)'}`
          }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: streamActive ? '#10b981' : 'var(--text-muted)',
              boxShadow: streamActive ? '0 0 6px #10b981' : 'none'
            }} />
            <span>{streamActive ? 'LIVE HD · 30fps' : interviewerStarted ? 'Waiting for Candidate' : 'Session Ready'}</span>
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

        {/* Video & Audio Controls - Clean flex group with proper spacing */}
        <div className="flex items-center gap-2.5 flex-wrap" style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
              style={{ whiteSpace: 'nowrap' }}
            >
              <Radio size={12} />
              <span>Start Interview Broadcast</span>
            </button>
          )}


          <button
            onClick={toggleMute}
            title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={`btn btn-sm ${isMicMuted ? 'btn-danger' : 'btn-secondary'}`}
            style={{
              background: isMicMuted ? '#ef4444' : undefined,
              color: isMicMuted ? '#ffffff' : undefined,
              borderColor: isMicMuted ? '#dc2626' : undefined,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isMicMuted ? <MicOff size={13} style={{ color: '#ffffff' }} /> : <Mic size={13} style={{ color: '#10b981' }} />}
            <span>{isMicMuted ? 'Muted' : 'Mic'}</span>
          </button>

          <button
            onClick={toggleVideo}
            title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
            className={`btn btn-sm ${isVideoOff ? 'btn-danger' : 'btn-secondary'}`}
            style={{
              background: isVideoOff ? '#ef4444' : undefined,
              color: isVideoOff ? '#ffffff' : undefined,
              borderColor: isVideoOff ? '#dc2626' : undefined,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {isVideoOff ? <CameraOff size={13} style={{ color: '#ffffff' }} /> : <Camera size={13} style={{ color: '#10b981' }} />}
            <span>{isVideoOff ? 'Camera Off' : 'Camera'}</span>
          </button>

          {/* Telemetry Indicator (28ms CAM / SCREEN ACTIVE) - Cleanly inline with buttons */}
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '2px 8px',
            borderRadius: 6,
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            fontSize: 10
          }}>
            <Wifi size={11} style={{ color: '#10b981' }} />
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: 'var(--text-primary)' }}>
              28ms
            </span>
            {currentStreamSource === 'screen' ? (
              <span className="badge" style={{ fontSize: 9, padding: '1px 5px', fontWeight: 700, background: '#10b981', color: '#ffffff' }}>SCREEN</span>
            ) : (
              <span className="badge badge-secondary" style={{ fontSize: 9, padding: '1px 5px' }}>CAM</span>
            )}
          </div>

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
        className="relative flex-1 w-full min-h-0 bg-slate-950 flex items-center justify-center overflow-hidden"
        style={{
          position: 'relative',
          background: '#020617',
          flex: 1,
          width: '100%',
          height: '100%',
          minHeight: 0,
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
          className={`w-full h-full object-contain bg-slate-950 ${isSwapped ? 'z-30' : 'z-1'}`}
          style={{
            position: 'absolute',
            inset: isSwapped ? 'auto' : 0,
            bottom: isSwapped ? '16px' : 0,
            right: isSwapped ? '16px' : 0,
            width: isSwapped ? 'clamp(170px, 20vw, 192px)' : '100%',
            height: isSwapped ? 'clamp(120px, 15vw, 144px)' : '100%',
            aspectRatio: isSwapped ? '16 / 9' : 'unset',
            objectFit: 'contain',
            background: '#020617',
            borderRadius: isSwapped ? 12 : 0,
            border: isSwapped ? '2px solid rgba(99, 102, 241, 0.7)' : 'none',
            boxShadow: isSwapped ? '0 20px 25px -5px rgba(0, 0, 0, 0.5)' : 'none',
            opacity: streamActive && !hasRelayFrame ? 1 : 0,
            transition: 'opacity 0.2s ease',
            zIndex: isSwapped ? 30 : 1
          }}
        />

        {/* Canvas for Socket Relay */}
        <canvas
          ref={relayCanvasRef}
          className={`w-full h-full object-contain bg-slate-950 ${isSwapped ? 'z-30' : 'z-2'}`}
          style={{
            position: 'absolute',
            inset: isSwapped ? 'auto' : 0,
            bottom: isSwapped ? '16px' : 0,
            right: isSwapped ? '16px' : 0,
            width: isSwapped ? 'clamp(170px, 20vw, 192px)' : '100%',
            height: isSwapped ? 'clamp(120px, 15vw, 144px)' : '100%',
            aspectRatio: isSwapped ? '16 / 9' : 'unset',
            objectFit: 'contain',
            background: '#020617',
            borderRadius: isSwapped ? 12 : 0,
            border: isSwapped ? '2px solid rgba(99, 102, 241, 0.7)' : 'none',
            boxShadow: isSwapped ? '0 20px 25px -5px rgba(0, 0, 0, 0.5)' : 'none',
            display: hasRelayFrame ? 'block' : 'none',
            zIndex: isSwapped ? 30 : 2
          }}
        />

        {/* Remote Candidate Label */}
        {streamActive && !isSwapped && (
          <div
            className="absolute top-3 left-3 z-10 flex items-center gap-1.5"
            style={{
              position: 'absolute',
              top: 12,
              left: 12,
              background: 'rgba(9, 13, 22, 0.88)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              border: '1px solid var(--border-subtle)',
              borderRadius: '6px',
              padding: '3px 8px',
              fontSize: '11px',
              fontWeight: '600',
              color: 'var(--text-primary)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              zIndex: 10
            }}
          >
            <User size={12} style={{ color: 'var(--text-muted)' }} />
            <span>{candidateName || 'Candidate'}</span>
            {currentStreamSource === 'screen' && (
              <span style={{
                background: 'rgba(16, 185, 129, 0.2)',
                border: '1px solid #10b981',
                color: '#10b981',
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 4,
                letterSpacing: '0.04em'
              }}>
                SCREEN ACTIVE
              </span>
            )}
          </div>
        )}

        {/* Local PiP Interviewer Video (Always bounded in bottom-right) */}
        {(localStream || interviewerStarted) && (
          <div
            className={`absolute overflow-hidden shadow-2xl ${
              isSwapped
                ? 'inset-0 z-1 w-full h-full rounded-none'
                : 'bottom-4 right-4 z-30 w-44 h-32 sm:w-48 sm:h-36 rounded-xl border-2 border-indigo-500/70 bg-slate-900'
            }`}
            style={{
              position: 'absolute',
              bottom: isSwapped ? 0 : '16px',
              right: isSwapped ? 0 : '16px',
              top: isSwapped ? 0 : 'auto',
              left: isSwapped ? 0 : 'auto',
              width: isSwapped ? '100%' : undefined,
              height: isSwapped ? '100%' : undefined,
              borderRadius: isSwapped ? 0 : '12px',
              overflow: 'hidden',
              border: isSwapped ? 'none' : '2px solid rgba(99, 102, 241, 0.7)',
              boxShadow: isSwapped ? 'none' : '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5)',
              zIndex: isSwapped ? 1 : 30,
              background: '#0f172a'
            }}
          >
            <video
              ref={setLocalVideoNode}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover object-center"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center',
                background: '#0f172a',
                display: isVideoOff ? 'none' : (localStream ? 'block' : 'none')
              }}
            />
            {!localStream && !isVideoOff && (
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0f172a',
                color: 'var(--text-muted)',
                gap: 4
              }}>
                <Radio size={16} className="animate-pulse" style={{ color: '#818cf8' }} />
                <span style={{ fontSize: 9 }}>Starting camera...</span>
              </div>
            )}
            {isVideoOff && (
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#0f172a',
                color: 'var(--text-muted)',
                gap: 4
              }}>
                <CameraOff size={18} />
                <span style={{ fontSize: 10 }}>Camera Off</span>
              </div>
            )}
            <div
              className="absolute bottom-1.5 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-white font-bold tracking-wide pointer-events-none z-10"
              style={{
                position: 'absolute',
                bottom: 6,
                left: 8,
                fontSize: 10,
                fontWeight: 700,
                color: '#ffffff',
                background: 'rgba(0, 0, 0, 0.7)',
                padding: '2px 6px',
                borderRadius: 4,
                letterSpacing: 0.5,
                zIndex: 10,
                pointerEvents: 'none'
              }}
            >
              YOU {isMuted ? '• Muted' : ''}
            </div>
          </div>
        )}

        {/* Floating Bottom-Center Controls (Rendered in both Split and Feed Focus modes) */}
        {!compact && (
          <div
            className="stream-bottom-controls absolute bottom-4 left-1/2 -translate-x-1/2 z-30 pointer-events-auto flex items-center gap-1.5"
            style={{
              position: 'absolute',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(10, 10, 14, 0.88)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              border: '1px solid rgba(255, 255, 255, 0.16)',
              borderRadius: 9999,
              padding: '4px 10px',
              zIndex: 30,
              pointerEvents: 'auto',
              boxShadow: '0 4px 16px rgba(0, 0, 0, 0.6)'
            }}
          >
            {/* View Screen Toggle Button */}
            <button
              type="button"
              onClick={handleToggleStreamSource}
              className={`btn btn-sm ${currentStreamSource === 'screen' ? 'btn-success active' : 'btn-ghost'}`}
              style={{
                padding: '3px 10px',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 600,
                borderRadius: 9999,
                background: currentStreamSource === 'screen' ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                border: `1px solid ${currentStreamSource === 'screen' ? '#10b981' : 'rgba(255, 255, 255, 0.14)'}`,
                boxShadow: currentStreamSource === 'screen' ? '0 0 12px rgba(16, 185, 129, 0.5)' : 'none',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                pointerEvents: 'auto'
              }}
              title={currentStreamSource === 'screen' ? 'Currently viewing candidate screen share. Click to switch to camera.' : 'Click to view candidate screen share.'}
            >
              {currentStreamSource === 'screen' ? <Camera size={12} /> : <Monitor size={12} />}
              <span>{currentStreamSource === 'screen' ? 'Viewing Screen' : 'View Screen'}</span>
            </button>

            <span style={{ width: 1, height: 12, background: 'rgba(255, 255, 255, 0.2)' }} />

            {/* Mic Toggle Button */}
            <button
              type="button"
              onClick={toggleMute}
              className={`btn btn-sm ${isMicMuted ? 'btn-danger' : 'btn-ghost'}`}
              style={{
                padding: '3px 9px',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 600,
                borderRadius: 9999,
                background: isMicMuted ? '#ef4444' : 'rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                border: `1px solid ${isMicMuted ? '#dc2626' : 'rgba(255, 255, 255, 0.14)'}`,
                boxShadow: isMicMuted ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none',
                cursor: 'pointer',
                pointerEvents: 'auto',
                transition: 'all 0.2s ease'
              }}
              title={isMicMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {isMicMuted ? <MicOff size={13} style={{ color: '#ffffff' }} /> : <Mic size={13} style={{ color: '#10b981' }} />}
              <span>{isMicMuted ? 'Muted' : 'Mic'}</span>
            </button>

            {/* Camera Toggle Button */}
            <button
              type="button"
              onClick={toggleVideo}
              className={`btn btn-sm ${isVideoOff ? 'btn-danger' : 'btn-ghost'}`}
              style={{
                padding: '3px 9px',
                fontSize: 11,
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontWeight: 600,
                borderRadius: 9999,
                background: isVideoOff ? '#ef4444' : 'rgba(255, 255, 255, 0.08)',
                color: '#ffffff',
                border: `1px solid ${isVideoOff ? '#dc2626' : 'rgba(255, 255, 255, 0.14)'}`,
                boxShadow: isVideoOff ? '0 0 10px rgba(239, 68, 68, 0.5)' : 'none',
                cursor: 'pointer',
                pointerEvents: 'auto',
                transition: 'all 0.2s ease'
              }}
              title={isVideoOff ? 'Turn camera on' : 'Turn camera off'}
            >
              {isVideoOff ? <CameraOff size={13} style={{ color: '#ffffff' }} /> : <Camera size={13} style={{ color: '#10b981' }} />}
              <span>{isVideoOff ? 'Cam Off' : 'Camera'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LiveStream;
