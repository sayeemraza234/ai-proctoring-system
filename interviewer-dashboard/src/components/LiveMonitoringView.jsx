import React, { useState, useEffect, useRef } from 'react';
import {
  Grid, Maximize2, Split, Camera, Code, Sparkles, PhoneOff, Play,
  Shield, ShieldAlert, MessageSquare, Flag, Search, Filter,
  Users, RefreshCw, X, AlertTriangle, CheckCircle2, ChevronRight,
  Radio, Volume2, Eye, LayoutGrid, Monitor
} from 'lucide-react';
import CandidateCard from './CandidateCard';
import LiveStreamContainer from './LiveStreamContainer';
import IncidentDrawer from './IncidentDrawer';

export default function LiveMonitoringView({
  candidates = [],
  selectedCandidate = null,
  onSelectCandidate,
  onActivateInterview,
  onTerminateInterview,
  onSendWarning,
  onFlagIncident,
  incidents = [],
  // Focused view specific props
  candidateLiveCode = '',
  codeOutput = null,
  codeOutputError = false,
  isExecuting = false,
  handleRunCode,
  runAiEvaluation,
  isEvaluating = false,
  aiFollowups = [],
  handleGetAiFollowup,
  isGeneratingFollowup = false,
  evaluationRubric = {},
  setEvaluationRubric,
  interviewerNotes = '',
  setInterviewerNotes,
  interviewerRating = 0,
  setInterviewerRating,
  onSaveRubric,
  BACKEND = ''
}) {
  // Layout state
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'focused'
  const [gridDensity, setGridDensity] = useState('2x2'); // '2x2' | '3x3' | 'fit'
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'active' | 'flagged' | 'scheduled'
  const [isIncidentDrawerOpen, setIsIncidentDrawerOpen] = useState(true);
  const [focusedLayoutMode, setFocusedLayoutMode] = useState('split'); // 'split' | 'videoFocus' | 'codeFocus'
  const [highlightedCandidateId, setHighlightedCandidateId] = useState(null);

  // Modals state
  const [warningModalCandidate, setWarningModalCandidate] = useState(null);
  const [warningMessage, setWarningMessage] = useState('');
  const [selectedWarningPreset, setSelectedWarningPreset] = useState('');
  const [isSendingWarning, setIsSendingWarning] = useState(false);

  const [flagModalCandidate, setFlagModalCandidate] = useState(null);
  const [flagTag, setFlagTag] = useState('Suspicious eye/head movement');
  const [flagSeverity, setFlagSeverity] = useState('medium'); // 'high' | 'medium' | 'low'
  const [flagPenalty, setFlagPenalty] = useState(5);
  const [flagDetails, setFlagDetails] = useState('');
  const [isFlagging, setIsFlagging] = useState(false);

  const [terminateModalCandidate, setTerminateModalCandidate] = useState(null);
  const [terminateReason, setTerminateReason] = useState('Critical integrity policy violation detected during live proctoring.');
  const [terminateDecision, setTerminateDecision] = useState('reject');

  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState('');

  // Auto-switch to focused view if selectedCandidate is provided and user was on focused mode
  const currentFocusedCandidate = selectedCandidate
    ? candidates.find(c => (c.candidate_id || c.id) === (selectedCandidate.candidate_id || selectedCandidate.id)) || selectedCandidate
    : null;

  // Filter candidates for grid
  const filteredCandidates = candidates.filter(c => {
    const name = (c.candidate_name || c.fullname || '').toLowerCase();
    const role = (c.job_role || c.role || '').toLowerCase();
    const query = searchQuery.toLowerCase();

    if (query && !name.includes(query) && !role.includes(query)) {
      return false;
    }

    const isLive = c.status === 'active' || c.status === 'in_progress';
    const isFlagged = c.isFlagged || (c.trust_score && c.trust_score < 70);

    if (statusFilter === 'active' && !isLive) return false;
    if (statusFilter === 'flagged' && !isFlagged) return false;
    if (statusFilter === 'scheduled' && c.status !== 'scheduled') return false;

    return true;
  });

  // Calculate live stats summary
  const totalMonitored = candidates.length;
  const activeCount = candidates.filter(c => c.status === 'active' || c.status === 'in_progress').length;
  const flaggedCount = candidates.filter(c => c.isFlagged || (c.trust_score && c.trust_score < 70)).length;
  const avgTrust = candidates.length > 0
    ? Math.round(candidates.reduce((acc, c) => acc + (c.trust_score ?? 100), 0) / candidates.length)
    : 100;

  // Handle Inspect action
  const handleInspectCandidate = (candidate) => {
    onSelectCandidate(candidate);
    setViewMode('focused');
  };

  // Handle warning presets
  const warningPresets = [
    'Please keep your face clearly visible within camera frame at all times.',
    'Tab switching, dual monitors, or background applications are strictly prohibited.',
    'Please minimize background audio and refrain from verbal communication.',
    'Unauthorized secondary electronic devices or smartphones detected in view.',
    'Looking away from the screen for prolonged periods will penalize integrity rating.'
  ];

  const handleSelectWarningPreset = (preset) => {
    setSelectedWarningPreset(preset);
    setWarningMessage(preset);
  };

  const handleConfirmSendWarning = async () => {
    if (!warningModalCandidate || !warningMessage.trim()) return;
    setIsSendingWarning(true);
    try {
      if (onSendWarning) {
        await onSendWarning(warningModalCandidate, warningMessage.trim());
      }
      setWarningModalCandidate(null);
      setWarningMessage('');
      setSelectedWarningPreset('');
    } catch (err) {
      console.error('Error sending warning:', err);
    } finally {
      setIsSendingWarning(false);
    }
  };

  // Handle manual incident flagging
  const incidentTags = [
    { label: 'Suspicious eye/head movement', defaultSev: 'medium', defaultPen: 5 },
    { label: 'Unauthorized secondary device', defaultSev: 'high', defaultPen: 10 },
    { label: 'Multiple people detected in frame', defaultSev: 'high', defaultPen: 10 },
    { label: 'No face detected / absent from screen', defaultSev: 'medium', defaultPen: 5 },
    { label: 'Voice / Audio whispering assistance', defaultSev: 'high', defaultPen: 10 },
    { label: 'Unauthorized tab/browser navigation', defaultSev: 'medium', defaultPen: 5 },
    { label: 'Screen mirror / second display detected', defaultSev: 'high', defaultPen: 15 }
  ];

  const handleSelectIncidentTag = (item) => {
    setFlagTag(item.label);
    setFlagSeverity(item.defaultSev);
    setFlagPenalty(item.defaultPen);
  };

  const handleConfirmFlagIncident = async () => {
    if (!flagModalCandidate) return;
    setIsFlagging(true);
    try {
      if (onFlagIncident) {
        await onFlagIncident(flagModalCandidate, {
          tag: flagTag,
          severity: flagSeverity,
          penalty: flagPenalty,
          details: flagDetails.trim() || `Proctor flagged: ${flagTag}`
        });
      }
      setFlagModalCandidate(null);
      setFlagDetails('');
    } catch (err) {
      console.error('Error flagging incident:', err);
    } finally {
      setIsFlagging(false);
    }
  };

  // Handle terminate session
  const handleConfirmTerminate = async () => {
    if (!terminateModalCandidate) return;
    try {
      if (onTerminateInterview) {
        await onTerminateInterview(
          terminateModalCandidate.interview_id || terminateModalCandidate.id,
          terminateReason,
          terminateDecision
        );
      }
      setTerminateModalCandidate(null);
      if (currentFocusedCandidate && (currentFocusedCandidate.candidate_id || currentFocusedCandidate.id) === (terminateModalCandidate.candidate_id || terminateModalCandidate.id)) {
        setViewMode('grid');
      }
    } catch (err) {
      console.error('Error terminating interview:', err);
    }
  };

  // Handle clicking incident in IncidentDrawer
  const handleSelectIncidentFromDrawer = (inc) => {
    const targetCandidate = candidates.find(c =>
      String(c.candidate_id) === String(inc.candidateId) ||
      String(c.interview_id) === String(inc.roomId) ||
      String(c.id) === String(inc.candidateId)
    );

    if (targetCandidate) {
      setHighlightedCandidateId(targetCandidate.candidate_id || targetCandidate.id);
      onSelectCandidate(targetCandidate);

      // Scroll into view if in grid mode
      const cardEl = document.getElementById(`candidate-card-${targetCandidate.candidate_id || targetCandidate.id}`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      // Clear highlight ring after 3 seconds
      setTimeout(() => {
        setHighlightedCandidateId(null);
      }, 3500);
    }
  };

  // Handle broadcast warning to all active sessions
  const handleBroadcastWarning = async () => {
    if (!broadcastMessage.trim()) return;
    const activeCandidates = candidates.filter(c => c.status === 'active' || c.status === 'in_progress');
    for (const c of activeCandidates) {
      if (onSendWarning) {
        await onSendWarning(c, `[GLOBAL NOTICE]: ${broadcastMessage.trim()}`);
      }
    }
    setBroadcastModalOpen(false);
    setBroadcastMessage('');
  };

  return (
    <div className="live-workspace">
      {/* ══════════════════════════════════════════════════════════════════════
         TOP ACTION & CONTROL BAR
         ══════════════════════════════════════════════════════════════════════ */}
      <header className="live-top-bar" role="toolbar" aria-label="Live Monitoring Toolbar">
        {/* Left Side: Title & View Mode Switcher */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              background: 'rgba(99, 102, 241, 0.14)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary)'
            }}>
              <Radio size={15} />
            </div>
            <div>
              <h1 style={{ fontSize: 13, fontWeight: 700, margin: 0, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                Live Proctoring Control
              </h1>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                Multi-feed telemetry & real-time surveillance
              </span>
            </div>
          </div>

          <div style={{ width: 1, height: 20, background: 'var(--border-subtle)', margin: '0 4px' }} />

          {/* View Mode Toggle: Grid vs. Focused */}
          <div className="density-toggle-group">
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`density-btn ${viewMode === 'grid' ? 'active' : ''}`}
              title="Multi-Feed Grid View"
              aria-label="Grid View"
            >
              <LayoutGrid size={13} />
              <span>Grid View</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (!currentFocusedCandidate && candidates.length > 0) {
                  onSelectCandidate(candidates[0]);
                }
                setViewMode('focused');
              }}
              className={`density-btn ${viewMode === 'focused' ? 'active' : ''}`}
              title="Single-Candidate Focused Deep-Dive"
              aria-label="Focused View"
            >
              <Maximize2 size={13} />
              <span>Focused View</span>
            </button>
          </div>

          {/* Grid Density Switcher (Only visible in Grid View) */}
          {viewMode === 'grid' && (
            <div className="density-toggle-group">
              <button
                type="button"
                onClick={() => setGridDensity('2x2')}
                className={`density-btn ${gridDensity === '2x2' ? 'active' : ''}`}
                title="2×2 Grid Layout"
              >
                2×2
              </button>
              <button
                type="button"
                onClick={() => setGridDensity('3x3')}
                className={`density-btn ${gridDensity === '3x3' ? 'active' : ''}`}
                title="3×3 Grid Layout"
              >
                3×3
              </button>
              <button
                type="button"
                onClick={() => setGridDensity('fit')}
                className={`density-btn ${gridDensity === 'fit' ? 'active' : ''}`}
                title="Adaptive Fit Density"
              >
                Fit All
              </button>
            </div>
          )}
        </div>

        {/* Center / Search & Filters */}
        {viewMode === 'grid' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, maxWidth: 460, margin: '0 16px' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Search candidates by name or role..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="form-input"
                style={{ paddingLeft: 30, height: 32, fontSize: 11 }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 2 }}
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', padding: 2, borderRadius: 8, border: '1px solid var(--border-subtle)' }}>
              {[
                { id: 'all', label: 'All' },
                { id: 'active', label: 'Active', count: activeCount },
                { id: 'flagged', label: 'Flagged', count: flaggedCount }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className="btn btn-ghost btn-sm"
                  style={{
                    fontSize: 10,
                    padding: '2px 8px',
                    borderRadius: 6,
                    height: 24,
                    background: statusFilter === tab.id ? 'var(--bg-card)' : 'transparent',
                    color: statusFilter === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                    fontWeight: statusFilter === tab.id ? 700 : 500
                  }}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span style={{
                      fontSize: 9,
                      padding: '0 4px',
                      borderRadius: 9999,
                      background: tab.id === 'flagged' && flaggedCount > 0 ? 'rgba(239, 68, 68, 0.2)' : 'var(--bg-surface)',
                      color: tab.id === 'flagged' && flaggedCount > 0 ? '#ef4444' : 'inherit'
                    }}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Right Side: Global Batch Actions & Drawer Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
          {/* Quick Metrics Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            padding: '3px 10px',
            borderRadius: 8,
            fontSize: 11
          }}>
            <span style={{ color: 'var(--text-muted)' }}>
              Live: <strong style={{ color: '#10b981' }}>{activeCount}</strong>/{totalMonitored}
            </span>
            <span style={{ width: 1, height: 12, background: 'var(--border-subtle)' }} />
            <span style={{ color: 'var(--text-muted)' }}>
              Avg Trust: <strong style={{ color: avgTrust >= 80 ? '#10b981' : avgTrust >= 50 ? '#f59e0b' : '#ef4444' }}>{avgTrust}%</strong>
            </span>
          </div>

          {/* Broadcast Notice CTA */}
          <button
            type="button"
            onClick={() => setBroadcastModalOpen(true)}
            disabled={activeCount === 0}
            className="btn btn-secondary btn-sm"
            title="Broadcast a real-time warning to all active candidate sessions"
            style={{ height: 32 }}
          >
            <MessageSquare size={12} />
            <span>Broadcast Notice</span>
          </button>

          {/* Incident Drawer Toggle */}
          <button
            type="button"
            onClick={() => setIsIncidentDrawerOpen(o => !o)}
            className="btn btn-secondary btn-sm"
            style={{
              height: 32,
              background: isIncidentDrawerOpen ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
              borderColor: isIncidentDrawerOpen ? 'rgba(99, 102, 241, 0.35)' : 'var(--border-subtle)',
              color: isIncidentDrawerOpen ? 'var(--primary)' : 'var(--text-secondary)'
            }}
            title="Toggle Live Activity Audit Feed"
          >
            <ShieldAlert size={13} style={{ color: incidents.length > 0 ? '#ef4444' : 'currentColor' }} />
            <span>Audit Feed</span>
            {incidents.length > 0 && (
              <span style={{
                background: '#ef4444',
                color: '#ffffff',
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 5px',
                borderRadius: 9999
              }}>
                {incidents.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
         WORKSPACE MAIN CONTENT AREA (GRID VIEW OR FOCUSED VIEW)
         ══════════════════════════════════════════════════════════════════════ */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>

        {/* ── VIEW MODE: MULTI-FEED GRID ──────────────────────────────────── */}
        {viewMode === 'grid' && (
          <main
            className="live-grid-container"
            style={{ flex: 1, overflowY: 'auto', padding: 14 }}
            role="region"
            aria-label="Multi-Candidate Live Feeds"
          >
            {filteredCandidates.length === 0 ? (
              <div style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                color: 'var(--text-muted)'
              }}>
                <Users size={40} style={{ opacity: 0.3 }} />
                <div style={{ textAlign: 'center' }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    No Candidate Sessions Found
                  </h3>
                  <p style={{ fontSize: 12, margin: '4px 0 0' }}>
                    {searchQuery || statusFilter !== 'all'
                      ? 'Try clearing the search query or adjusting your status filters.'
                      : 'Create or schedule candidate interviews to start live monitoring.'}
                  </p>
                </div>
                {(searchQuery || statusFilter !== 'all') && (
                  <button
                    onClick={() => { setSearchQuery(''); setStatusFilter('all'); }}
                    className="btn btn-secondary btn-sm"
                  >
                    Reset Filters
                  </button>
                )}
              </div>
            ) : (
              <div className={`live-grid density-${gridDensity}`}>
                {filteredCandidates.map(candidate => {
                  const candidateId = candidate.candidate_id || candidate.id;
                  const isSelected = (selectedCandidate?.candidate_id || selectedCandidate?.id) === candidateId;
                  const isHighlighted = highlightedCandidateId === candidateId;

                  return (
                    <div
                      key={candidateId}
                      id={`candidate-card-${candidateId}`}
                      style={{
                        position: 'relative',
                        transition: 'box-shadow 0.25s ease, transform 0.25s ease',
                        ...(isHighlighted && {
                          boxShadow: '0 0 0 3px #ef4444, 0 8px 24px rgba(239, 68, 68, 0.35)',
                          borderRadius: 12,
                          transform: 'scale(1.01)',
                          zIndex: 5
                        })
                      }}
                    >
                      <CandidateCard
                        candidate={candidate}
                        isSelected={isSelected}
                        onInspect={handleInspectCandidate}
                        onIntervene={(c) => {
                          setWarningModalCandidate(c);
                          setWarningMessage(warningPresets[0]);
                        }}
                        onFlagIncident={(c) => {
                          setFlagModalCandidate(c);
                        }}
                        onTerminate={(c) => {
                          setTerminateModalCandidate(c);
                        }}
                        onActivate={onActivateInterview}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        )}

        {/* ── VIEW MODE: FOCUSED SINGLE-CANDIDATE VIEW ───────────────────── */}
        {viewMode === 'focused' && (
          <main
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: 12,
              overflow: 'hidden'
            }}
            role="region"
            aria-label="Focused Candidate Deep Dive"
          >
            {currentFocusedCandidate ? (() => {
              const isLive = currentFocusedCandidate.status === 'active' || currentFocusedCandidate.status === 'in_progress';
              const trustScore = Math.round(currentFocusedCandidate.trust_score ?? 100);
              const getTrustColor = (score) => score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';

              return (
                <>
                  {/* Focused Candidate Header Bar */}
                  <div
                    className="card"
                    style={{
                      padding: '8px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      borderRadius: 10,
                      flexShrink: 0
                    }}
                  >
                    {/* Candidate Identity & Back to Grid */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <button
                        onClick={() => setViewMode('grid')}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '4px 10px', fontSize: 11 }}
                        title="Return to multi-candidate grid overview"
                      >
                        <ChevronRight size={13} style={{ transform: 'rotate(180deg)' }} />
                        <span>All Feeds</span>
                      </button>

                      <div style={{
                        width: 34,
                        height: 34,
                        borderRadius: 8,
                        background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: 13,
                        flexShrink: 0
                      }}>
                        {(currentFocusedCandidate.candidate_name || currentFocusedCandidate.fullname || 'C')[0].toUpperCase()}
                      </div>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <h2 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }} className="truncate">
                            {currentFocusedCandidate.candidate_name || currentFocusedCandidate.fullname}
                          </h2>
                          <span className={`badge ${isLive ? 'badge-active' : currentFocusedCandidate.status === 'scheduled' ? 'badge-scheduled' : 'badge-completed'}`}>
                            {isLive ? 'LIVE' : currentFocusedCandidate.status}
                          </span>
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', gap: 8 }}>
                          <span>Role: {currentFocusedCandidate.job_role || currentFocusedCandidate.role || 'Software Engineer'}</span>
                          <span>•</span>
                          <span>Session ID: #{String(currentFocusedCandidate.interview_id || currentFocusedCandidate.id || '').slice(-6)}</span>
                          <span>•</span>
                          <span>Integrity Trust: <strong style={{ color: getTrustColor(trustScore) }}>{trustScore}%</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* Sub-Layout Mode & Focused Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Split / Video / Code Focus Buttons */}
                      <div className="density-toggle-group">
                        <button
                          type="button"
                          onClick={() => setFocusedLayoutMode('split')}
                          className={`density-btn ${focusedLayoutMode === 'split' ? 'active' : ''}`}
                          title="Split Mode (Video & Live Code)"
                        >
                          <Split size={13} />
                          <span>Split</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFocusedLayoutMode('videoFocus')}
                          className={`density-btn ${focusedLayoutMode === 'videoFocus' ? 'active' : ''}`}
                          title="Video Feed Focus"
                        >
                          <Camera size={13} />
                          <span>Feed Focus</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setFocusedLayoutMode('codeFocus')}
                          className={`density-btn ${focusedLayoutMode === 'codeFocus' ? 'active' : ''}`}
                          title="Code Editor & Console Focus"
                        >
                          <Code size={13} />
                          <span>Code Focus</span>
                        </button>
                      </div>

                      {/* Quick Warn & Flag in Focused Bar */}
                      <button
                        type="button"
                        onClick={() => {
                          setWarningModalCandidate(currentFocusedCandidate);
                          setWarningMessage(warningPresets[0]);
                        }}
                        className="btn btn-secondary btn-sm"
                        title="Send Warning Notification to candidate"
                      >
                        <MessageSquare size={12} />
                        <span>Warn</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFlagModalCandidate(currentFocusedCandidate)}
                        className="btn btn-secondary btn-sm"
                        title="Manually Flag Integrity Incident"
                      >
                        <Flag size={12} />
                        <span>Flag</span>
                      </button>

                      {/* AI Evaluation */}
                      {runAiEvaluation && (
                        <button
                          type="button"
                          onClick={runAiEvaluation}
                          disabled={isEvaluating}
                          className="btn btn-primary btn-sm"
                          title="Run automated Gemini AI Code & Proctoring evaluation"
                        >
                          <Sparkles size={12} />
                          <span>{isEvaluating ? 'Evaluating...' : 'AI Evaluation'}</span>
                        </button>
                      )}

                      {/* End Session CTA */}
                      {isLive && (
                        <button
                          type="button"
                          onClick={() => setTerminateModalCandidate(currentFocusedCandidate)}
                          className="btn btn-danger btn-sm"
                          title="Terminate candidate interview session"
                        >
                          <PhoneOff size={12} />
                          <span>End Session</span>
                        </button>
                      )}

                      {currentFocusedCandidate.status === 'scheduled' && onActivateInterview && (
                        <button
                          type="button"
                          onClick={() => onActivateInterview(currentFocusedCandidate.interview_id || currentFocusedCandidate.id)}
                          className="btn btn-success btn-sm"
                        >
                          <Play size={12} />
                          <span>Activate Session</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Focused Workspace Body */}
                  <div style={{ flex: 1, display: 'flex', gap: 10, minHeight: 0, overflow: 'hidden' }}>

                    {/* Left Stage: 16:9 Stream Feed */}
                    {(focusedLayoutMode === 'split' || focusedLayoutMode === 'videoFocus') && (
                      <div
                        style={{
                          flex: focusedLayoutMode === 'videoFocus' ? 1 : '0 0 48%',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 10,
                          minWidth: 0,
                          overflow: 'hidden'
                        }}
                      >
                        <div className="card" style={{ padding: 0, overflow: 'hidden', flexShrink: 0 }}>
                          <LiveStreamContainer
                            candidate={currentFocusedCandidate}
                            roomId={currentFocusedCandidate.interview_id || currentFocusedCandidate.id}
                            isLive={isLive}
                            compact={false}
                          />
                        </div>

                        {/* AI Co-Pilot Follow-Up Prompts */}
                        {handleGetAiFollowup && (
                          <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 12 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Sparkles size={14} style={{ color: 'var(--primary)' }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>AI Co-Pilot Follow-Ups</span>
                              </div>
                              <button
                                onClick={handleGetAiFollowup}
                                disabled={isGeneratingFollowup}
                                className="btn btn-ghost btn-sm"
                                style={{ fontSize: 10, padding: '2px 8px' }}
                              >
                                {isGeneratingFollowup ? 'Generating...' : 'Refresh Suggestions'}
                              </button>
                            </div>

                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {aiFollowups && aiFollowups.length > 0 ? (
                                aiFollowups.map((q, idx) => (
                                  <div
                                    key={idx}
                                    style={{
                                      padding: '8px 10px',
                                      borderRadius: 6,
                                      background: 'var(--bg-elevated)',
                                      border: '1px solid var(--border-subtle)',
                                      fontSize: 11,
                                      color: 'var(--text-secondary)',
                                      lineHeight: 1.5
                                    }}
                                  >
                                    💡 {q}
                                  </div>
                                ))
                              ) : (
                                <div style={{ textAlign: 'center', padding: '24px 10px', color: 'var(--text-muted)', fontSize: 11 }}>
                                  Click "Refresh Suggestions" to generate real-time technical follow-up questions based on candidate activity.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Right Stage: Synchronized Code & Execution Console */}
                    {(focusedLayoutMode === 'split' || focusedLayoutMode === 'codeFocus') && (
                      <div
                        className="card"
                        style={{
                          flex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          minWidth: 0,
                          overflow: 'hidden',
                          padding: 0
                        }}
                      >
                        {/* Code Editor Header */}
                        <div style={{
                          padding: '8px 14px',
                          borderBottom: '1px solid var(--border-subtle)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: 'var(--bg-surface)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Code size={13} style={{ color: 'var(--primary)' }} />
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                              Candidate Live Editor Mirror
                            </span>
                            <span className="badge badge-active" style={{ fontSize: 9 }}>SYNC ACTIVE</span>
                          </div>

                          {handleRunCode && (
                            <button
                              onClick={() => handleRunCode(candidateLiveCode || '')}
                              disabled={isExecuting}
                              className="btn btn-secondary btn-sm"
                              style={{ height: 26, fontSize: 10, padding: '0 8px' }}
                            >
                              <Play size={10} />
                              <span>{isExecuting ? 'Running...' : 'Run in Sandbox'}</span>
                            </button>
                          )}
                        </div>

                        {/* Synchronized Code Textarea */}
                        <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <textarea
                            readOnly
                            value={candidateLiveCode || '// Waiting for candidate to type code in their terminal editor...\n// Updates are mirrored here in real time.'}
                            className="form-textarea"
                            style={{
                              flex: 1,
                              borderRadius: 0,
                              border: 'none',
                              background: '#040711',
                              color: '#cbd5e1',
                              fontFamily: "'JetBrains Mono', monospace",
                              fontSize: 12,
                              lineHeight: 1.7,
                              padding: 14,
                              resize: 'none'
                            }}
                          />

                          {/* Code Execution Output Panel */}
                          {codeOutput !== null && (
                            <div className={`code-output ${codeOutputError ? 'error' : ''}`} style={{ maxHeight: 150, overflowY: 'auto' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10, color: 'var(--text-muted)' }}>
                                <span>OUTPUT CONSOLE</span>
                                <button
                                  onClick={() => {}}
                                  style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
                                >
                                  Clear
                                </button>
                              </div>
                              <pre style={{ margin: 0, fontFamily: 'inherit', fontSize: 'inherit' }}>{codeOutput}</pre>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              );
            })() : (
              <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32 }}>
                <Users size={48} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />
                <div style={{ textAlign: 'center' }}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    Select a Candidate Feed
                  </h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    Choose any candidate card from the Grid View to inspect high-fidelity telemetry, synchronized code, and 2-way stream.
                  </p>
                </div>
                <button
                  onClick={() => setViewMode('grid')}
                  className="btn btn-primary btn-sm"
                >
                  Return to Grid View
                </button>
              </div>
            )}
          </main>
        )}

        {/* ── COLLAPSIBLE INCIDENT & AUDIT FEED DRAWER ─────────────────────── */}
        <IncidentDrawer
          isOpen={isIncidentDrawerOpen}
          onClose={() => setIsIncidentDrawerOpen(false)}
          incidents={incidents}
          onSelectIncident={handleSelectIncidentFromDrawer}
          selectedCandidateId={selectedCandidate?.candidate_id || selectedCandidate?.id}
          allCandidates={candidates}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
         MODAL 1: INTERVENE / SEND WARNING NOTIFICATION
         ══════════════════════════════════════════════════════════════════════ */}
      {warningModalCandidate && (
        <div className="modal-backdrop animate-fade-in" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 480 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(245, 158, 11, 0.12)', color: '#f59e0b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertTriangle size={15} />
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Send Proctor Warning
                </h3>
              </div>
              <button
                onClick={() => setWarningModalCandidate(null)}
                className="btn btn-ghost btn-icon btn-sm"
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              Issuing warning to <strong>{warningModalCandidate.candidate_name || warningModalCandidate.fullname}</strong>. This alert will pop up on the candidate's exam screen instantly and log in the audit trail.
            </div>

            {/* Quick Warning Presets */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Quick Presets:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {warningPresets.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectWarningPreset(preset)}
                    className="btn btn-ghost btn-sm"
                    style={{
                      textAlign: 'left',
                      fontSize: 11,
                      padding: '6px 10px',
                      borderRadius: 6,
                      background: selectedWarningPreset === preset ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-elevated)',
                      border: `1px solid ${selectedWarningPreset === preset ? 'rgba(99, 102, 241, 0.35)' : 'var(--border-subtle)'}`,
                      color: selectedWarningPreset === preset ? 'var(--primary)' : 'var(--text-secondary)',
                      whiteSpace: 'normal',
                      height: 'auto'
                    }}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Warning Textarea */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Custom Warning Message:
              </label>
              <textarea
                value={warningMessage}
                onChange={e => setWarningMessage(e.target.value)}
                placeholder="Enter warning notice text to send..."
                className="form-textarea"
                rows={3}
                style={{ fontSize: 12 }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setWarningModalCandidate(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSendWarning}
                disabled={isSendingWarning || !warningMessage.trim()}
                className="btn btn-warning btn-sm"
              >
                <MessageSquare size={13} />
                <span>{isSendingWarning ? 'Transmitting...' : 'Send Warning Alert'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
         MODAL 2: MANUAL INCIDENT FLAGGING
         ══════════════════════════════════════════════════════════════════════ */}
      {flagModalCandidate && (
        <div className="modal-backdrop animate-fade-in" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Flag size={15} />
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Flag Proctoring Incident
                </h3>
              </div>
              <button
                onClick={() => setFlagModalCandidate(null)}
                className="btn btn-ghost btn-icon btn-sm"
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Record a policy violation against <strong>{flagModalCandidate.candidate_name || flagModalCandidate.fullname}</strong>. This adjusts their integrity trust score and enters the official report.
            </div>

            {/* Incident Tag Selector */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>
                Violation Category:
              </label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {incidentTags.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectIncidentTag(item)}
                    className="btn btn-ghost btn-sm"
                    style={{
                      fontSize: 10,
                      padding: '4px 8px',
                      borderRadius: 6,
                      background: flagTag === item.label ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-elevated)',
                      border: `1px solid ${flagTag === item.label ? 'rgba(239, 68, 68, 0.4)' : 'var(--border-subtle)'}`,
                      color: flagTag === item.label ? '#ef4444' : 'var(--text-secondary)'
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Severity & Penalty */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Severity Level:
                </label>
                <select
                  value={flagSeverity}
                  onChange={e => setFlagSeverity(e.target.value)}
                  className="form-select"
                  style={{ height: 32, fontSize: 11 }}
                >
                  <option value="high">Critical (High)</option>
                  <option value="medium">Warning (Medium)</option>
                  <option value="low">Notice (Low)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                  Integrity Penalty:
                </label>
                <select
                  value={flagPenalty}
                  onChange={e => setFlagPenalty(Number(e.target.value))}
                  className="form-select"
                  style={{ height: 32, fontSize: 11 }}
                >
                  <option value={15}>-15% (Severe breach)</option>
                  <option value={10}>-10% (Major violation)</option>
                  <option value={5}>-5% (Standard penalty)</option>
                  <option value={2}>-2% (Minor warning)</option>
                </select>
              </div>
            </div>

            {/* Details / Notes */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Observation Notes / Details:
              </label>
              <textarea
                value={flagDetails}
                onChange={e => setFlagDetails(e.target.value)}
                placeholder="Describe what occurred (e.g. Candidate looked at phone beside keyboard for 15 seconds)..."
                className="form-textarea"
                rows={3}
                style={{ fontSize: 12 }}
              />
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setFlagModalCandidate(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmFlagIncident}
                disabled={isFlagging}
                className="btn btn-danger btn-sm"
              >
                <Flag size={13} />
                <span>{isFlagging ? 'Recording...' : 'Record Incident'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
         MODAL 3: TERMINATE SESSION CONFIRMATION
         ══════════════════════════════════════════════════════════════════════ */}
      {terminateModalCandidate && (
        <div className="modal-backdrop animate-fade-in" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 440 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(239, 68, 68, 0.12)', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PhoneOff size={15} />
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Terminate Session
                </h3>
              </div>
              <button
                onClick={() => setTerminateModalCandidate(null)}
                className="btn btn-ghost btn-icon btn-sm"
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Are you sure you want to forcibly terminate the interview session for <strong>{terminateModalCandidate.candidate_name || terminateModalCandidate.fullname}</strong>? This action locks the candidate exam and cannot be undone.
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Final Decision:
              </label>
              <select
                value={terminateDecision}
                onChange={e => setTerminateDecision(e.target.value)}
                className="form-select"
                style={{ height: 32, fontSize: 11 }}
              >
                <option value="reject">Reject Candidate (Integrity Breach)</option>
                <option value="review">Flag for Manual Review</option>
                <option value="hire">Acceptable / Concluded Early</option>
              </select>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>
                Termination Reason:
              </label>
              <textarea
                value={terminateReason}
                onChange={e => setTerminateReason(e.target.value)}
                className="form-textarea"
                rows={2}
                style={{ fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setTerminateModalCandidate(null)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmTerminate}
                className="btn btn-danger btn-sm"
              >
                <PhoneOff size={13} />
                <span>Terminate Now</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
         MODAL 4: BROADCAST NOTICE TO ALL ACTIVE SESSIONS
         ══════════════════════════════════════════════════════════════════════ */}
      {broadcastModalOpen && (
        <div className="modal-backdrop animate-fade-in" role="dialog" aria-modal="true">
          <div className="modal-card" style={{ maxWidth: 460 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(99, 102, 241, 0.12)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Radio size={15} />
                </div>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  Broadcast Proctor Notice
                </h3>
              </div>
              <button
                onClick={() => setBroadcastModalOpen(false)}
                className="btn btn-ghost btn-icon btn-sm"
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              Transmit an immediate broadcast message to <strong>all {activeCount} active candidates</strong> currently taking exams.
            </div>

            <div style={{ marginBottom: 16 }}>
              <textarea
                value={broadcastMessage}
                onChange={e => setBroadcastMessage(e.target.value)}
                placeholder="e.g. System reminder: 15 minutes remaining. Please finalize submissions and ensure webcam is unblocked."
                className="form-textarea"
                rows={3}
                style={{ fontSize: 12 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                onClick={() => setBroadcastModalOpen(false)}
                className="btn btn-secondary btn-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBroadcastWarning}
                disabled={!broadcastMessage.trim()}
                className="btn btn-primary btn-sm"
              >
                <Radio size={13} />
                <span>Send Broadcast to All</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
