import React from 'react';
import {
  Layers, Users, Mic, Monitor, Volume2, UserX, AlertTriangle, Check
} from 'lucide-react';

/**
 * Compact, accessible telemetry & violation indicator badges with hover tooltips.
 */
export default function ViolationPills({
  tabSwitches = 0,
  faceStatus = 'normal', // 'normal' | 'multiple' | 'no_face'
  audioStatus = 'quiet', // 'quiet' | 'speech' | 'noise'
  screenShare = 'active', // 'active' | 'inactive' | 'locked'
  compact = false
}) {
  // Tab Switch configuration
  const tabPillClass = tabSwitches === 0
    ? 'pill-normal'
    : tabSwitches <= 2
      ? 'pill-warning'
      : 'pill-danger';

  const tabTooltip = tabSwitches === 0
    ? 'Zero browser window or tab switches detected'
    : `${tabSwitches} window or tab blur event${tabSwitches > 1 ? 's' : ''} detected`;

  // Face Detection configuration
  let facePillClass = 'pill-normal';
  let faceLabel = '1 Face';
  let faceTooltip = 'Single verified face detected in primary frame';
  let FaceIcon = Users;

  if (faceStatus === 'multiple' || faceStatus === 'multiple_faces') {
    facePillClass = 'pill-danger';
    faceLabel = 'Multi-Face';
    faceTooltip = 'ALERT: Multiple distinct faces detected in candidate video frame';
    FaceIcon = AlertTriangle;
  } else if (faceStatus === 'no_face' || faceStatus === 'none') {
    facePillClass = 'pill-warning';
    faceLabel = 'No Face';
    faceTooltip = 'WARNING: No face identified in candidate webcam feed';
    FaceIcon = UserX;
  }

  // Audio / Speech configuration
  let audioPillClass = 'pill-normal';
  let audioLabel = 'Quiet';
  let audioTooltip = 'Microphone baseline within normal ambient threshold';
  let AudioIcon = Mic;

  if (audioStatus === 'speech' || audioStatus === 'speech_detected') {
    audioPillClass = 'pill-warning';
    audioLabel = 'Speech Detected';
    audioTooltip = 'Background or conversational voice patterns registered';
    AudioIcon = Volume2;
  } else if (audioStatus === 'noise' || audioStatus === 'unauthorized') {
    audioPillClass = 'pill-danger';
    audioLabel = 'Audio Anomaly';
    audioTooltip = 'High acoustic disturbance or unverified speech flagged';
    AudioIcon = AlertTriangle;
  }

  // Screen Share configuration
  const isScreenActive = screenShare === 'active' || screenShare === 'sharing';
  const screenPillClass = isScreenActive ? 'pill-success' : 'pill-danger';
  const screenLabel = isScreenActive ? 'Screen Active' : 'Unshared';
  const screenTooltip = isScreenActive
    ? 'Candidate desktop / active window capture live & secured'
    : 'ALERT: Candidate screen sharing stream is inactive or interrupted';

  return (
    <div className="violation-pills-row" role="region" aria-label="Real-time Proctoring Telemetry">
      {/* 1. Tab Switches */}
      <div
        className={`violation-pill-item ${tabPillClass}`}
        data-tooltip={tabTooltip}
        tabIndex={0}
        aria-label={tabTooltip}
      >
        <Layers size={compact ? 10 : 11} style={{ flexShrink: 0 }} />
        <span>{compact ? `${tabSwitches} Tabs` : `Tabs: ${tabSwitches}`}</span>
      </div>

      {/* 2. Face Presence */}
      <div
        className={`violation-pill-item ${facePillClass}`}
        data-tooltip={faceTooltip}
        tabIndex={0}
        aria-label={faceTooltip}
      >
        <FaceIcon size={compact ? 10 : 11} style={{ flexShrink: 0 }} />
        <span>{faceLabel}</span>
      </div>

      {/* 3. Audio / Speech */}
      <div
        className={`violation-pill-item ${audioPillClass}`}
        data-tooltip={audioTooltip}
        tabIndex={0}
        aria-label={audioTooltip}
      >
        <AudioIcon size={compact ? 10 : 11} style={{ flexShrink: 0 }} />
        <span>{audioLabel}</span>
      </div>

      {/* 4. Screen Share Status */}
      <div
        className={`violation-pill-item ${screenPillClass}`}
        data-tooltip={screenTooltip}
        tabIndex={0}
        aria-label={screenTooltip}
      >
        <Monitor size={compact ? 10 : 11} style={{ flexShrink: 0 }} />
        <span>{screenLabel}</span>
      </div>
    </div>
  );
}
