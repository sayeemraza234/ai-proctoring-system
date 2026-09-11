import sys
import json
import time
import argparse
import random

def emit_event(event, severity, confidence=1.0):
    log = {
        "event": event,
        "severity": severity,
        "confidence": confidence
    }
    print(json.dumps(log))
    sys.stdout.flush()

def run_mock_mode():
    emit_event("system_start", "low", 1.0)
    events = [
        ("no_face", "high", 0.9),
        ("multiple_faces", "high", 0.95),
        ("off_screen_gaze", "medium", 0.85)
    ]
    while True:
        time.sleep(random.uniform(5.0, 15.0)) # Random interval between 5 and 15 seconds
        event, severity, conf = random.choice(events)
        emit_event(event, severity, conf)

def run_real_mode():
    try:
        import cv2
        import mediapipe as mp
    except ImportError:
        emit_event("dependency_error", "high", 1.0)
        print("Error: Missing required Python packages (opencv-python, mediapipe). Falling back to mock mode.", file=sys.stderr)
        run_mock_mode()
        return

    mp_face_detection = mp.solutions.face_detection
    mp_face_mesh = mp.solutions.face_mesh

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        emit_event("camera_error", "high", 1.0)
        print("Error: Cannot open webcam. Falling back to mock mode.", file=sys.stderr)
        run_mock_mode()
        return

    emit_event("system_start", "low", 1.0)

    with mp_face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.5) as face_detection, \
         mp_face_mesh.FaceMesh(max_num_faces=1, refine_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5) as face_mesh:
        
        frame_count = 0
        while cap.isOpened():
            success, image = cap.read()
            if not success:
                break

            frame_count += 1
            if frame_count % 5 != 0:
                continue # Process every 5th frame to save CPU

            # To improve performance, optionally mark the image as not writeable to
            # pass by reference.
            image.flags.writeable = False
            image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
            
            # Face Count
            results_det = face_detection.process(image)
            num_faces = 0
            if results_det.detections:
                num_faces = len(results_det.detections)
            
            if num_faces == 0:
                emit_event("no_face", "high", 1.0)
            elif num_faces > 1:
                emit_event("multiple_faces", "high", 1.0)
            else:
                # Gaze tracking (simplified heuristic using iris bounding box relative to eye)
                results_mesh = face_mesh.process(image)
                if results_mesh.multi_face_landmarks:
                    for face_landmarks in results_mesh.multi_face_landmarks:
                        # left iris landmarks: 468, 469, 470, 471, 472
                        # right iris landmarks: 473, 474, 475, 476, 477
                        
                        # Simplified calculation: just check if the face is significantly turned
                        # A robust gaze tracker is complex, so we approximate with face yaw/pitch
                        # nose tip (1) relative to left/right most points (234, 454)
                        nose = face_landmarks.landmark[1]
                        left = face_landmarks.landmark[234]
                        right = face_landmarks.landmark[454]
                        
                        width = right.x - left.x
                        if width > 0:
                            ratio = (nose.x - left.x) / width
                            if ratio < 0.3 or ratio > 0.7:
                                emit_event("off_screen_gaze", "medium", 0.90)

            # Sleep slightly to prevent 100% CPU on fast cameras
            time.sleep(0.01)

    cap.release()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Proctoring Engine")
    parser.add_argument("--mock", action="store_true", help="Run in mock mode generating fake alerts")
    args = parser.parse_args()

    if args.mock:
        run_mock_mode()
    else:
        run_real_mode()
