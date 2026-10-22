import { useState, useRef, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import {
  Shield, CheckCircle, AlertTriangle, Camera, User, Lock,
  ChevronRight, ArrowLeft, RefreshCw, Sparkles, AlertOctagon,
  LogOut, Award, Check, Scan, Eye
} from 'lucide-react';
import {
  getSharedVisionEngine,
  extractFaceDescriptor,
  calculateFaceMatchScore,
  saveReferenceFace,
  getReferenceFace,
  captureVideoSnapshot
} from '../utils/proctorAiEngine';

const BACKEND = (() => {
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:5000';
  if (host.includes('loca.lt')) return `https://${host.replace('.loca.lt', '-api.loca.lt')}`;
  return 'https://ai-proctoring-system-8nma.onrender.com';
})();

export default function BiometricVerificationGate({ currentUser, onVerified, onBack, onLogout }) {
  const username = currentUser?.username || 'candidate';
  const fullname = currentUser?.fullname || currentUser?.username || 'Candidate';
  const interviewId = currentUser?.interview_id || currentUser?.interviewId || currentUser?._id;

  // Reference face retrieved from localStorage or user state
  const [referenceFace, setReferenceFace] = useState(() => {
    return getReferenceFace(username) ||
           getReferenceFace(currentUser?.email) ||
           getReferenceFace(currentUser?._id) ||
           null;
  });

  const [streamActive, setStreamActive] = useState(false);
  const [streamError, setStreamError] = useState(null);

  // Scanning & Matching state
  const [faceCheckState, setFaceCheckState] = useState({
    isValid: false,
    message: 'Initializing biometric scanner...',
    level: 'info' // 'info' | 'success' | 'warning' | 'danger'
  });
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyProgress, setVerifyProgress] = useState(0);
  const [verifyStepText, setVerifyStepText] = useState('');
  const [matchScore, setMatchScore] = useState(null);
  const [verificationStatus, setVerificationStatus] = useState('pending'); // 'pending' | 'verified' | 'mismatch'
  const [mismatchError, setMismatchError] = useState('');

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const checkLoopRef = useRef(null);
  const socketRef = useRef(null);

  // Stop camera tracks
  const stopCamera = useCallback(() => {
    if (checkLoopRef.current) {
      clearInterval(checkLoopRef.current);
      checkLoopRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setStreamActive(false);
  }, []);

  // Initialize socket for reporting impersonation security alerts to interviewer
  useEffect(() => {
    if (!interviewId) return;
    try {
      const sock = io(`${BACKEND}/proctor`);
      socketRef.current = sock;
      sock.on('connect', () => {
        sock.emit('join_room', String(interviewId));
      });
      return () => {
        sock.disconnect();
      };
    } catch {}
  }, [interviewId]);

  // Start webcam
  const startCamera = useCallback(async () => {
    stopCamera();
    setStreamError(null);
    setFaceCheckState({
      isValid: false,
      message: 'Accessing webcam and calibrating face mesh...',
      level: 'info'
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });
      streamRef.current = stream;
      setStreamActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      const engine = await getSharedVisionEngine();
      if (!engine) {
        setFaceCheckState({
          isValid: false,
          message: 'Unable to load MediaPipe AI Vision models.',
          level: 'danger'
        });
        return;
      }

      // Detection monitoring loop
      checkLoopRef.current = setInterval(() => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        const res = engine.detectSingleFaceFromVideo(videoRef.current);

        if (res.success) {
          setFaceCheckState({
            isValid: true,
            message: '✓ 1 Face Detected (Centered & Forward-Facing)',
            level: 'success',
            lastResult: res
          });
        } else {
          setFaceCheckState({
            isValid: false,
            message: res.error || 'Please position your face directly in the frame.',
            level: res.count > 1 ? 'danger' : 'warning',
            lastResult: null
          });
        }
      }, 300);

    } catch (err) {
      console.error('[BiometricVerificationGate] Camera error:', err);
      setStreamError('Webcam access was denied or device is not available. Please allow camera permissions.');
      setStreamActive(false);
    }
  }, [stopCamera]);

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  // First-time enrollment if candidate had no baseline reference face
  const handleEnrollFirstTime = async () => {
    if (!videoRef.current) return;
    const engine = await getSharedVisionEngine();
    const res = engine ? engine.detectSingleFaceFromVideo(videoRef.current) : null;

    if (!res || !res.success || !res.descriptor) {
      setMismatchError('Please position your face clearly in the camera center before enrolling.');
      return;
    }

    const snapshot = captureVideoSnapshot(videoRef.current);
    const newRef = {
      snapshot,
      descriptor: res.descriptor,
      timestamp: Date.now(),
      enrolledBy: 'first_login'
    };

    saveReferenceFace(username, newRef);
    if (currentUser?.email) saveReferenceFace(currentUser.email, newRef);
    if (currentUser?._id) saveReferenceFace(currentUser._id, newRef);
    setReferenceFace(newRef);
    setVerificationStatus('verified');
    setMatchScore(100);
  };

  // Perform Biometric Verification Scan
  const handleVerifyIdentity = async () => {
    if (!videoRef.current || isVerifying) return;
    setMismatchError('');
    setIsVerifying(true);
    setVerifyProgress(10);
    setVerifyStepText('Detecting 3D facial mesh & head pose...');

    const engine = await getSharedVisionEngine();
    if (!engine) {
      setMismatchError('Failed to initialize AI vision models.');
      setIsVerifying(false);
      return;
    }

    // Step 1: Detect live face
    const liveRes = engine.detectSingleFaceFromVideo(videoRef.current);
    if (!liveRes.success) {
      setMismatchError(liveRes.error || 'Please ensure exactly 1 face is visible and looking forward.');
      setIsVerifying(false);
      return;
    }

    // Step 2: Animate scanning progression
    await new Promise(r => setTimeout(r, 300));
    setVerifyProgress(45);
    setVerifyStepText('Computing invariant craniofacial geometry ratios...');

    await new Promise(r => setTimeout(r, 400));
    setVerifyProgress(80);
    setVerifyStepText('Comparing against enrolled reference biometric descriptor...');

    // If no reference face exists, auto-lock current face as baseline
    let activeRef = referenceFace;
    if (!activeRef || !activeRef.descriptor) {
      const snap = captureVideoSnapshot(videoRef.current);
      activeRef = {
        snapshot: snap,
        descriptor: liveRes.descriptor,
        timestamp: Date.now(),
        enrolledBy: 'first_login'
      };
      saveReferenceFace(username, activeRef);
      if (currentUser?.email) saveReferenceFace(currentUser.email, activeRef);
      setReferenceFace(activeRef);
    }

    // Compute match score
    const score = calculateFaceMatchScore(activeRef.descriptor, liveRes.descriptor);
    setMatchScore(score);

    await new Promise(r => setTimeout(r, 300));
    setVerifyProgress(100);
    setVerifyStepText('Scan complete.');
    setIsVerifying(false);

    // Threshold: 80%
    if (score >= 80) {
      setVerificationStatus('verified');
    } else {
      setVerificationStatus('mismatch');
      setMismatchError(
        `Biometric Mismatch (${score}% Match): Live face does not match the registered candidate profile. Impersonation attempt blocked.`
      );

      // Report alert to interviewer proctor room
      if (socketRef.current) {
        socketRef.current.emit('proctor_event', {
          type: 'impersonation_blocked',
          candidateName: fullname,
          score,
          details: `Biometric face mismatch: Live candidate (${score}%) failed reference verification gate.`
        });
      }
    }
  };

  const handleProceedToExam = () => {
    stopCamera();
    onVerified(referenceFace);
  };

  return (
    <div style={{
      minHeight: '100vh', width: '100vw', background: '#09090f', color: '#f4f4f5',
      display: 'flex', flexDirection: 'column', overflowY: 'auto', userSelect: 'none'
    }}>
      {/* ── TOP SECURITY HEADER BAR ─────────────────────────────────────── */}
      <header style={{
        height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', background: '#101018', borderBottom: '1px solid rgba(255,255,255,0.08)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8, background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#818cf8'
          }}>
            <Shield size={20} />
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>ProctorAI Biometric Authentication Gate</span>
              <span style={{
                fontSize: 10, padding: '2px 8px', borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444', fontWeight: 800, letterSpacing: '0.04em'
              }}>
                EXAM LOCK ACTIVE
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#a1a1aa' }}>
              Mandatory Anti-Impersonation & Facial Identity Verification Check
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onBack && (
            <button onClick={() => { stopCamera(); onBack(); }} className="btn btn-secondary btn-sm">
              <ArrowLeft size={13} /> Return
            </button>
          )}
          {onLogout && (
            <button onClick={() => { stopCamera(); onLogout(); }} className="btn btn-ghost btn-sm" style={{ color: '#ef4444' }}>
              <LogOut size={13} /> Sign Out
            </button>
          )}
        </div>
      </header>

      {/* ── MAIN VERIFICATION STAGE ─────────────────────────────────────── */}
      <main style={{
        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', padding: '32px 20px', maxWidth: 1100, margin: '0 auto', width: '100%'
      }}>
        {/* Verification Status Banner */}
        {verificationStatus === 'verified' && (
          <div style={{
            width: '100%', marginBottom: 24, padding: '16px 20px', borderRadius: 12,
            background: 'linear-gradient(90deg, rgba(16, 185, 129, 0.2) 0%, rgba(5, 150, 105, 0.25) 100%)',
            border: '1.5px solid #10b981', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            boxShadow: '0 4px 20px rgba(16, 185, 129, 0.2)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <Check size={22} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#10b981' }}>
                  Identity Verified: Welcome, {fullname}!
                </div>
                <div style={{ fontSize: 12, color: '#d1fae5', marginTop: 2 }}>
                  Biometric confidence score: <strong>{matchScore}% Match</strong>. Impersonation verification passed.
                </div>
              </div>
            </div>
            <button
              onClick={handleProceedToExam}
              className="btn btn-primary btn-lg"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#fff', border: 'none', padding: '12px 24px', fontWeight: 800,
                boxShadow: '0 0 15px rgba(16, 185, 129, 0.5)'
              }}
            >
              <span>Proceed to Secure Exam Kiosk</span>
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {verificationStatus === 'mismatch' && (
          <div style={{
            width: '100%', marginBottom: 24, padding: '16px 20px', borderRadius: 12,
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.2) 0%, rgba(185, 28, 28, 0.25) 100%)',
            border: '1.5px solid #ef4444', display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 4px 20px rgba(239, 68, 68, 0.25)'
          }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <AlertOctagon size={22} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#ef4444' }}>
                BIOMETRIC MISMATCH: IMPERSONATION ATTEMPT DETECTED
              </div>
              <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 2 }}>
                {mismatchError} Live candidate face does not match the registered baseline profile. Exam lock remains active.
              </div>
            </div>
          </div>
        )}

        {/* ── TWO-COLUMN COMPARISON SCANNER ────────────────────────────── */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 24, width: '100%', marginBottom: 28
        }}>
          {/* LEFT: Registered Baseline Reference Profile */}
          <div style={{
            background: '#12121c', borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)',
            padding: 24, display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#a5b4fc' }}>
                <Award size={16} />
                <span>REGISTERED IDENTITY PROFILE</span>
              </div>
              <span style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 6,
                background: referenceFace ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                color: referenceFace ? '#10b981' : '#f59e0b', fontWeight: 700
              }}>
                {referenceFace ? 'BASELINE ENROLLED' : 'FIRST-TIME ENROLLMENT'}
              </span>
            </div>

            {/* Photo / Baseline Box */}
            <div style={{
              width: '100%', height: 260, borderRadius: 12, overflow: 'hidden',
              background: '#0a0a10', border: '1px solid rgba(255,255,255,0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
              marginBottom: 16
            }}>
              {referenceFace?.snapshot ? (
                <img
                  src={referenceFace.snapshot}
                  alt="Registered Candidate"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ textAlign: 'center', padding: 24, color: '#a1a1aa' }}>
                  <User size={48} style={{ margin: '0 auto 12px', color: '#6366f1' }} />
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#e4e4e7', marginBottom: 6 }}>
                    No Reference Photo on File
                  </div>
                  <p style={{ fontSize: 11, lineHeight: 1.5, margin: 0 }}>
                    Please position your face in the live scanner on the right. Your initial verified scan will lock your biometric baseline profile.
                  </p>
                </div>
              )}
              {referenceFace?.snapshot && (
                <div style={{
                  position: 'absolute', bottom: 10, left: 10, right: 10,
                  background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)',
                  padding: '6px 10px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6,
                  fontSize: 10, color: '#10b981', fontWeight: 700
                }}>
                  <CheckCircle size={12} />
                  <span>3D Craniofacial Landmark Profile Active</span>
                </div>
              )}
            </div>

            {/* Candidate Metadata */}
            <div style={{ background: '#181824', borderRadius: 10, padding: 14, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#71717a' }}>Full Name:</span>
                <strong style={{ color: '#ffffff' }}>{fullname}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#71717a' }}>Username / Handle:</span>
                <strong style={{ color: '#a5b4fc' }}>{username}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#71717a' }}>Assessment ID:</span>
                <span style={{ color: '#e4e4e7', fontFamily: 'monospace', fontSize: 11 }}>
                  {String(interviewId).slice(-10)}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT: Live Webcam Biometric Scanner */}
          <div style={{
            background: '#12121c', borderRadius: 16,
            border: `1.5px solid ${verificationStatus === 'mismatch' ? '#ef4444' : verificationStatus === 'verified' ? '#10b981' : isVerifying ? '#6366f1' : 'rgba(255,255,255,0.08)'}`,
            padding: 24, display: 'flex', flexDirection: 'column', transition: 'border-color 0.3s'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#818cf8' }}>
                <Camera size={16} />
                <span>LIVE BIOMETRIC SCANNER</span>
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700,
                color: faceCheckState.level === 'success' ? '#10b981' : faceCheckState.level === 'danger' ? '#ef4444' : '#f59e0b'
              }}>
                <span style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: faceCheckState.level === 'success' ? '#10b981' : '#f59e0b',
                  boxShadow: `0 0 6px ${faceCheckState.level === 'success' ? '#10b981' : '#f59e0b'}`
                }} />
                <span>{faceCheckState.message}</span>
              </div>
            </div>

            {/* Video Stage with HUD Corner Brackets & Laser Scanner Overlay */}
            <div style={{
              width: '100%', height: 260, borderRadius: 12, overflow: 'hidden',
              background: '#000', position: 'relative', border: '1px solid rgba(255,255,255,0.12)'
            }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
              />

              {/* HUD Target Framing */}
              <div style={{
                position: 'absolute', top: 16, left: 16, width: 24, height: 24,
                borderTop: '2px solid #6366f1', borderLeft: '2px solid #6366f1', pointerEvents: 'none'
              }} />
              <div style={{
                position: 'absolute', top: 16, right: 16, width: 24, height: 24,
                borderTop: '2px solid #6366f1', borderRight: '2px solid #6366f1', pointerEvents: 'none'
              }} />
              <div style={{
                position: 'absolute', bottom: 16, left: 16, width: 24, height: 24,
                borderBottom: '2px solid #6366f1', borderLeft: '2px solid #6366f1', pointerEvents: 'none'
              }} />
              <div style={{
                position: 'absolute', bottom: 16, right: 16, width: 24, height: 24,
                borderBottom: '2px solid #6366f1', borderRight: '2px solid #6366f1', pointerEvents: 'none'
              }} />

              {/* Oval Face Guide */}
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: 140, height: 180, borderRadius: '50%',
                border: `2px dashed ${faceCheckState.isValid ? '#10b981' : 'rgba(255,255,255,0.3)'}`,
                boxShadow: faceCheckState.isValid ? '0 0 20px rgba(16, 185, 129, 0.4)' : 'none',
                pointerEvents: 'none', transition: 'border-color 0.2s, box-shadow 0.2s'
              }} />

              {/* Animated Scanning Laser Beam */}
              {isVerifying && (
                <div style={{
                  position: 'absolute', left: 0, right: 0, height: 3,
                  background: 'linear-gradient(90deg, transparent, #10b981, transparent)',
                  boxShadow: '0 0 12px #10b981',
                  animation: 'scannerLaser 1.5s ease-in-out infinite alternate',
                  pointerEvents: 'none'
                }} />
              )}
            </div>

            {/* Scanning Progress & Verification Controls */}
            <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {isVerifying && (
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4, color: '#a5b4fc' }}>
                    <span>{verifyStepText}</span>
                    <span>{verifyProgress}%</span>
                  </div>
                  <div style={{ width: '100%', height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{
                      width: `${verifyProgress}%`, height: '100%',
                      background: 'linear-gradient(90deg, #6366f1 0%, #10b981 100%)',
                      transition: 'width 0.25s'
                    }} />
                  </div>
                </div>
              )}

              {matchScore !== null && (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '8px 12px', borderRadius: 8, background: '#181824', fontSize: 12
                }}>
                  <span style={{ color: '#a1a1aa' }}>Identity Match Confidence:</span>
                  <strong style={{ fontSize: 14, color: matchScore >= 80 ? '#10b981' : '#ef4444' }}>
                    {matchScore}% {matchScore >= 80 ? '— Verified Genuine' : '— Mismatch Blocked'}
                  </strong>
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={handleVerifyIdentity}
                  disabled={isVerifying || !faceCheckState.isValid}
                  className="btn btn-primary"
                  style={{
                    flex: 1, padding: '12px 18px', fontWeight: 700, fontSize: 13,
                    background: faceCheckState.isValid ? 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)' : undefined
                  }}
                >
                  <Scan size={15} />
                  <span>{isVerifying ? 'Scanning Live Face...' : 'Verify Identity & Unlock Exam'}</span>
                </button>

                {!referenceFace && (
                  <button
                    type="button"
                    onClick={handleEnrollFirstTime}
                    disabled={!faceCheckState.isValid}
                    className="btn btn-secondary"
                    style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700 }}
                  >
                    Lock Baseline Face
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Security Advisory footer */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: '#71717a',
          textAlign: 'center', maxWidth: 680
        }}>
          <Lock size={14} style={{ color: '#818cf8', flexShrink: 0 }} />
          <span>
            ProctorAI locks your cranial facial geometry descriptor for continuous seat-swap detection. Swapping seats with another person during the assessment triggers immediate malpractice flags and deductions.
          </span>
        </div>
      </main>

      {/* Laser scan animation styles */}
      <style>{`
        @keyframes scannerLaser {
          0% { top: 10%; }
          100% { top: 90%; }
        }
      `}</style>
    </div>
  );
}
