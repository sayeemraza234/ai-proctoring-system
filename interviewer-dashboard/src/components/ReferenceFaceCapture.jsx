import { useState, useRef, useEffect, useCallback } from 'react';
import { Camera, RefreshCw, CheckCircle, AlertTriangle, Upload, Eye, X } from 'lucide-react';
import {
  getSharedVisionEngine,
  extractFaceDescriptor,
  captureVideoSnapshot
} from '../utils/proctorAiEngine';

export default function ReferenceFaceCapture({ value, onChange, label = 'Reference Face Portrait (Anti-Impersonation)' }) {
  const [isCamOpen, setIsCamOpen] = useState(false);
  const [detectionState, setDetectionState] = useState({
    readyToCapture: false,
    message: 'Position your face in the center of the guide...',
    level: 'info' // 'info' | 'success' | 'warning' | 'danger'
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const [activeStream, setActiveStream] = useState(null);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const loopTimerRef = useRef(null);

  const stopCamera = useCallback(() => {
    if (loopTimerRef.current) {
      clearInterval(loopTimerRef.current);
      loopTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setActiveStream(null);
    setIsCamOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const startCamera = async () => {
    stopCamera();
    setIsCamOpen(true);
    setDetectionState({
      readyToCapture: false,
      message: 'Accessing webcam and loading face landmarker...',
      level: 'info'
    });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false
      });
      streamRef.current = stream;
      setActiveStream(stream);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }

      // Initialize vision engine
      const engine = await getSharedVisionEngine();
      if (!engine) {
        setDetectionState({
          readyToCapture: false,
          message: 'Unable to load vision models. Please refresh and try again.',
          level: 'danger'
        });
        return;
      }

      // Start detection check loop
      loopTimerRef.current = setInterval(() => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        const res = engine.detectSingleFaceFromVideo(videoRef.current);

        if (res.success) {
          setDetectionState({
            readyToCapture: true,
            message: '✓ Face verified & centered. Ready to capture!',
            level: 'success',
            lastResult: res
          });
        } else {
          setDetectionState({
            readyToCapture: false,
            message: res.error || 'Please look straight into camera.',
            level: res.count > 1 ? 'danger' : 'warning',
            lastResult: null
          });
        }
      }, 300);

    } catch (err) {
      console.error('[ReferenceFaceCapture] Camera error:', err);
      setDetectionState({
        readyToCapture: false,
        message: 'Camera permission denied or camera unavailable.',
        level: 'danger'
      });
    }
  };

  const handleCapture = async () => {
    if (!videoRef.current) return;
    setIsCapturing(true);

    try {
      const engine = await getSharedVisionEngine();
      const res = engine ? engine.detectSingleFaceFromVideo(videoRef.current) : null;

      // Extract snapshot from video
      const snapshot = captureVideoSnapshot(videoRef.current);
      if (!snapshot) {
        setDetectionState({
          readyToCapture: false,
          message: 'Failed to capture frame. Please try again.',
          level: 'danger'
        });
        setIsCapturing(false);
        return;
      }

      const descriptor = (res && res.success && res.descriptor) ? res.descriptor : null;

      if (!descriptor) {
        setDetectionState({
          readyToCapture: false,
          message: 'Face must be clearly visible and centered before capturing.',
          level: 'warning'
        });
        setIsCapturing(false);
        return;
      }

      const faceData = {
        snapshot,
        descriptor,
        timestamp: Date.now()
      };

      stopCamera();
      onChange(faceData);
    } catch (err) {
      console.error('[ReferenceFaceCapture] Capture error:', err);
    } finally {
      setIsCapturing(false);
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result;
      if (!dataUrl) return;

      // Load image to compute landmarks if possible
      const img = new Image();
      img.onload = async () => {
        try {
          const engine = await getSharedVisionEngine();
          let descriptor = null;
          if (engine && engine.faceLandmarker) {
            const canvas = document.createElement('canvas');
            canvas.width = Math.min(img.width, 640);
            canvas.height = Math.round(canvas.width * (img.height / img.width));
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const results = engine.faceLandmarker.detectForVideo(canvas, performance.now());
            if (results && results.faceLandmarks && results.faceLandmarks.length === 1) {
              descriptor = extractFaceDescriptor(results.faceLandmarks[0]);
            }
          }

          // Generate 160x160 thumbnail to prevent localStorage quota crash
          let snapshotThumb = dataUrl;
          try {
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = 160;
            thumbCanvas.height = 160;
            const tCtx = thumbCanvas.getContext('2d');
            tCtx.drawImage(img, 0, 0, 160, 160);
            snapshotThumb = thumbCanvas.toDataURL('image/jpeg', 0.6);
          } catch {}

          onChange({
            snapshot: snapshotThumb,
            descriptor,
            timestamp: Date.now()
          });
        } catch {
          let snapshotThumb = dataUrl;
          try {
            const thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = 160;
            thumbCanvas.height = 160;
            const tCtx = thumbCanvas.getContext('2d');
            tCtx.drawImage(img, 0, 0, 160, 160);
            snapshotThumb = thumbCanvas.toDataURL('image/jpeg', 0.6);
          } catch {}
          onChange({
            snapshot: snapshotThumb,
            descriptor: null,
            timestamp: Date.now()
          });
        }
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ marginTop: 8, marginBottom: 8 }}>
      <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>{label}</span>
        <span style={{ fontSize: 10, color: 'var(--primary)', fontWeight: 600 }}>Anti-Impersonation Lock</span>
      </label>

      {/* Captured Preview State */}
      {value && value.snapshot ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14,
          padding: 12, borderRadius: 10,
          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)'
        }}>
          <div style={{ position: 'relative', width: 64, height: 64, borderRadius: '50%', overflow: 'hidden', border: '2px solid #10b981', flexShrink: 0 }}>
            <img src={value.snapshot} alt="Reference Face" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#10b981' }}>
              <CheckCircle size={14} />
              <span>Reference Face Enrolled</span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', lineHeight: 1.4 }}>
              Biometric craniofacial descriptor extracted and locked for identity verification.
            </p>
          </div>
          <button
            type="button"
            onClick={() => { onChange(null); startCamera(); }}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: 11, padding: '4px 8px' }}
          >
            <RefreshCw size={12} /> Retake
          </button>
        </div>
      ) : isCamOpen ? (
        /* Camera Active Capture Box */
        <div style={{
          padding: 12, borderRadius: 12, background: '#0a0a10',
          border: `1.5px solid ${detectionState.level === 'success' ? '#10b981' : detectionState.level === 'danger' ? '#ef4444' : '#6366f1'}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10
        }}>
          <div style={{ position: 'relative', width: 280, height: 210, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }}
            />
            {/* Oval Face Guide Frame */}
            <div style={{
              position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
              width: 130, height: 170, borderRadius: '50%',
              border: `2px dashed ${detectionState.level === 'success' ? '#10b981' : 'rgba(255,255,255,0.4)'}`,
              boxShadow: detectionState.level === 'success' ? '0 0 15px rgba(16, 185, 129, 0.4)' : 'none',
              pointerEvents: 'none'
            }} />
          </div>

          {/* Feedback pill */}
          <div style={{
            fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 20, textAlign: 'center',
            color: detectionState.level === 'success' ? '#10b981' : detectionState.level === 'danger' ? '#ef4444' : '#f59e0b',
            background: detectionState.level === 'success' ? 'rgba(16, 185, 129, 0.12)' : detectionState.level === 'danger' ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)'
          }}>
            {detectionState.message}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={handleCapture}
              disabled={isCapturing || !detectionState.readyToCapture}
              className="btn btn-primary btn-sm"
              style={{
                flex: 1, maxWidth: 180,
                background: detectionState.readyToCapture ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)' : undefined
              }}
            >
              <Camera size={13} />
              <span>{isCapturing ? 'Analyzing...' : 'Capture Face'}</span>
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="btn btn-secondary btn-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        /* Enrollment Options Buttons */
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            type="button"
            onClick={startCamera}
            className="btn btn-secondary"
            style={{ flex: 1, padding: '9px 12px', fontSize: 12, justifyContent: 'center', gap: 6 }}
          >
            <Camera size={14} style={{ color: 'var(--primary)' }} />
            <span>Enroll with Webcam</span>
          </button>
          <label
            className="btn btn-secondary"
            style={{
              padding: '9px 12px', fontSize: 12, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6
            }}
          >
            <Upload size={14} />
            <span>Upload Photo</span>
            <input type="file" accept="image/*" onChange={handleFileUpload} style={{ display: 'none' }} />
          </label>
        </div>
      )}
    </div>
  );
}
