import sys
import json
import time

def emit_event(event, severity, confidence=1.0):
    log = {
        "event": event,
        "severity": severity,
        "confidence": confidence
    }
    print(json.dumps(log))
    sys.stdout.flush()

def run_real_mode():
    try:
        import cv2
        import mediapipe as mp
    except ImportError:
        emit_event("dependency_error", "high", 1.0)
        return 1

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        emit_event("camera_error", "high", 1.0)
        return 1

    emit_event("system_start", "low", 1.0)

    try:
        mp_face_detection = mp.solutions.face_detection
        mp_face_mesh = mp.solutions.face_mesh

        with mp_face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.6) as face_detection, \
             mp_face_mesh.FaceMesh(max_num_faces=2, refine_landmarks=True, min_detection_confidence=0.6, min_tracking_confidence=0.6) as face_mesh:
            
            frame_count = 0
            consecutive_no_face = 0
            consecutive_multi_face = 0
            consecutive_gaze = 0

            while cap.isOpened():
                success, image = cap.read()
                if not success:
                    break

                frame_count += 1
                if frame_count % 8 != 0:
                    continue

                image.flags.writeable = False
                image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                
                results_det = face_detection.process(image)
                num_faces = len(results_det.detections) if results_det.detections else 0
                
                # Use temporal smoothing (require 5 consecutive frames before alerting)
                if num_faces == 0:
                    consecutive_no_face += 1
                    consecutive_multi_face = 0
                    if consecutive_no_face >= 5:
                        emit_event("no_face", "high", 0.95)
                        consecutive_no_face = 0
                elif num_faces > 1:
                    consecutive_multi_face += 1
                    consecutive_no_face = 0
                    if consecutive_multi_face >= 4:
                        emit_event("multiple_faces", "high", 0.95)
                        consecutive_multi_face = 0
                else:
                    consecutive_no_face = 0
                    consecutive_multi_face = 0
                    
                    results_mesh = face_mesh.process(image)
                    if results_mesh.multi_face_landmarks:
                        for face_landmarks in results_mesh.multi_face_landmarks:
                            nose = face_landmarks.landmark[1]
                            left = face_landmarks.landmark[234]
                            right = face_landmarks.landmark[454]
                            
                            width = right.x - left.x
                            if width > 0:
                                ratio = (nose.x - left.x) / width
                                if ratio < 0.20 or ratio > 0.80:
                                    consecutive_gaze += 1
                                    if consecutive_gaze >= 6:
                                        emit_event("off_screen_gaze", "medium", 0.85)
                                        consecutive_gaze = 0
                                else:
                                    consecutive_gaze = max(0, consecutive_gaze - 1)

                time.sleep(0.02)
    except Exception:
        emit_event("dependency_error", "high", 1.0)
        return 1
    finally:
        cap.release()

if __name__ == "__main__":
    sys.exit(run_real_mode() or 0)
