import sys
import json
import time

def emit_event(event, severity, confidence=1.0, details=""):
    log = {
        "event": event,
        "severity": severity,
        "confidence": confidence,
        "details": details
    }
    print(json.dumps(log))
    sys.stdout.flush()

def run_real_mode():
    try:
        import cv2
        import mediapipe as mp
    except ImportError:
        emit_event("dependency_error", "high", 1.0, "OpenCV or MediaPipe is missing.")
        return 1

    # Optional YOLOv8 for prohibited object detection
    yolo_model = None
    try:
        from ultralytics import YOLO
        yolo_model = YOLO("yolov8n.pt")
    except Exception as e:
        yolo_model = None

    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        emit_event("camera_error", "high", 1.0, "Cannot access primary camera.")
        return 1

    emit_event("system_start", "low", 1.0, "ProctorAI Python Engine Active (MediaPipe + YOLOv8).")

    try:
        mp_face_detection = mp.solutions.face_detection
        mp_face_mesh = mp.solutions.face_mesh

        with mp_face_detection.FaceDetection(model_selection=0, min_detection_confidence=0.6) as face_detection, \
             mp_face_mesh.FaceMesh(max_num_faces=3, refine_landmarks=True, min_detection_confidence=0.6, min_tracking_confidence=0.6) as face_mesh:
            
            frame_count = 0
            consecutive_no_face = 0
            consecutive_multi_face = 0
            consecutive_gaze = 0
            consecutive_prohibited_obj = {}

            PROHIBITED_CLASSES = {"cell phone": "phone_detected", "book": "prohibited_material", "laptop": "secondary_device"}

            while cap.isOpened():
                success, image = cap.read()
                if not success:
                    break

                frame_count += 1
                if frame_count % 6 != 0:
                    continue

                image.flags.writeable = False
                rgb_image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                
                # 1. Face Detection & Head Pose
                results_det = face_detection.process(rgb_image)
                num_faces = len(results_det.detections) if results_det.detections else 0
                
                if num_faces == 0:
                    consecutive_no_face += 1
                    consecutive_multi_face = 0
                    consecutive_gaze = 0
                    if consecutive_no_face >= 4:
                        emit_event("no_face", "high", 0.95, "Face not detected in camera frame.")
                        consecutive_no_face = 0
                elif num_faces > 1:
                    consecutive_multi_face += 1
                    consecutive_no_face = 0
                    consecutive_gaze = 0
                    if consecutive_multi_face >= 3:
                        emit_event("multiple_faces", "high", 0.95, f"Multiple faces ({num_faces}) detected.")
                        consecutive_multi_face = 0
                else:
                    consecutive_no_face = 0
                    consecutive_multi_face = 0
                    
                    results_mesh = face_mesh.process(rgb_image)
                    if results_mesh.multi_face_landmarks:
                        for face_landmarks in results_mesh.multi_face_landmarks:
                            nose = face_landmarks.landmark[1]
                            left = face_landmarks.landmark[234]
                            right = face_landmarks.landmark[454]
                            chin = face_landmarks.landmark[152]
                            forehead = face_landmarks.landmark[10]
                            
                            # Yaw check (left/right)
                            width = right.x - left.x
                            is_looking_away = False
                            direction = "forward"
                            if width > 0:
                                ratio_x = (nose.x - left.x) / width
                                if ratio_x < 0.25:
                                    is_looking_away = True
                                    direction = "left"
                                elif ratio_x > 0.75:
                                    is_looking_away = True
                                    direction = "right"

                            # Pitch check (up/down)
                            height = chin.y - forehead.y
                            if height > 0:
                                ratio_y = (nose.y - forehead.y) / height
                                if ratio_y > 0.74:
                                    is_looking_away = True
                                    direction = "down"
                                elif ratio_y < 0.38:
                                    is_looking_away = True
                                    direction = "up"

                            if is_looking_away:
                                consecutive_gaze += 1
                                if consecutive_gaze >= 4:
                                    emit_event("off_screen_gaze", "medium", 0.88, f"Candidate looking away ({direction}).")
                                    consecutive_gaze = 0
                            else:
                                consecutive_gaze = max(0, consecutive_gaze - 1)

                # 2. Prohibited Object Detection (YOLOv8n)
                if yolo_model and frame_count % 12 == 0:
                    try:
                        preds = yolo_model(image, verbose=False, conf=0.6)
                        detected_classes = []
                        person_count = 0
                        for r in preds:
                            for box in r.boxes:
                                cls_name = yolo_model.names[int(box.cls[0])]
                                if cls_name == "person":
                                    person_count += 1
                                elif cls_name in PROHIBITED_CLASSES:
                                    detected_classes.append(cls_name)

                        if person_count > 1:
                            emit_event("multiple_faces", "high", 0.92, f"Multiple persons detected by object detector ({person_count}).")

                        for obj in detected_classes:
                            consecutive_prohibited_obj[obj] = consecutive_prohibited_obj.get(obj, 0) + 1
                            if consecutive_prohibited_obj[obj] >= 2:
                                event_name = PROHIBITED_CLASSES.get(obj, "prohibited_material")
                                emit_event(event_name, "high", 0.90, f"Prohibited item detected: {obj}.")
                                consecutive_prohibited_obj[obj] = 0
                    except Exception:
                        pass

                time.sleep(0.02)
    except Exception as e:
        emit_event("dependency_error", "high", 1.0, str(e))
        return 1
    finally:
        cap.release()

if __name__ == "__main__":
    sys.exit(run_real_mode() or 0)
