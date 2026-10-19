/**
 * ProctorAI Pre-Trained Vision Engine
 * Real-time In-Browser Face Mesh & Prohibited Object Detection
 * 
 * Powered by:
 * - MediaPipe Face Landmarker (@mediapipe/tasks-vision)
 * - TensorFlow.js COCO-SSD (@tensorflow-models/coco-ssd)
 */

import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';

// Model Asset Endpoints
const MEDIAPIPE_WASM_PATH = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const FACE_LANDMARKER_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

// Key Facial Landmark Indices
export const LANDMARKS = {
  NOSE_TIP: 1,
  FOREHEAD: 10,
  CHIN: 152,
  LEFT_EYE_OUTER: 33,
  RIGHT_EYE_OUTER: 263,
  LEFT_EYE_INNER: 133,
  RIGHT_EYE_INNER: 362,
  LEFT_EAR_TRAGUS: 234,
  RIGHT_EAR_TRAGUS: 454,
  LEFT_MOUTH_CORNER: 61,
  RIGHT_MOUTH_CORNER: 291
};

// Safe Head Pose Angle Thresholds
export const POSE_THRESHOLDS = {
  YAW_LEFT_MAX: -26,       // Head rotated right from camera's perspective
  YAW_RIGHT_MAX: 26,       // Head rotated left from camera's perspective
  PITCH_DOWN_MAX: 20,      // Looking down toward desk / lap / phone
  PITCH_UP_MAX: -18,       // Looking up toward ceiling / secondary monitor
  VELOCITY_MAX: 0.18       // Centroid movement velocity per frame
};

// Target Prohibited Objects
export const PROHIBITED_OBJECT_CLASSES = [
  'cell phone',
  'book',
  'laptop'
];

export class ProctorAiEngine {
  constructor(options = {}) {
    this.onViolation = options.onViolation || (() => {});
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onTelemetry = options.onTelemetry || (() => {});
    this.cooldownMs = options.cooldownMs || 4000;
    this.detectionIntervalMs = options.detectionIntervalMs || 250;

    // Models
    this.faceLandmarker = null;
    this.cocoModel = null;
    this.isInitialized = false;
    this.isLoading = false;
    this.initError = null;

    // Running state
    this.videoElement = null;
    this.overlayCanvas = null;
    this.loopTimer = null;
    this.isLoopRunning = false;
    this.isProcessingFrame = false;
    this.frameCounter = 0;

    // Temporal smoothing tracking
    this.temporalState = {
      consecutiveNoFace: 0,
      consecutiveMultiFace: 0,
      consecutiveGazeAway: 0,
      consecutiveProhibitedObject: {},
      consecutiveExcessiveMovement: 0
    };

    // Cooldown stamps
    this.lastViolationStamps = {};

    // Movement tracking
    this.lastCentroid = null;
    this.lastCentroidTime = null;

    // Overall telemetry counters
    this.violationCounts = {
      no_face: 0,
      multiple_faces: 0,
      looking_away: 0,
      phone_detected: 0,
      prohibited_material: 0,
      secondary_device: 0,
      excessive_movement: 0
    };
  }

  /**
   * Initializes both pre-trained vision models.
   */
  async initialize() {
    if (this.isInitialized) return true;
    if (this.isLoading) return false;

    this.isLoading = true;
    this.onStatusChange({
      status: 'loading',
      message: 'Loading pre-trained AI proctoring models (MediaPipe Face Mesh + COCO-SSD)...',
      progress: 15
    });

    try {
      // 1. Initialize TensorFlow.js backend
      await tf.ready();
      this.onStatusChange({
        status: 'loading',
        message: 'Initializing MediaPipe 3D Face Landmarker...',
        progress: 40
      });

      // 2. Initialize MediaPipe Face Landmarker
      const filesetResolver = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_PATH);
      
      let faceLandmarker = null;
      try {
        // Attempt GPU acceleration first
        faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: FACE_LANDMARKER_MODEL_URL,
            delegate: 'GPU'
          },
          runningMode: 'VIDEO',
          numFaces: 3,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false
        });
      } catch (gpuErr) {
        console.warn('[ProctorAI] GPU delegate unavailable for FaceLandmarker, using CPU fallback:', gpuErr);
        faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
          baseOptions: {
            modelAssetPath: FACE_LANDMARKER_MODEL_URL,
            delegate: 'CPU'
          },
          runningMode: 'VIDEO',
          numFaces: 3,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false
        });
      }
      this.faceLandmarker = faceLandmarker;

      this.onStatusChange({
        status: 'loading',
        message: 'Loading TensorFlow COCO-SSD real-time object detector...',
        progress: 75
      });

      // 3. Initialize TensorFlow COCO-SSD object detector
      this.cocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });

      this.isInitialized = true;
      this.isLoading = false;
      this.initError = null;

      this.onStatusChange({
        status: 'ready',
        message: 'AI Vision Proctoring Models active & calibrated.',
        progress: 100
      });

      return true;
    } catch (err) {
      console.error('[ProctorAI] Failed to load pre-trained AI models:', err);
      this.isLoading = false;
      this.isInitialized = false;
      this.initError = err.message || 'Failed to initialize AI models';
      this.onStatusChange({
        status: 'error',
        message: `Model loading error: ${this.initError}`,
        progress: 0
      });
      return false;
    }
  }

  /**
   * Starts the continuous monitoring loop on an HTMLVideoElement.
   */
  start(videoElement, overlayCanvas = null) {
    if (!videoElement) {
      console.warn('[ProctorAI] Cannot start: videoElement is null');
      return;
    }
    this.videoElement = videoElement;
    this.overlayCanvas = overlayCanvas;

    if (this.loopTimer) clearInterval(this.loopTimer);
    this.isLoopRunning = true;
    this.frameCounter = 0;

    // Run inference loop at regular interval (e.g. 250ms)
    this.loopTimer = setInterval(() => {
      this.processFrame();
    }, this.detectionIntervalMs);
  }

  /**
   * Stops the live detection loop.
   */
  stop() {
    this.isLoopRunning = false;
    if (this.loopTimer) {
      clearInterval(this.loopTimer);
      this.loopTimer = null;
    }
    this.clearOverlay();
  }

  /**
   * Processes a single webcam frame with Face Landmarker and COCO-SSD.
   */
  async processFrame() {
    if (!this.isLoopRunning || this.isProcessingFrame || !this.isInitialized) return;
    const video = this.videoElement;
    if (!video || video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) return;

    this.isProcessingFrame = true;
    this.frameCounter++;

    try {
      const now = performance.now();

      // ── 1. FACE DETECTION & HEAD POSE (MediaPipe) ──────────────────────────
      const faceResults = this.faceLandmarker.detectForVideo(video, now);
      const numFaces = (faceResults && faceResults.faceLandmarks) ? faceResults.faceLandmarks.length : 0;

      let headPose = null;
      let faceAbsent = false;
      let multiFace = false;
      let lookingAway = false;
      let excessiveMovement = false;

      if (numFaces === 0) {
        faceAbsent = true;
        this.temporalState.consecutiveNoFace++;
        this.temporalState.consecutiveMultiFace = 0;
        this.temporalState.consecutiveGazeAway = 0;

        if (this.temporalState.consecutiveNoFace >= 3) {
          this.triggerViolation(
            'no_face',
            'high',
            'Face not detected in camera frame. Please remain centered in view.',
            0.96,
            10
          );
        }
      } else if (numFaces > 1) {
        multiFace = true;
        this.temporalState.consecutiveMultiFace++;
        this.temporalState.consecutiveNoFace = 0;
        this.temporalState.consecutiveGazeAway = 0;

        if (this.temporalState.consecutiveMultiFace >= 2) {
          this.triggerViolation(
            'multiple_faces',
            'high',
            `Multiple faces (${numFaces}) detected in candidate camera frame.`,
            0.95,
            10
          );
        }
      } else {
        // Single face present
        this.temporalState.consecutiveNoFace = 0;
        this.temporalState.consecutiveMultiFace = 0;

        const landmarks = faceResults.faceLandmarks[0];
        headPose = this.calculateHeadPose(landmarks);

        // Movement velocity tracking
        const movement = this.trackMovement(landmarks);
        if (movement.isExcessive) {
          this.temporalState.consecutiveExcessiveMovement++;
          if (this.temporalState.consecutiveExcessiveMovement >= 3) {
            excessiveMovement = true;
            this.triggerViolation(
              'excessive_movement',
              'low',
              'Notice: Excessive head or position movement detected.',
              0.80,
              2
            );
          }
        } else {
          this.temporalState.consecutiveExcessiveMovement = Math.max(0, this.temporalState.consecutiveExcessiveMovement - 1);
        }

        // Check if candidate is looking away
        if (headPose.isLookingAway) {
          this.temporalState.consecutiveGazeAway++;
          if (this.temporalState.consecutiveGazeAway >= 3) {
            lookingAway = true;
            this.triggerViolation(
              'looking_away',
              'medium',
              `Candidate looking away from screen (${headPose.directionLabel}: Yaw ${headPose.yaw}°, Pitch ${headPose.pitch}°).`,
              0.88,
              4
            );
          }
        } else {
          this.temporalState.consecutiveGazeAway = Math.max(0, this.temporalState.consecutiveGazeAway - 1);
        }
      }

      // ── 2. PROHIBITED OBJECT DETECTION (COCO-SSD) ──────────────────────────
      // Run object detection every 2nd frame to optimize performance and prevent stutter
      let detectedObjects = [];
      if (this.frameCounter % 2 === 0 && this.cocoModel) {
        try {
          const predictions = await this.cocoModel.detect(video);
          detectedObjects = this.filterProhibitedObjects(predictions);

          for (const item of detectedObjects) {
            const key = item.class;
            this.temporalState.consecutiveProhibitedObject[key] = (this.temporalState.consecutiveProhibitedObject[key] || 0) + 1;

            if (this.temporalState.consecutiveProhibitedObject[key] >= 2) {
              this.handleObjectViolation(item);
            }
          }

          // Reset counters for objects no longer detected
          Object.keys(this.temporalState.consecutiveProhibitedObject).forEach(key => {
            if (!detectedObjects.some(d => d.class === key)) {
              this.temporalState.consecutiveProhibitedObject[key] = 0;
            }
          });
        } catch {
          // Object detection pass error
        }
      }

      // ── 3. VISUAL OVERLAY & TELEMETRY CALLBACK ─────────────────────────────
      this.drawVisualFeedback(video, faceResults, detectedObjects, headPose);

      const statusSummary = this.computeStatusSummary({
        numFaces,
        headPose,
        detectedObjects,
        faceAbsent,
        multiFace,
        lookingAway,
        excessiveMovement
      });

      this.onTelemetry({
        timestamp: Date.now(),
        numFaces,
        faceDetected: numFaces > 0,
        headPose,
        detectedObjects,
        violations: { ...this.violationCounts },
        status: statusSummary
      });

    } catch {
      // Loop error tolerance
    } finally {
      this.isProcessingFrame = false;
    }
  }

  /**
   * Calculates 3D Head Pose (Yaw and Pitch angles) from MediaPipe landmarks.
   * 
   * Coordinate system:
   * x: normalized 0 (left) to 1 (right)
   * y: normalized 0 (top) to 1 (bottom)
   * z: relative depth
   */
  calculateHeadPose(landmarks) {
    const nose = landmarks[LANDMARKS.NOSE_TIP];
    const leftEye = landmarks[LANDMARKS.LEFT_EYE_OUTER];
    const rightEye = landmarks[LANDMARKS.RIGHT_EYE_OUTER];
    const leftEar = landmarks[LANDMARKS.LEFT_EAR_TRAGUS];
    const rightEar = landmarks[LANDMARKS.RIGHT_EAR_TRAGUS];
    const forehead = landmarks[LANDMARKS.FOREHEAD];
    const chin = landmarks[LANDMARKS.CHIN];

    // ── Yaw (Horizontal Rotation) Calculation ──
    const eyeMidX = (leftEye.x + rightEye.x) / 2;
    const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 0.01;
    const earDist = Math.abs(rightEar.x - leftEar.x) || 0.01;

    // Relative nose offset normalized by eye spacing
    const noseOffset = (nose.x - eyeMidX) / eyeDist;
    // Ear ratio: 0.5 is centered, <0.28 is turning left, >0.72 is turning right
    const earRatio = (nose.x - leftEar.x) / earDist;

    // Approximate yaw angle in degrees
    const yaw = Math.round(noseOffset * 48);

    // ── Pitch (Vertical Tilt) Calculation ──
    const faceHeight = Math.abs(chin.y - forehead.y) || 0.01;
    // Nose vertical ratio relative to forehead and chin
    const pitchRatio = (nose.y - forehead.y) / faceHeight;
    // Approximate pitch angle: 0° is neutral forward, positive is down, negative is up
    const pitch = Math.round((pitchRatio - 0.58) * 85);

    // Determine directional label
    let directionLabel = 'Forward';
    let isLookingAway = false;

    if (yaw < POSE_THRESHOLDS.YAW_LEFT_MAX || earRatio < 0.28) {
      directionLabel = 'Looking Left';
      isLookingAway = true;
    } else if (yaw > POSE_THRESHOLDS.YAW_RIGHT_MAX || earRatio > 0.72) {
      directionLabel = 'Looking Right';
      isLookingAway = true;
    } else if (pitch > POSE_THRESHOLDS.PITCH_DOWN_MAX || pitchRatio > 0.74) {
      directionLabel = 'Looking Down';
      isLookingAway = true;
    } else if (pitch < POSE_THRESHOLDS.PITCH_UP_MAX || pitchRatio < 0.40) {
      directionLabel = 'Looking Up';
      isLookingAway = true;
    }

    return {
      yaw,
      pitch,
      directionLabel,
      isLookingAway,
      earRatio: Number(earRatio.toFixed(2)),
      pitchRatio: Number(pitchRatio.toFixed(2))
    };
  }

  /**
   * Tracks centroid movement velocity between consecutive frames.
   */
  trackMovement(landmarks) {
    const nose = landmarks[LANDMARKS.NOSE_TIP];
    const now = performance.now();

    if (!this.lastCentroid || !this.lastCentroidTime) {
      this.lastCentroid = { x: nose.x, y: nose.y, z: nose.z || 0 };
      this.lastCentroidTime = now;
      return { isExcessive: false, velocity: 0 };
    }

    const dt = Math.max(1, now - this.lastCentroidTime) / 1000;
    const dx = nose.x - this.lastCentroid.x;
    const dy = nose.y - this.lastCentroid.y;
    const dist = Math.hypot(dx, dy);
    const velocity = dist / dt;

    this.lastCentroid = { x: nose.x, y: nose.y, z: nose.z || 0 };
    this.lastCentroidTime = now;

    return {
      isExcessive: velocity > POSE_THRESHOLDS.VELOCITY_MAX,
      velocity: Number(velocity.toFixed(3))
    };
  }

  /**
   * Filters COCO-SSD predictions for exam-prohibited objects.
   */
  filterProhibitedObjects(predictions) {
    if (!predictions || !predictions.length) return [];

    const prohibited = [];
    let personCount = 0;

    for (const pred of predictions) {
      const cls = (pred.class || '').toLowerCase();
      const score = pred.score || 0;

      if (cls === 'person' && score >= 0.60) {
        personCount++;
      } else if (PROHIBITED_OBJECT_CLASSES.includes(cls) && score >= 0.58) {
        prohibited.push({
          class: cls,
          score: Number(score.toFixed(2)),
          bbox: pred.bbox
        });
      }
    }

    // Secondary person detection through COCO-SSD
    if (personCount > 1) {
      prohibited.push({
        class: 'multiple_persons',
        score: 0.90,
        count: personCount
      });
    }

    return prohibited;
  }

  /**
   * Dispatches violation for prohibited detected object.
   */
  handleObjectViolation(item) {
    if (item.class === 'cell phone') {
      this.triggerViolation(
        'phone_detected',
        'high',
        `Prohibited smartphone / mobile device detected (Confidence: ${Math.round(item.score * 100)}%).`,
        item.score,
        10
      );
    } else if (item.class === 'book') {
      this.triggerViolation(
        'prohibited_material',
        'high',
        `Unauthorized reference book or reading material detected (Confidence: ${Math.round(item.score * 100)}%).`,
        item.score,
        8
      );
    } else if (item.class === 'laptop') {
      this.triggerViolation(
        'secondary_device',
        'high',
        `Secondary laptop or unauthorized computer device detected in camera frame (Confidence: ${Math.round(item.score * 100)}%).`,
        item.score,
        10
      );
    } else if (item.class === 'multiple_persons') {
      this.triggerViolation(
        'multiple_faces',
        'high',
        `Multiple individuals detected in candidate environment (Count: ${item.count}).`,
        item.score,
        10
      );
    }
  }

  /**
   * Triggers a violation callback enforcing a cooldown/debounce period per type.
   */
  triggerViolation(type, severity, details, confidence = 1.0, penalty = 5) {
    const now = Date.now();
    const lastStamp = this.lastViolationStamps[type] || 0;

    if (now - lastStamp < this.cooldownMs) {
      // Within cooldown period - do not spam
      return;
    }

    this.lastViolationStamps[type] = now;
    if (this.violationCounts[type] !== undefined) {
      this.violationCounts[type]++;
    }

    this.onViolation({
      id: `${type}_${now}`,
      type,
      severity,
      details,
      confidence,
      penalty,
      timestamp: new Date().toLocaleTimeString()
    });
  }

  /**
   * Generates a concise status summary for the HUD pill.
   */
  computeStatusSummary({ numFaces, headPose, detectedObjects, faceAbsent, multiFace, lookingAway, excessiveMovement }) {
    if (faceAbsent) {
      return { level: 'danger', text: 'Face Absent from View' };
    }
    if (multiFace) {
      return { level: 'danger', text: `Multiple People in View (${numFaces})` };
    }
    if (detectedObjects.length > 0) {
      const objNames = detectedObjects.map(o => o.class).join(', ');
      return { level: 'danger', text: `Prohibited Object: ${objNames}` };
    }
    if (lookingAway && headPose) {
      return { level: 'warning', text: `${headPose.directionLabel} (Yaw: ${headPose.yaw}°, Pitch: ${headPose.pitch}°)` };
    }
    if (excessiveMovement) {
      return { level: 'warning', text: 'Excessive Head Movement' };
    }
    if (headPose) {
      return { level: 'normal', text: `Active: Face Tracked (${headPose.directionLabel})` };
    }
    return { level: 'normal', text: 'AI Monitoring Active' };
  }

  /**
   * Renders visual bounding boxes and pose feedback on overlay canvas.
   */
  drawVisualFeedback(video, faceResults, detectedObjects, headPose) {
    if (!this.overlayCanvas) return;
    const canvas = this.overlayCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Face Box
    if (faceResults && faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
      faceResults.faceLandmarks.forEach((landmarks) => {
        let minX = 1, minY = 1, maxX = 0, maxY = 0;
        landmarks.forEach(pt => {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        });

        const x = minX * canvas.width;
        const y = minY * canvas.height;
        const w = (maxX - minX) * canvas.width;
        const h = (maxY - minY) * canvas.height;

        const isAlert = headPose && headPose.isLookingAway;
        ctx.strokeStyle = isAlert ? '#f59e0b' : '#10b981';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // Draw nose tip anchor
        const nose = landmarks[LANDMARKS.NOSE_TIP];
        if (nose) {
          ctx.fillStyle = isAlert ? '#f59e0b' : '#10b981';
          ctx.beginPath();
          ctx.arc(nose.x * canvas.width, nose.y * canvas.height, 3, 0, 2 * Math.PI);
          ctx.fill();
        }
      });
    }

    // Draw Prohibited Objects
    if (detectedObjects && detectedObjects.length > 0) {
      detectedObjects.forEach(obj => {
        if (!obj.bbox) return;
        const [bx, by, bw, bh] = obj.bbox;
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(bx, by, bw, bh);

        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(`PROHIBITED: ${obj.class.toUpperCase()}`, bx, Math.max(14, by - 6));
      });
    }
  }

  clearOverlay() {
    if (this.overlayCanvas) {
      const ctx = this.overlayCanvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    }
  }

  /**
   * Destroys all loaded models and resources.
   */
  destroy() {
    this.stop();
    try {
      if (this.faceLandmarker) {
        this.faceLandmarker.close();
        this.faceLandmarker = null;
      }
    } catch {}
    this.cocoModel = null;
    this.isInitialized = false;
    this.isLoading = false;
  }
}
