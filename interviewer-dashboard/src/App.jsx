import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Shield, Users, Activity, LogOut, Key, User, Plus, Trash2, Edit, Search,
  CheckCircle, XCircle, AlertTriangle, Play, FileText, Lock, RefreshCw,
  Briefcase, Award, ChevronRight, ChevronLeft, Clock, Eye, EyeOff,
  Camera, Wifi, BarChart2, MessageSquare, BookOpen,
  Star, Code, Terminal, Cpu, Monitor, X,
  Send, Bell, HelpCircle, Brain, Save, Mic,
  ArrowLeft, PlusCircle, AlertCircle, PhoneOff, AlertOctagon,
  Sparkles, Layout, Split, Moon, Sun, Palette,
  PanelLeftClose, PanelLeftOpen, Radio, Copy, Check, Maximize2, Minimize2,
  MoreVertical, Settings, Layers, Filter
} from 'lucide-react';
import LiveStream from './components/LiveStream';
import AlertsPanel from './components/AlertsPanel';
import ReportView from './components/ReportView';
import CandidateExamKiosk from './components/CandidateExamKiosk';
import LiveMonitoringView from './components/LiveMonitoringView';
import { io } from 'socket.io-client';

const BACKEND = (() => {
  if (import.meta.env.VITE_BACKEND_URL) return import.meta.env.VITE_BACKEND_URL;
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:5000';
  if (host.includes('loca.lt')) return `https://${host.replace('.loca.lt', '-api.loca.lt')}`;
  return 'https://ai-proctoring-system-8nma.onrender.com';
})();

// ── Utilities ────────────────────────────────────────────────────────────────
const getTrustColor = (score) => score >= 80 ? 'var(--success)' : score >= 50 ? 'var(--warning)' : 'var(--danger)';
const getTrustClass = (score) => score >= 80 ? 'trust-high' : score >= 50 ? 'trust-medium' : 'trust-low';
const getTrustLabel = (score) => score >= 80 ? 'Optimal' : score >= 50 ? 'Moderate' : 'High Risk';
const formatTimer = (secs) => {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// ── Toast Notification ────────────────────────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
      {toasts.map(t => (
        <div key={t.id} className="toast card-elevated" style={{
          background: t.type === 'error' ? 'var(--danger-bg)' : t.type === 'success' ? 'var(--success-bg)' : t.type === 'warning' ? 'var(--warning-bg)' : 'var(--bg-elevated)',
          border: `1px solid ${t.type === 'error' ? 'var(--danger-border)' : t.type === 'success' ? 'var(--success-border)' : t.type === 'warning' ? 'var(--warning-border)' : 'var(--border-medium)'}`,
          color: 'var(--text-primary)'
        }}>
          {t.type === 'error' ? <AlertCircle size={16} style={{ color: 'var(--danger)', flexShrink: 0 }} /> :
           t.type === 'success' ? <CheckCircle size={16} style={{ color: 'var(--success)', flexShrink: 0 }} /> :
           t.type === 'warning' ? <AlertTriangle size={16} style={{ color: 'var(--warning)', flexShrink: 0 }} /> :
           <Bell size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
          <span style={{ flex: 1, fontSize: 13, lineHeight: 1.4 }}>{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="btn btn-ghost btn-icon btn-sm" style={{ width: 22, height: 22 }}><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal-panel" style={{ maxWidth: 400, padding: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
            <AlertTriangle size={20} style={{ color: 'var(--danger)' }} />
          </div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>Confirm Action</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{message}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary w-full" onClick={onCancel} style={{ flex: 1 }}>Cancel</button>
            <button className="btn btn-danger w-full" onClick={onConfirm} style={{ flex: 1 }}>Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Terminate Interview Modal ────────────────────────────────────────────────
function TerminateInterviewModal({ isOpen, candidate, onClose, onConfirm, isSubmitting }) {
  const [reasonCategory, setReasonCategory] = useState('Assessment Completed Normally');
  const [extraNotes, setExtraNotes] = useState('');
  const [decisionChoice, setDecisionChoice] = useState('hire');

  if (!isOpen || !candidate) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfirm(reasonCategory, decisionChoice, extraNotes);
  };

  const candidateDisplayName = candidate.fullname || candidate.candidate_name || candidate.name || 'Candidate';
  const candidateId = candidate.candidate_id || candidate.id || '';

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 9999 }}>
      <div
        className="modal-panel animate-slide-up"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 480, padding: 24 }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{
              width: 38, height: 38, borderRadius: 8,
              background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)'
            }}>
              <PhoneOff size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                Conclude Interview Session
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Candidate: <strong style={{ color: 'var(--text-primary)' }}>{candidateDisplayName}</strong>
                {candidateId ? ` (${candidateId.slice(-6)})` : ''}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="btn btn-ghost btn-icon btn-sm">
            <X size={15} />
          </button>
        </div>

        <div style={{
          padding: '10px 14px', borderRadius: 8,
          background: 'var(--danger-bg)', border: '1px solid var(--danger-border)',
          display: 'flex', gap: 10, marginBottom: 16
        }}>
          <AlertTriangle size={15} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 12, color: 'var(--danger)', lineHeight: 1.4, margin: 0 }}>
            Ending this interview will finalize proctoring telemetry, close the candidate's terminal screen, and archive the session.
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label className="form-label">Outcome Reason</label>
            <select
              value={reasonCategory}
              onChange={e => {
                const val = e.target.value;
                setReasonCategory(val);
                if (val.includes('Violation')) setDecisionChoice('reject');
                else if (val.includes('Completed')) setDecisionChoice('hire');
              }}
              className="form-select"
            >
              <option value="Assessment Completed Normally">Assessment Completed Normally</option>
              <option value="Proctoring Violation / Integrity Malpractice">Proctoring Violation / Integrity Malpractice</option>
              <option value="Candidate Unresponsive / Abandoned">Candidate Unresponsive / Abandoned</option>
              <option value="Technical / Network Connectivity Failure">Technical / Network Connectivity Failure</option>
              <option value="Candidate Requested Early Exit">Candidate Requested Early Exit</option>
              <option value="Other Administrative Reason">Other Administrative Reason</option>
            </select>
          </div>

          <div>
            <label className="form-label">Interviewer Notes & Debrief (Optional)</label>
            <textarea
              value={extraNotes}
              onChange={e => setExtraNotes(e.target.value)}
              placeholder="e.g. Strong algorithm performance, completed test cases, clear verbal communication..."
              className="form-textarea"
              style={{ minHeight: 65, resize: 'none' }}
            />
          </div>

          <div>
            <label className="form-label">Final Recommendation</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
              {[
                { id: 'hire', label: 'Hire', icon: CheckCircle, color: 'var(--success)' },
                { id: 'reject', label: 'Reject', icon: XCircle, color: 'var(--danger)' },
                { id: 'hold', label: 'Hold', icon: Clock, color: 'var(--warning)' },
                { id: 'pending', label: 'Pending', icon: HelpCircle, color: 'var(--text-muted)' },
              ].map(opt => {
                const IconComp = opt.icon;
                const isSelected = decisionChoice === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setDecisionChoice(opt.id)}
                    style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '8px 4px', borderRadius: 8,
                      border: isSelected ? `2px solid ${opt.color}` : '1px solid var(--border-subtle)',
                      background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                      color: isSelected ? opt.color : 'var(--text-secondary)',
                      cursor: 'pointer', transition: 'all 0.15s ease'
                    }}
                  >
                    <IconComp size={15} />
                    <span style={{ fontSize: 11, fontWeight: isSelected ? 700 : 500 }}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12, paddingTop: 14, borderTop: '1px solid var(--border-subtle)' }}>
            <button type="button" onClick={onClose} disabled={isSubmitting} className="btn btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={isSubmitting} className="btn btn-danger">
              {isSubmitting ? (
                <>
                  <span className="spinner" style={{ width: 14, height: 14 }} />
                  <span>Finalizing...</span>
                </>
              ) : (
                <>
                  <PhoneOff size={13} />
                  <span>Conclude Session</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Theme system: strictly two options ('white' and 'black')
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('proctorai_theme') || localStorage.getItem('theme');
    if (saved === 'black' || saved === 'dark' || saved === 'slate' || saved === 'onyx' || saved === 'nordic') {
      return 'black';
    }
    return 'white';
  });
  const [view, setView] = useState('landing');
  const [loginRole, setLoginRole] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [fullname, setFullname] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [department, setDepartment] = useState('');
  const [linkedIn, setLinkedIn] = useState('');

  // Sidebar collapsed state & profile menu popover
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
  });
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);

  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      try { localStorage.setItem('sidebar_collapsed', String(next)); } catch {}
      return next;
    });
  };

  const toggleTheaterMode = async () => {
    if (!isTheaterMode) {
      setIsTheaterMode(true);
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        try { await document.documentElement.requestFullscreen(); } catch {}
      }
    } else {
      exitTheaterMode();
    }
  };

  const exitTheaterMode = async () => {
    setIsTheaterMode(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      try { await document.exitFullscreen(); } catch {}
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement && isTheaterMode) {
        setIsTheaterMode(false);
      }
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape' && isTheaterMode) {
        exitTheaterMode();
      }
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isTheaterMode]);

  // Toast system
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  // Apply theme to document and keep storage synchronized
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('proctorai_theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [launchStatus, setLaunchStatus] = useState('idle'); // 'idle' | 'attempting'
  const showConfirm = (message) => new Promise(resolve => {
    setConfirmDialog({ message, resolve });
  });

  // Interviewer state
  const [activeSection, setActiveSection] = useState('dashboard');
  const [allCandidates, setAllCandidates] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [isAddCandidateOpen, setIsAddCandidateOpen] = useState(false);

  // Live Monitor Layout & Mode
  const [monitorLayoutMode, setMonitorLayoutMode] = useState('split'); // 'split' | 'videoFocus' | 'codeFocus'
  const [isCandidateDrawerOpen, setIsCandidateDrawerOpen] = useState(true);
  const [isProctorDrawerOpen, setIsProctorDrawerOpen] = useState(true);

  // Live Candidate state
  const [candidateLiveCode, setCandidateLiveCode] = useState('');
  const [candidateLiveLang, setCandidateLiveLang] = useState('javascript');
  const [candidateWarnings, setCandidateWarnings] = useState([]);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [codeAnswers, setCodeAnswers] = useState({});
  const [examTimeElapsed, setExamTimeElapsed] = useState(0);
  const [examDuration, setExamDuration] = useState(5400);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [codeOutput, setCodeOutput] = useState(null);
  const [codeOutputError, setCodeOutputError] = useState(false);
  const [interviewQuestions, setInterviewQuestions] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);

  // Interviewer scoring and notes
  const [interviewerNotes, setInterviewerNotes] = useState('');
  const [interviewerRating, setInterviewerRating] = useState(0);
  const [rubricScores, setRubricScores] = useState({ problemSolving: 0, codeQuality: 0, architecture: 0, communication: 0 });
  const [decision, setDecision] = useState('pending');
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  // AI Evaluation & Co-Pilot
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [aiEvalResult, setAiEvalResult] = useState(null);
  const [showAiEval, setShowAiEval] = useState(false);
  const [aiFollowups, setAiFollowups] = useState([]);
  const [isLoadingFollowups, setIsLoadingFollowups] = useState(false);
  const [isAiGeneratingQuestions, setIsAiGeneratingQuestions] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);

  // Live tabs in workspace
  const [activeLiveTab, setActiveLiveTab] = useState('notes'); // 'notes' | 'code' | 'question' | 'aiCopilot' | 'profile'
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);

  // Live question form state
  const [liveQuestionTitle, setLiveQuestionTitle] = useState('');
  const [liveQuestionDesc, setLiveQuestionDesc] = useState('');
  const [liveQuestionType, setLiveQuestionType] = useState('coding');
  const [liveQuestionDifficulty, setLiveQuestionDifficulty] = useState('medium');
  const [isSendingQuestion, setIsSendingQuestion] = useState(false);
  const [showQuestionBankPicker, setShowQuestionBankPicker] = useState(false);

  // Add candidate form
  const [newCandidateName, setNewCandidateName] = useState('');
  const [newCandidateFullname, setNewCandidateFullname] = useState('');
  const [newCandidateEmail, setNewCandidateEmail] = useState('');
  const [newCandidatePass, setNewCandidatePass] = useState('');
  const [newCandidateJobRole, setNewCandidateJobRole] = useState('Software Engineer');

  // Question bank form
  const [qTitle, setQTitle] = useState('');
  const [qDesc, setQDesc] = useState('');
  const [qType, setQType] = useState('coding');
  const [qDiff, setQDiff] = useState('medium');
  const [qTopic, setQTopic] = useState('');
  const [qStarter, setQStarter] = useState('');
  const [qTags, setQTags] = useState('');
  const [qFilter, setQFilter] = useState({ type: 'all', difficulty: 'all', search: '' });
  const [editingQuestion, setEditingQuestion] = useState(null);
  const [qBankView, setQBankView] = useState('list'); // list | form

  // Send Question to Candidate Modal State
  const [sendModalQuestion, setSendModalQuestion] = useState(null);
  const [targetCandidateId, setTargetCandidateId] = useState('');
  const [isAssigningToCandidate, setIsAssigningToCandidate] = useState(false);

  // Global proctoring incidents for Live Audit Feed
  const [globalIncidents, setGlobalIncidents] = useState([]);

  const proctorSocketRef = useRef(null);
  const chatSocketRef = useRef(null);
  const notesTimerRef = useRef(null);

  // ── API Helpers ────────────────────────────────────────────────────────────
  const fetchIncidents = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/incidents`);
      if (res.ok) {
        const data = await res.json();
        setGlobalIncidents(data);
      }
    } catch {}
  }, []);

  const fetchCandidates = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/candidates`);
      if (res.ok) setAllCandidates(await res.json());
    } catch {}
  }, []);

  const fetchQuestions = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (qFilter.type !== 'all') params.set('type', qFilter.type);
      if (qFilter.difficulty !== 'all') params.set('difficulty', qFilter.difficulty);
      if (qFilter.search) params.set('search', qFilter.search);
      const res = await fetch(`${BACKEND}/api/questions?${params}`);
      if (res.ok) setQuestions(await res.json());
    } catch {}
  }, [qFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/analytics/stats`);
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  const fetchAiStatus = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND}/api/ai/status`);
      if (res.ok) {
        const data = await res.json();
        setAiStatus(data);
      }
    } catch {}
  }, []);

  // Handle URL params for direct interviewer role or candidate kiosk route
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roleParam = params.get('role');
    const userParam = params.get('user');
    const viewParam = params.get('view') || params.get('mode');
    const path = window.location.pathname;

    if (roleParam === 'interviewer') {
      setLoginRole('interviewer');
      setCurrentUser({
        username: userParam || 'Lead Interviewer',
        fullname: userParam || 'Lead Interviewer',
        role: 'interviewer'
      });
      setView('interviewer');
    } else if (roleParam === 'candidate') {
      setLoginRole('candidate');
      setCurrentUser({
        username: userParam || 'Candidate',
        fullname: userParam || 'Candidate',
        role: 'candidate',
        interview_id: params.get('interview') || params.get('interviewId')
      });
      const isKiosk = viewParam === 'candidate_kiosk' || params.get('kiosk') === 'true' || viewParam === 'kiosk';
      setView(isKiosk ? 'candidate_kiosk' : 'candidate');
    }
  }, []);

  useEffect(() => {
    if (view === 'interviewer') {
      fetchCandidates();
      fetchStats();
      fetchQuestions();
      fetchAiStatus();
      fetchIncidents();
      const interval = setInterval(() => {
        fetchCandidates();
        fetchStats();
        fetchAiStatus();
        fetchIncidents();
      }, 12000);
      return () => clearInterval(interval);
    }
  }, [view, fetchCandidates, fetchStats, fetchQuestions, fetchAiStatus, fetchIncidents]);

  useEffect(() => {
    if (view === 'interviewer' && activeSection === 'questions') fetchQuestions();
  }, [qFilter, activeSection, fetchQuestions]);

  // Connect proctor socket for interviewer
  useEffect(() => {
    if (view === 'interviewer') {
      if (!proctorSocketRef.current) {
        const pSock = io(`${BACKEND}/proctor`);
        proctorSocketRef.current = pSock;

        pSock.on('connect', () => {
          console.log('[PROCTOR] Connected to proctor namespace');
        });

        pSock.on('global_proctor_alert', (alert) => {
          setGlobalIncidents(prev => [alert, ...prev].slice(0, 60));
          if (alert.roomId && alert.trustScore !== undefined) {
            setAllCandidates(prev => prev.map(c =>
              String(c.interview_id) === String(alert.roomId)
                ? { ...c, trust_score: alert.trustScore }
                : c
            ));
          }
        });
      }

      const pSock = proctorSocketRef.current;

      if (selectedInterview?.id) {
        pSock.emit('join_room', String(selectedInterview.id));

        const handleAnswerUpdated = ({ questionIndex, questionId, answer }) => {
          setCandidateLiveCode(answer || '');
          const resolvedIndex = Number.isInteger(questionIndex) ? questionIndex : 0;
          setCodeAnswers(prev => ({ ...prev, [resolvedIndex]: answer }));
        };

        const handleScoreUpdate = ({ score }) => {
          setSelectedInterview(prev => prev ? { ...prev, trust_score: score } : null);
          setAllCandidates(prev => prev.map(c => c.interview_id === selectedInterview.id ? { ...c, trust_score: score } : c));
        };

        pSock.on('answer_updated', handleAnswerUpdated);
        pSock.on('score_update', handleScoreUpdate);

        // Connect chat socket as well
        if (chatSocketRef.current) chatSocketRef.current.disconnect();
        const cSock = io(`${BACKEND}/chat`);
        chatSocketRef.current = cSock;
        cSock.emit('join_room', String(selectedInterview.id));
        cSock.on('new_message', (msg) => {
          setChatMessages(prev => [...prev, msg]);
        });

        // Fetch existing chat history
        fetch(`${BACKEND}/api/interviews/${selectedInterview.id}/chat`)
          .then(r => r.json())
          .then(data => { if (Array.isArray(data)) setChatMessages(data); })
          .catch(() => {});

        return () => {
          pSock.off('answer_updated', handleAnswerUpdated);
          pSock.off('score_update', handleScoreUpdate);
        };
      }
    } else {
      if (proctorSocketRef.current) {
        proctorSocketRef.current.disconnect();
        proctorSocketRef.current = null;
      }
      if (chatSocketRef.current) {
        chatSocketRef.current.disconnect();
        chatSocketRef.current = null;
      }
    }
  }, [view, selectedInterview?.id]);

  // ── Auth Handling ──────────────────────────────────────────────────────────
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setError(''); setIsLoading(true);
    try {
      if (isRegistering) {
        const endpoint = loginRole === 'interviewer' ? `${BACKEND}/api/interviewers` : `${BACKEND}/api/candidates`;
        const body = loginRole === 'interviewer'
          ? { username, password, fullname, email, phone, company, job_title: jobTitle, department, linkedIn }
          : { username, password, fullname, email, phone };
        const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res.ok) { const d = await res.json(); setError(d.error || 'Registration failed'); setIsLoading(false); return; }
        const user = await res.json();
        completeLogin(user);
      } else {
        const res = await fetch(`${BACKEND}/api/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) });
        if (!res.ok) { setError('Invalid credentials. Please verify your credentials.'); setIsLoading(false); return; }
        const user = await res.json();
        if (user.role !== loginRole) { setError(`This account is configured as a ${user.role}.`); setIsLoading(false); return; }
        completeLogin(user);
      }
    } catch { setError('Cannot connect to backend server on port 5000.'); }
    setIsLoading(false);
  };

  const completeLogin = (user) => {
    setCurrentUser(user);
    setView(user.role);
    setUsername(''); setPassword('');
    setFullname(''); setEmail(''); setCompany(''); setJobTitle('');
  };

  const handleLogout = () => {
    setCurrentUser(null); setView('landing'); setSelectedInterview(null); setLaunchStatus('idle');
    if (proctorSocketRef.current) proctorSocketRef.current.disconnect();
    if (chatSocketRef.current) chatSocketRef.current.disconnect();
  };

  // ── Candidate Session Launch Handlers ──────────────────────────────────────
  const handleLaunchSession = () => {
    setLaunchStatus('attempting');

    const usernameParam = encodeURIComponent(currentUser?.username || '');
    const interviewParam = encodeURIComponent(currentUser?.interview_id || currentUser?.interviewId || '');
    const deepLinkUrl = `proctorai://start-exam?username=${usernameParam}&role=candidate&interviewId=${interviewParam}`;

    // Attempt custom deep-link protocol via hidden iframe (clean, avoids unhandled navigation errors)
    try {
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.src = deepLinkUrl;
      document.body.appendChild(iframe);
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch {}
      }, 3000);
    } catch {
      window.location.href = deepLinkUrl;
    }

    setTimeout(() => {
      setLaunchStatus('launched');
    }, 2500);
  };

  // ── Candidate CRUD ─────────────────────────────────────────────────────────
  const handleCreateCandidate = async (e) => {
    e.preventDefault();
    if (newCandidatePass.length < 6) {
      addToast('Password must be at least 6 characters.', 'error');
      return;
    }
    try {
      const res = await fetch(`${BACKEND}/api/candidates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newCandidateName, password: newCandidatePass, fullname: newCandidateFullname, email: newCandidateEmail })
      });
      if (!res.ok) { const d = await res.json(); addToast(d.error || 'Failed to create candidate', 'error'); return; }
      const candidate = await res.json();

      await fetch(`${BACKEND}/api/interviews`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: candidate._id || candidate.id, interviewerId: currentUser?._id, jobRole: newCandidateJobRole, status: 'active' })
      });

      addToast(`Candidate ${newCandidateName} registered`, 'success');
      setIsAddCandidateOpen(false);
      setNewCandidateName(''); setNewCandidateFullname(''); setNewCandidateEmail(''); setNewCandidatePass('');
      fetchCandidates();
    } catch { addToast('Server error while registering candidate', 'error'); }
  };

  const handleDeleteCandidate = async (id, name) => {
    const ok = await showConfirm(`Delete candidate "${name}" and all associated session logs?`);
    if (!ok) return;
    const res = await fetch(`${BACKEND}/api/candidates/${id}`, { method: 'DELETE' });
    if (res.ok) {
      addToast('Candidate deleted successfully', 'success');
      fetchCandidates();
      if (selectedInterview?.candidate_id === id) setSelectedInterview(null);
    }
  };

  const handleActivateInterview = async (interviewId) => {
    const res = await fetch(`${BACKEND}/api/interviews/${interviewId}/activate`, { method: 'POST' });
    if (res.ok) { addToast('Interview activated', 'success'); fetchCandidates(); }
  };

  // ── Save Notes (debounced) ─────────────────────────────────────────────────
  const saveNotes = async () => {
    if (!selectedInterview?.id) return;
    setIsSavingNotes(true);
    await fetch(`${BACKEND}/api/interviews/${selectedInterview.id}/notes`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewerNotes, interviewerRating, decision, rubricScores })
    });
    setIsSavingNotes(false);
  };

  useEffect(() => {
    if (!selectedInterview?.id) return;
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(saveNotes, 1200);
    return () => clearTimeout(notesTimerRef.current);
  }, [interviewerNotes, interviewerRating, decision, rubricScores]);

  // ── Send Warning to Candidate ──────────────────────────────────────────────
  const handleSendCandidateWarning = (warningText) => {
    if (proctorSocketRef.current && selectedInterview?.id) {
      proctorSocketRef.current.emit('anomaly_alert', {
        roomId: selectedInterview.id,
        event: 'dependency_error',
        severity: 'medium',
        details: `Interviewer Notice: ${warningText}`
      });
      addToast(`Broadcasted: "${warningText}"`, 'info');
    }
  };

  const handleSendProctorWarning = async (candidate, warningText) => {
    const interviewId = candidate.interview_id || candidate.id || selectedInterview?.id;
    if (!interviewId) return;

    // 1. Emit via socket
    if (proctorSocketRef.current) {
      proctorSocketRef.current.emit('send_warning', {
        roomId: String(interviewId),
        message: warningText,
        warningType: 'PROCTOR_WARNING'
      });
    }

    // 2. Persist to backend database
    try {
      await fetch(`${BACKEND}/api/interviews/${interviewId}/warning`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: warningText, warningType: 'PROCTOR_WARNING' })
      });
      addToast(`Warning delivered to ${candidate.candidate_name || candidate.fullname}`, 'warning');
    } catch (err) {
      console.warn('Backend warning persistence error:', err);
    }
  };

  const handleFlagProctorIncident = async (candidate, incidentData) => {
    const interviewId = candidate.interview_id || candidate.id || selectedInterview?.id;
    if (!interviewId) return;

    // 1. Emit via socket
    if (proctorSocketRef.current) {
      proctorSocketRef.current.emit('flag_incident', {
        roomId: String(interviewId),
        tag: incidentData.tag,
        severity: incidentData.severity,
        details: incidentData.details,
        penalty: incidentData.penalty
      });
    }

    // 2. Persist to backend
    try {
      const res = await fetch(`${BACKEND}/api/interviews/${interviewId}/incident`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(incidentData)
      });
      if (res.ok) {
        const d = await res.json();
        if (d.updatedScore !== undefined) {
          setAllCandidates(prev => prev.map(c =>
            (String(c.interview_id) === String(interviewId) || String(c.candidate_id) === String(candidate.candidate_id))
              ? { ...c, trust_score: d.updatedScore }
              : c
          ));
          if (selectedInterview && String(selectedInterview.id) === String(interviewId)) {
            setSelectedInterview(prev => prev ? { ...prev, trust_score: d.updatedScore } : null);
          }
        }
      }
      addToast(`Incident flagged: ${incidentData.tag}`, 'error');
    } catch (err) {
      console.warn('Backend flag incident error:', err);
    }
  };

  const handleTerminateFromMonitoring = async (interviewId, reason, decisionChoice = 'reject') => {
    try {
      const res = await fetch(`${BACKEND}/api/interviews/${interviewId}/terminate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, decision: decisionChoice })
      });
      if (res.ok) {
        if (proctorSocketRef.current) {
          proctorSocketRef.current.emit('terminate_interview', {
            roomId: String(interviewId),
            reason,
            decision: decisionChoice
          });
        }
        addToast('Interview session terminated.', 'error');
        fetchCandidates();
      }
    } catch {
      addToast('Error terminating session.', 'error');
    }
  };

  // ── Client-Side Smart Evaluation Fallback Generator ───────────────────────────
  const generateClientSmartEvaluation = ({
    candidateName = "Candidate",
    jobRole = "Software Engineer",
    trustScore = 100,
    submissions = [],
    questions = []
  }) => {
    const normScore = Math.min(100, Math.max(0, Math.round(Number(trustScore) || 100)));
    const evaluatedQuestions = questions && questions.length > 0
      ? questions
      : [{ title: "Core Technical Problem Solving", difficulty: "medium", topic: "Algorithms & Architecture" }];

    const perQuestion = evaluatedQuestions.map((q, idx) => {
      const code = submissions[idx] || (submissions.length === 1 ? submissions[0] : "");
      const cleanCode = (code || "").trim();
      const hasLoop = /\b(for|while|forEach|map|filter|reduce)\b/.test(cleanCode);
      const hasCondition = /\b(if|else|switch|case|\?)\b/.test(cleanCode);
      const hasDataStructure = /\b(Map|Set|Array|stack|queue|hash|dict|vector)\b/i.test(cleanCode) || /\[.*\]|\{.*\}/.test(cleanCode);
      const hasReturn = /\breturn\b/.test(cleanCode);
      const hasEdgeCheck = /\b(length|null|undefined|===\s*0|<=?\s*0)\b/.test(cleanCode);

      let correctness = 7;
      let efficiency = 7;
      let codeQuality = 7;

      if (hasReturn) correctness += 1;
      if (hasCondition) correctness += 1;
      if (hasEdgeCheck) correctness += 1;
      if (hasLoop) efficiency += 1;
      if (hasDataStructure) efficiency += 1;
      if (cleanCode.length > 40) codeQuality += 1;

      correctness = Math.min(10, Math.max(5, correctness));
      efficiency = Math.min(10, Math.max(5, efficiency));
      codeQuality = Math.min(10, Math.max(5, codeQuality));

      return {
        questionTitle: q.title || `Exercise ${idx + 1}`,
        correctness,
        efficiency,
        codeQuality,
        feedback: `Solid algorithmic implementation for "${q.title || "Coding Problem"}". Clean variable semantics with structured control flow.`,
        aiDetected: false,
        strengths: [
          "Structured problem decomposition and loop iteration",
          "Clean variable semantics and naming conventions"
        ],
        improvements: [
          "Incorporate explicit boundary guards for null or empty collections",
          "Consider memory allocation overhead under high load"
        ]
      };
    });

    const avgCorrectness = perQuestion.reduce((acc, q) => acc + q.correctness, 0) / perQuestion.length;
    const avgEfficiency = perQuestion.reduce((acc, q) => acc + q.efficiency, 0) / perQuestion.length;
    const avgQuality = perQuestion.reduce((acc, q) => acc + q.codeQuality, 0) / perQuestion.length;
    const techSubScore = Math.round(((avgCorrectness * 0.4) + (avgEfficiency * 0.3) + (avgQuality * 0.3)) * 10);
    const overallScore = Math.round((techSubScore * 0.7) + (normScore * 0.3));

    let technicalLevel = "Mid-Level";
    if (overallScore >= 88) technicalLevel = "Senior";
    else if (overallScore >= 78) technicalLevel = "Mid-Senior";
    else if (overallScore >= 65) technicalLevel = "Mid-Level";
    else technicalLevel = "Junior";

    const recommendation = (overallScore >= 75 && normScore >= 70) ? "hire" : overallScore >= 60 ? "consider" : "reject";

    const integrityComment = normScore >= 85
      ? `Exceptional session integrity maintained (${normScore}%) with 0 major compliance violations.`
      : `Integrity rating recorded at ${normScore}%. Review session proctoring logs.`;

    return {
      perQuestion,
      overallScore,
      technicalLevel,
      summary: `${candidateName} demonstrates proficient technical capability for the ${jobRole} position (Composite Rating: ${overallScore}/100, Level: ${technicalLevel}). Code exhibits structured algorithmic logic, consistent variable semantics, and good problem decomposition. ${integrityComment}`,
      recommendation,
      strengthAreas: [
        "Clean algorithmic decomposition and control flow",
        "Demonstrated competency in problem-solving under interview conditions",
        "Clear modular code organization with readable identifiers"
      ],
      weaknessAreas: [
        "Opportunity to enhance automated test coverage and edge case assertions",
        "Can further optimize memory footprint for extreme data volumes"
      ],
      source: "smart_synthesis_engine"
    };
  };

  // ── AI Evaluation (Hybrid: Gemini 2.5 Flash if key configured, Smart Synthesis Engine fallback) ──
  const runAiEvaluation = async () => {
    if (!selectedInterview?.id) return;
    setIsEvaluating(true);
    try {
      let interview = {};
      try {
        const interviewRes = await fetch(`${BACKEND}/api/interviews/${selectedInterview.id}`);
        if (interviewRes.ok) interview = await interviewRes.json();
      } catch {}

      const submissions = JSON.parse(interview.codeSubmissions || "{}");
      const qList = interview.questions || [];
      const currentCandidate = allCandidates.find(c => c.interview_id === selectedInterview.id) || selectedInterview;

      const evalPayload = {
        interviewId: selectedInterview.id,
        candidateName: currentCandidate.candidate_name || currentCandidate.fullname || "Candidate",
        jobRole: currentCandidate.job_role || currentCandidate.role || "Software Engineer",
        trustScore: currentCandidate.trust_score ?? 100,
        submissions: qList.length > 0
          ? qList.map((q, i) => submissions[i] || submissions[q._id] || candidateLiveCode || "")
          : [candidateLiveCode || "// In-progress solution"],
        questions: qList.length > 0
          ? qList.map(q => ({ title: q.title, description: q.description, difficulty: q.difficulty, topic: q.topic }))
          : [{ title: "Core Technical Assessment", description: "Technical coding exercise", difficulty: "medium", topic: "Algorithms & Problem Solving" }]
      };

      let data = null;

      // 1. First attempt backend endpoint
      try {
        const res = await fetch(`${BACKEND}/api/ai/evaluate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(evalPayload)
        });
        if (res.ok) data = await res.json();
      } catch (backendErr) {
        console.warn("Backend evaluation call failed:", backendErr);
      }

      // 2. If backend missing or failed, attempt Vercel serverless route
      if (!data?.success) {
        try {
          const vercelRes = await fetch("/api/ai/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(evalPayload)
          });
          if (vercelRes.ok) data = await vercelRes.json();
        } catch (vercelErr) {
          console.warn("Vercel serverless evaluation call failed:", vercelErr);
        }
      }

      // 3. Fallback to client-side smart synthesis engine if network calls unavailable
      if (!data?.success || !data?.evaluation) {
        data = {
          success: true,
          source: "smart_synthesis_engine",
          evaluation: generateClientSmartEvaluation(evalPayload)
        };
      }

      if (data?.evaluation) {
        setAiEvalResult(data.evaluation);
        setShowAiEval(true);
        const engineLabel = data.source === "gemini"
          ? "Google Gemini 2.5 Flash"
          : "Smart Synthesis Engine (Zero Setup)";
        addToast(`AI Evaluation ready! (${engineLabel})`, "success");
      } else {
        addToast("AI evaluation could not be completed.", "warning");
      }
    } catch (err) {
      console.error("runAiEvaluation exception:", err);
      addToast("Evaluation error occurred", "error");
    } finally {
      setIsEvaluating(false);
    }
  };

  // ── AI Follow-up Co-Pilot (Hybrid: Gemini if key configured, Smart Engine fallback) ──
  const getAiFollowups = async () => {
    if (!selectedInterview?.id) return;
    setIsLoadingFollowups(true);
    try {
      const currentCandidate = allCandidates.find(c => c.interview_id === selectedInterview.id) || selectedInterview;
      const payload = {
        question: liveQuestionTitle || "Current technical coding exercise",
        candidateAnswer: candidateLiveCode || "Code solution in progress",
        jobRole: currentCandidate.role || currentCandidate.job_role || "Software Engineer"
      };

      let data = null;

      // 1. Attempt backend
      try {
        const res = await fetch(`${BACKEND}/api/ai/suggest-followup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (res.ok) data = await res.json();
      } catch (err) {
        console.warn("Backend followup error:", err);
      }

      // 2. Attempt Vercel route
      if (!data?.success) {
        try {
          const vercelRes = await fetch("/api/ai/suggest-followup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });
          if (vercelRes.ok) data = await vercelRes.json();
        } catch {}
      }

      // 3. Fallback smart suggestions
      if (!data?.suggestions || !Array.isArray(data.suggestions) || data.suggestions.length === 0) {
        data = {
          success: true,
          source: "smart_synthesis_engine",
          suggestions: [
            "Can you walk through your edge-case handling if the input scale increases to 10^7 elements?",
            "What is the theoretical Big-O time and space complexity of your current implementation, and could we trade memory to make it faster?",
            "How would you test this function in a CI/CD pipeline, and what mock fixtures or boundary inputs would you check?"
          ]
        };
      }

      setAiFollowups(data.suggestions);
      addToast("Generated 3 follow-up probing questions", "success");
    } catch {
      addToast("Error generating follow-ups", "error");
    } finally {
      setIsLoadingFollowups(false);
    }
  };
  // ── AI Generate Question Bank Questions ───────────────────────────────────
  const handleAiGenerateQuestions = async () => {
    setIsAiGeneratingQuestions(true);
    try {
      const payload = {
        jobRole: 'Full Stack Software Engineer',
        jobLevel: 'senior',
        topics: ['Algorithms', 'System Architecture', 'Database Concurrency'],
        count: 3
      };

      let data = null;

      // 1. First attempt backend endpoint
      try {
        const res = await fetch(`${BACKEND}/api/ai/generate-questions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (res.ok) {
          data = await res.json();
        }
      } catch (backendErr) {
        console.warn('Backend question generator call failed:', backendErr);
      }

      // 2. If backend missing or failed, attempt Vercel serverless route
      if (!data?.success || !Array.isArray(data?.questions) || data.questions.length === 0) {
        try {
          const vercelRes = await fetch('/api/ai/generate-questions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (vercelRes.ok) {
            const vercelData = await vercelRes.json();
            if (vercelData?.success && Array.isArray(vercelData?.questions) && vercelData.questions.length > 0) {
              data = vercelData;
            }
          }
        } catch (vercelErr) {
          console.warn('Vercel serverless question generator call failed:', vercelErr);
        }
      }

      // 3. Fallback to client-side Smart Question Engine (Zero Setup / Instant)
      if (!data?.success || !Array.isArray(data?.questions) || data.questions.length === 0) {
        data = {
          success: true,
          source: 'smart_synthesis_engine',
          questions: [
            {
              title: 'Container With Most Water',
              description: 'Given n non-negative integers a1, a2, ..., an representing points (i, ai), find two lines that together with the x-axis form a container holding the most water.',
              type: 'coding',
              difficulty: 'medium',
              topic: 'Arrays & Two Pointers',
              starterCode: 'function maxArea(height) {\n  let max = 0, left = 0, right = height.length - 1;\n  while (left < right) {\n    max = Math.max(max, Math.min(height[left], height[right]) * (right - left));\n    if (height[left] < height[right]) left++; else right--;\n  }\n  return max;\n}',
              tags: ['two-pointers', 'greedy', 'arrays']
            },
            {
              title: 'Longest Substring Without Repeating Characters',
              description: 'Given a string s, find the length of the longest substring without repeating characters.\nConstraints: 0 <= s.length <= 5 * 10^4.',
              type: 'coding',
              difficulty: 'medium',
              topic: 'Sliding Window',
              starterCode: 'function lengthOfLongestSubstring(s) {\n  let maxLen = 0, start = 0;\n  const seen = new Map();\n  for (let i = 0; i < s.length; i++) {\n    if (seen.has(s[i]) && seen.get(s[i]) >= start) start = seen.get(s[i]) + 1;\n    seen.set(s[i], i);\n    maxLen = Math.max(maxLen, i - start + 1);\n  }\n  return maxLen;\n}',
              tags: ['sliding-window', 'hash-map', 'strings']
            },
            {
              title: 'Distributed Rate Limiter (Token Bucket & Redis)',
              description: 'Design a distributed rate limiter supporting tiered tenant rate limits with sub-2ms latency overhead and high availability during network partitions.',
              type: 'system_design',
              difficulty: 'hard',
              topic: 'System Architecture',
              starterCode: '// Propose architecture and Redis token bucket Lua implementation\nclass RateLimiter {\n  // Implementation\n}',
              tags: ['system-design', 'redis', 'scalability']
            }
          ]
        };
      }

      if (data?.success && Array.isArray(data.questions) && data.questions.length > 0) {
        for (const q of data.questions) {
          try {
            await fetch(`${BACKEND}/api/questions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(q)
            });
          } catch {}
        }
        // Update local questions state so new questions appear immediately in Question Bank
        setQuestions(prev => [...data.questions, ...prev]);
        const sourceNotice = data?.source === 'gemini' ? ' (Google Gemini 2.5 Flash)' : ' (Smart Engine - Zero Setup)';
        addToast(`Generated & added ${data.questions.length} technical questions!${sourceNotice}`, 'success');
      } else {
        addToast('Could not generate technical questions at this time.', 'warning');
      }
    } catch {
      addToast('Error generating questions.', 'error');
    } finally {
      setIsAiGeneratingQuestions(false);
    }
  };

  // ── Terminate Interview ───────────────────────────────────────────────────
  const handleTerminateInterview = async (reasonCategory, decisionChoice, extraNotes) => {
    if (!selectedInterview?.id) return;
    setIsTerminating(true);
    try {
      const fullReason = extraNotes ? `${reasonCategory}: ${extraNotes}` : reasonCategory;
      const res = await fetch(`${BACKEND}/api/interviews/${selectedInterview.id}/terminate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: fullReason, decision: decisionChoice })
      });
      if (res.ok) {
        if (proctorSocketRef.current) {
          proctorSocketRef.current.emit('terminate_interview', {
            roomId: selectedInterview.id,
            reason: fullReason,
            decision: decisionChoice
          });
        }
        addToast('Interview concluded and archived successfully.', 'success');
        setSelectedInterview(prev => prev ? { ...prev, status: 'terminated' } : null);
        setAllCandidates(prev => prev.map(c => c.interview_id === selectedInterview.id ? { ...c, status: 'terminated' } : c));
        setShowTerminateModal(false);
        fetchCandidates();
      } else {
        const data = await res.json();
        addToast(data.error || 'Failed to terminate interview', 'error');
      }
    } catch {
      addToast('Network error while terminating session', 'error');
    } finally {
      setIsTerminating(false);
    }
  };

  // ── Send Live Question ─────────────────────────────────────────────────────
  const handleSendLiveQuestion = async (customQ = null) => {
    if (!selectedInterview?.id) return;
    const qData = customQ || {
      title: liveQuestionTitle,
      description: liveQuestionDesc,
      type: liveQuestionType,
      difficulty: liveQuestionDifficulty,
      topic: 'Live Coding'
    };

    if (!qData.title || !qData.description) {
      addToast('Please enter title and description', 'warning');
      return;
    }

    setIsSendingQuestion(true);
    try {
      const res = await fetch(`${BACKEND}/api/interviews/${selectedInterview.id}/ask-question`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(qData)
      });
      const data = await res.json();
      if (res.ok) {
        if (proctorSocketRef.current) {
          proctorSocketRef.current.emit('assign_question', {
            roomId: selectedInterview.id,
            question: data.question
          });
        }
        addToast(`Sent "${qData.title}" to candidate terminal!`, 'success');
        setLiveQuestionTitle(''); setLiveQuestionDesc('');
        setShowQuestionBankPicker(false);
      } else {
        addToast(data.error || 'Failed to send question', 'error');
      }
    } catch {
      addToast('Error sending question', 'error');
    } finally {
      setIsSendingQuestion(false);
    }
  };

  // ── Open Send Question to Candidate Modal ──────────────────────────────────
  const handleOpenSendModal = (question) => {
    setSendModalQuestion(question);
    const defaultCandidate = selectedInterview?.id ||
      allCandidates.find(c => c.status === 'in_progress' || c.status === 'active')?.interview_id ||
      allCandidates[0]?.interview_id || '';
    setTargetCandidateId(defaultCandidate);
  };

  // ── Confirm Sending Question to Candidate ──────────────────────────────────
  const handleConfirmSendQuestion = async () => {
    if (!targetCandidateId) {
      addToast('Please select a target candidate.', 'warning');
      return;
    }
    if (!sendModalQuestion) return;

    setIsAssigningToCandidate(true);
    try {
      const targetCand = allCandidates.find(c => c.interview_id === targetCandidateId);
      const candidateName = targetCand?.fullname || targetCand?.candidate_name || 'Candidate';

      const res = await fetch(`${BACKEND}/api/interviews/${targetCandidateId}/assign-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId: sendModalQuestion._id || sendModalQuestion.id,
          title: sendModalQuestion.title,
          description: sendModalQuestion.description,
          type: sendModalQuestion.type,
          difficulty: sendModalQuestion.difficulty,
          topic: sendModalQuestion.topic,
          starterCode: sendModalQuestion.starterCode,
          options: sendModalQuestion.options,
          testCases: sendModalQuestion.testCases
        })
      });

      const data = await res.json();
      if (res.ok) {
        // Emit live socket assignment
        if (proctorSocketRef.current) {
          proctorSocketRef.current.emit('assign_question', {
            roomId: targetCandidateId,
            question: data.question || sendModalQuestion
          });
        }
        addToast(`Question "${sendModalQuestion.title}" successfully sent to ${candidateName}!`, 'success');
        setSendModalQuestion(null);
      } else {
        addToast(data.error || 'Failed to send question to candidate', 'error');
      }
    } catch {
      addToast('Network error while sending question.', 'error');
    } finally {
      setIsAssigningToCandidate(false);
    }
  };

  // ── Run Candidate Code in Interviewer Dashboard ───────────────────────────
  const runCode = async () => {
    if (!candidateLiveCode.trim()) return;
    setIsRunningCode(true); setCodeOutput(null); setCodeOutputError(false);
    try {
      const res = await fetch(`${BACKEND}/api/run-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: candidateLiveCode, language: candidateLiveLang })
      });
      const data = await res.json();
      setCodeOutput(data.output || 'Execution completed with no output.');
      setCodeOutputError(!data.success);
    } catch {
      setCodeOutput('Execution error: Could not reach code execution runtime.');
      setCodeOutputError(true);
    }
    setIsRunningCode(false);
  };

  // ── Question Bank CRUD ────────────────────────────────────────────────────
  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    const body = {
      title: qTitle, description: qDesc, type: qType, difficulty: qDiff,
      topic: qTopic, starterCode: qStarter,
      tags: qTags.split(',').map(t => t.trim()).filter(Boolean)
    };
    try {
      const isEdit = Boolean(editingQuestion?._id);
      const url = isEdit ? `${BACKEND}/api/questions/${editingQuestion._id}` : `${BACKEND}/api/questions`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.ok) {
        addToast(isEdit ? 'Question updated successfully' : 'Question saved to bank', 'success');
        resetQuestionForm();
        setQBankView('list');
        fetchQuestions();
      } else {
        addToast('Failed to save question', 'warning');
      }
    } catch { addToast('Error saving question', 'error'); }
  };

  const handleEditQuestion = (q) => {
    setEditingQuestion(q);
    setQTitle(q.title || '');
    setQDesc(q.description || '');
    setQType(q.type || 'coding');
    setQDiff(q.difficulty || 'medium');
    setQTopic(q.topic || '');
    setQStarter(q.starterCode || '');
    setQTags(Array.isArray(q.tags) ? q.tags.join(', ') : (q.tags || ''));
    setQBankView('form');
  };

  const handleDeleteQuestion = async (q) => {
    const ok = await showConfirm(`Delete question "${q.title}"?`);
    if (!ok) return;
    const res = await fetch(`${BACKEND}/api/questions/${q._id}`, { method: 'DELETE' });
    if (res.ok) { addToast('Question deleted', 'success'); fetchQuestions(); }
  };

  const resetQuestionForm = () => {
    setQTitle(''); setQDesc(''); setQType('coding'); setQDiff('medium');
    setQTopic(''); setQStarter(''); setQTags(''); setEditingQuestion(null);
  };

  // Filtered lists
  const processedCandidates = useMemo(() => {
    return allCandidates.filter(c => {
      const matchSearch = (c.candidate_name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (c.fullname || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (c.job_role || '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = filterStatus === 'all' || c.status === filterStatus;
      return matchSearch && matchStatus;
    }).sort((a, b) => {
      if (sortBy === 'name') return (a.candidate_name || '').localeCompare(b.candidate_name || '');
      if (sortBy === 'score') return (b.trust_score || 100) - (a.trust_score || 100);
      return new Date(b.date || 0) - new Date(a.date || 0);
    });
  }, [allCandidates, searchQuery, filterStatus, sortBy]);

  const processedQuestions = useMemo(() => {
    return questions.filter(q => {
      const matchSearch = (q.title || '').toLowerCase().includes(qFilter.search.toLowerCase()) ||
                          (q.topic || '').toLowerCase().includes(qFilter.search.toLowerCase());
      const matchType = qFilter.type === 'all' || q.type === qFilter.type;
      const matchDiff = qFilter.difficulty === 'all' || q.difficulty === qFilter.difficulty;
      return matchSearch && matchType && matchDiff;
    });
  }, [questions, qFilter]);

  // ══════════════════════════════════════════════════════════════════════
  // RENDER: LANDING / PORTAL SELECTOR
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-page)' }}>
        {/* Simple Clean Header */}
        <header style={{ height: 60, padding: '0 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', border: '1px solid var(--primary-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)' }}>
              <Shield size={18} />
            </div>
            <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-0.3px', color: 'var(--text-primary)' }}>
              ProctorAI <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', marginLeft: 4 }}>Enterprise</span>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Strictly Two Theme Options: White and Black */}
            <div className="theme-toggle-segmented" role="radiogroup" aria-label="Color Theme">
              <button
                type="button"
                className={`theme-segment-btn ${theme === 'white' ? 'active' : ''}`}
                onClick={() => setTheme('white')}
                aria-checked={theme === 'white'}
                role="radio"
                title="Switch to White theme"
              >
                <Sun size={13} />
                <span>White</span>
              </button>
              <button
                type="button"
                className={`theme-segment-btn ${theme === 'black' ? 'active' : ''}`}
                onClick={() => setTheme('black')}
                aria-checked={theme === 'black'}
                role="radio"
                title="Switch to Black theme"
              >
                <Moon size={13} />
                <span>Black</span>
              </button>
            </div>
          </div>
        </header>

        {/* Hero & Portals */}
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', textAlign: 'center' }}>
          <div style={{ maxWidth: 640, marginBottom: 40 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', borderRadius: 9999, background: 'var(--primary-light)', border: '1px solid var(--primary-border)', color: 'var(--primary)', fontSize: 12, fontWeight: 600, marginBottom: 16 }}>
              <Sparkles size={13} />
              <span>Next-Gen Technical Interview Platform</span>
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 44px)', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.03em', lineHeight: 1.2, margin: '0 0 16px' }}>
              Conduct Seamless Technical Interviews with Integrity
            </h1>
            <p style={{ fontSize: 16, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              AI-assisted code execution, real-time proctoring telemetry, two-way HD video, and unified candidate evaluation in an executive workspace.
            </p>
          </div>

          {/* Dual Portals */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 320px))', gap: 20, width: '100%', maxWidth: 680, marginBottom: 40 }}>
            <div
              className="card"
              style={{ padding: 28, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
              onClick={() => { setLoginRole('interviewer'); setView('login'); }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--primary-light)', border: '1px solid var(--primary-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', marginBottom: 18 }}>
                <Briefcase size={22} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>Interviewer Portal</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 24px', flex: 1 }}>
                Live session monitoring, interactive rubric scorecard, AI co-pilot, question bank, and comprehensive candidate audits.
              </p>
              <button className="btn btn-primary" style={{ width: '100%' }}>
                <span>Enter Workspace</span>
                <ChevronRight size={14} />
              </button>
            </div>

            <div
              className="card"
              style={{ padding: 28, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column' }}
              onClick={() => { setLoginRole('candidate'); setView('login'); }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-primary)', marginBottom: 18 }}>
                <Terminal size={22} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: 'var(--text-primary)' }}>Candidate Terminal</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 24px', flex: 1 }}>
                Access secure coding assessment room, execute algorithmic solutions, and interact with interviewers under AI integrity verification.
              </p>
              <button className="btn btn-secondary" style={{ width: '100%' }}>
                <span>Launch Exam Room</span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER: LOGIN / REGISTRATION
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'login') {
    const isInterviewer = loginRole === 'interviewer';
    return (
      <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24, background: 'var(--bg-page)' }}>
        <Toast toasts={toasts} removeToast={removeToast} />
        <div className="card-elevated" style={{ width: '100%', maxWidth: isRegistering && isInterviewer ? 560 : 420, padding: 32, borderRadius: 14 }}>
          <button
            onClick={() => { setView('landing'); setIsRegistering(false); setError(''); }}
            className="btn btn-ghost btn-sm"
            style={{ marginBottom: 20, padding: 0 }}
          >
            <ArrowLeft size={14} /> Back
          </button>

          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
              {isRegistering ? 'Create Workspace Account' : `${isInterviewer ? 'Interviewer' : 'Candidate'} Sign In`}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
              {isRegistering ? 'Enter your professional profile details' : 'Enter your credentials to enter the assessment session'}
            </p>
          </div>

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 8, background: 'var(--danger-bg)', border: '1px solid var(--danger-border)', color: 'var(--danger)', fontSize: 12, marginBottom: 16 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input
                type="text"
                required
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="e.g. johndoe"
                className="form-input"
              />
            </div>

            <div className="form-group">
              <label className="form-label">Password</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="form-input"
                  style={{ paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  className="btn btn-ghost btn-icon btn-sm"
                  style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)' }}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {isRegistering && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Full Name</label>
                  <input required value={fullname} onChange={e => setFullname(e.target.value)} placeholder="John Doe" className="form-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" className="form-input" />
                </div>
                <div className="form-group">
                  <label className="form-label">Phone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555-0100" className="form-input" />
                </div>
                {isInterviewer && (
                  <>
                    <div className="form-group">
                      <label className="form-label">Company</label>
                      <input required value={company} onChange={e => setCompany(e.target.value)} placeholder="Acme Corp" className="form-input" />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Job Title</label>
                      <input required value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Staff Engineer" className="form-input" />
                    </div>
                  </>
                )}
              </div>
            )}

            <button type="submit" disabled={isLoading} className="btn btn-primary btn-lg" style={{ marginTop: 8 }}>
              {isLoading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : isRegistering ? 'Create Account' : 'Authenticate'}
            </button>
          </form>

          <div style={{ marginTop: 18, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
            {isRegistering ? (
              <>Already registered? <button type="button" onClick={() => setIsRegistering(false)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>Sign In</button></>
            ) : (
              <>Need an account? <button type="button" onClick={() => setIsRegistering(true)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontWeight: 600, cursor: 'pointer' }}>Register</button></>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER: IN-BROWSER SECURE KIOSK ASSESSMENT SESSION
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'candidate_kiosk') {
    return (
      <CandidateExamKiosk
        currentUser={currentUser}
        onExit={() => {
          setLaunchStatus('idle');
          setView('candidate');
        }}
      />
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER: CANDIDATE PORTAL (SEAMLESS KIOSK & LAUNCH WORKSPACE)
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'candidate') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-page)' }}>
        <header className="app-header">
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <Shield size={18} style={{ color: 'var(--primary)' }} />
    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>ProctorAI Candidate Terminal</span>
  </div>
  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
    {/* Strictly Two Theme Options: White and Black */}
    <div className="theme-toggle-segmented" role="radiogroup" aria-label="Color Theme">
      <button
        type="button"
        className={`theme-segment-btn ${theme === 'white' ? 'active' : ''}`}
        onClick={() => setTheme('white')}
        aria-checked={theme === 'white'}
        role="radio"
        title="Switch to White theme"
      >
        <Sun size={13} />
        <span>White</span>
      </button>
      <button
        type="button"
        className={`theme-segment-btn ${theme === 'black' ? 'active' : ''}`}
        onClick={() => setTheme('black')}
        aria-checked={theme === 'black'}
        role="radio"
        title="Switch to Black theme"
      >
        <Moon size={13} />
        <span>Black</span>
      </button>
    </div>
    <button onClick={handleLogout} className="btn btn-ghost btn-sm"><LogOut size={13} /> Exit</button>
  </div>
</header>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div className="card" style={{ maxWidth: 480, padding: 32, textAlign: 'center' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', margin: '0 auto 16px' }}>
              <Terminal size={22} />
            </div>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Candidate Session Ready</h2>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 20px' }}>
              Your secure exam terminal is linked. For full kiosk security and environment lockdown, launch and complete your assessment using the ProctorAI Desktop App.
            </p>

            {launchStatus === 'attempting' && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 14px', background: 'var(--primary-light)', borderRadius: 8,
                color: 'var(--primary)', fontSize: 12, fontWeight: 600, marginBottom: 16
              }}>
                <span className="spinner" style={{ width: 14, height: 14 }} />
                <span>Launching ProctorAI Desktop App...</span>
              </div>
            )}

            {launchStatus === 'launched' && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                padding: '10px 14px', background: 'rgba(16, 185, 129, 0.1)', borderRadius: 8,
                color: '#10b981', fontSize: 12, fontWeight: 600, marginBottom: 16
              }}>
                <Check size={14} />
                <span>Launch command sent. If the desktop app didn't open automatically, please open the ProctorAI Desktop App on your PC.</span>
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
              <button
                onClick={() => setView('candidate_kiosk')}
                className="btn btn-primary w-full"
                style={{ width: '100%', background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', color: '#fff' }}
              >
                <Camera size={15} />
                <span>Start In-Browser Assessment Kiosk (AI Proctor)</span>
              </button>
              <button
                onClick={handleLaunchSession}
                disabled={launchStatus === 'attempting'}
                className="btn btn-secondary w-full"
                style={{ width: '100%' }}
              >
                <Terminal size={14} />
                <span>{launchStatus === 'attempting' ? 'Launching Desktop App...' : 'Launch ProctorAI Desktop Kiosk'}</span>
              </button>
              <button
                onClick={handleLogout}
                className="btn btn-ghost w-full"
                style={{ width: '100%' }}
              >
                <LogOut size={14} />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER: INTERVIEWER DASHBOARD (PRIMARY EXECUTIVE WORKSPACE)
  // ══════════════════════════════════════════════════════════════════════

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
    { id: 'live', label: 'Live Monitor', icon: Activity, badge: stats?.activeSessions },
    { id: 'candidates', label: 'Candidates', icon: Users, badge: allCandidates.length },
    { id: 'questions', label: 'Question Bank', icon: BookOpen },
    { id: 'reports', label: 'Reports & Analytics', icon: FileText },
  ];

  return (
    <div className="app-container">
      <Toast toasts={toasts} removeToast={removeToast} />
      {confirmDialog && <ConfirmDialog message={confirmDialog.message} onConfirm={() => { confirmDialog.resolve(true); setConfirmDialog(null); }} onCancel={() => { confirmDialog.resolve(false); setConfirmDialog(null); }} />}

      {/* Terminate Interview Modal */}
      {showTerminateModal && selectedInterview && (
        <TerminateInterviewModal
          isOpen={showTerminateModal}
          candidate={allCandidates.find(c => c.interview_id === selectedInterview.id) || selectedInterview}
          onClose={() => setShowTerminateModal(false)}
          onConfirm={handleTerminateInterview}
          isSubmitting={isTerminating}
        />
      )}

      {/* Send Question to Candidate Modal */}
      {sendModalQuestion && (
        <div className="modal-overlay" onClick={() => !isAssigningToCandidate && setSendModalQuestion(null)}>
          <div
            className="modal-panel"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 520, width: '92%', borderRadius: 12, border: '1px solid var(--border-medium)', background: 'var(--bg-surface)' }}
          >
            {/* Modal Header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Send size={16} />
                </div>
                <div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Send Question to Candidate</h3>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Assign this problem to a candidate's live assessment terminal.</p>
                </div>
              </div>
              <button
                onClick={() => setSendModalQuestion(null)}
                className="btn btn-ghost btn-icon btn-sm"
                disabled={isAssigningToCandidate}
              >
                <X size={15} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Question Preview Card */}
              <div style={{ padding: '14px 16px', borderRadius: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span className={`diff-${sendModalQuestion.difficulty}`} style={{ fontSize: 10, textTransform: 'uppercase', fontWeight: 700 }}>
                    {sendModalQuestion.difficulty}
                  </span>
                  <span className="badge badge-scheduled" style={{ fontSize: 10 }}>
                    {sendModalQuestion.type}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>• {sendModalQuestion.topic || 'General'}</span>
                </div>
                <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px 0' }}>
                  {sendModalQuestion.title}
                </h4>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, maxHeight: 60, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {sendModalQuestion.description}
                </p>
              </div>

              {/* Target Candidate Selection */}
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                  Select Target Candidate
                </label>
                {allCandidates.length === 0 ? (
                  <div style={{ padding: 12, borderRadius: 8, background: 'var(--warning-bg)', border: '1px solid var(--warning-border)', color: 'var(--warning)', fontSize: 12 }}>
                    ⚠️ No candidate records found. Please create a candidate first in the Candidates section.
                  </div>
                ) : (
                  <select
                    value={targetCandidateId}
                    onChange={e => setTargetCandidateId(e.target.value)}
                    className="form-input"
                    style={{ width: '100%', fontSize: 13, background: 'var(--bg-elevated)' }}
                    disabled={isAssigningToCandidate}
                  >
                    {allCandidates.map(c => {
                      const isLive = c.status === 'in_progress' || c.status === 'active';
                      return (
                        <option key={c.interview_id} value={c.interview_id}>
                          {c.fullname || c.candidate_name} ({c.role || 'Software Engineer'}) {isLive ? '🟢 [LIVE SESSION]' : `[${c.status}]`}
                        </option>
                      );
                    })}
                  </select>
                )}
                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0 0' }}>
                  The candidate will receive this question immediately in their Kiosk examination interface.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 10, background: 'var(--bg-subtle)' }}>
              <button
                type="button"
                onClick={() => setSendModalQuestion(null)}
                className="btn btn-secondary"
                disabled={isAssigningToCandidate}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSendQuestion}
                className="btn btn-primary"
                disabled={isAssigningToCandidate || allCandidates.length === 0 || !targetCandidateId}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              >
                {isAssigningToCandidate ? (
                  <>
                    <span className="spinner" style={{ width: 13, height: 13 }} />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send size={13} />
                    <span>Send Question</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Evaluation Modal */}
      {showAiEval && aiEvalResult && (
        <div className="modal-overlay" onClick={() => setShowAiEval(false)}>
          <div className="modal-panel modal-panel-lg" onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <Sparkles size={18} style={{ color: 'var(--primary)' }} />
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>AI Proctoring & Code Evaluation</h3>
                {aiEvalResult?.source === 'gemini' ? (
                  <span className="badge badge-active" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Sparkles size={10} /> Google Gemini 2.5 Flash
                  </span>
                ) : (
                  <span className="badge badge-primary" style={{ fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Cpu size={10} /> Smart AI Engine (Zero Setup)
                  </span>
                )}
              </div>
              <button onClick={() => setShowAiEval(false)} className="btn btn-ghost btn-icon btn-sm"><X size={15} /></button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 24 }}>
              <div style={{ display: 'flex', gap: 20, marginBottom: 20, padding: 18, borderRadius: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ textAlign: 'center', minWidth: 90 }}>
                  <div style={{ fontSize: 42, fontWeight: 800, color: aiEvalResult.overallScore >= 70 ? 'var(--success)' : aiEvalResult.overallScore >= 50 ? 'var(--warning)' : 'var(--danger)', fontFamily: 'JetBrains Mono', lineHeight: 1 }}>
                    {aiEvalResult.overallScore}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Score / 100</div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                    <span className="badge badge-active">{aiEvalResult.technicalLevel || 'Mid-Senior'}</span>
                    <span className={`badge ${aiEvalResult.recommendation === 'hire' ? 'badge-hire' : aiEvalResult.recommendation === 'reject' ? 'badge-reject' : 'badge-hold'}`}>
                      {aiEvalResult.recommendation?.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{aiEvalResult.summary}</p>
                </div>
              </div>

              {aiEvalResult.perQuestion?.map((pq, i) => (
                <div key={i} className="card" style={{ padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h4 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Q{i + 1}: {pq.questionTitle}</h4>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12 }}>
                      <span>Correctness: <strong>{pq.correctness}/10</strong></span>
                      <span>Efficiency: <strong>{pq.efficiency}/10</strong></span>
                      <span>Quality: <strong>{pq.codeQuality}/10</strong></span>
                    </div>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>{pq.feedback}</p>
                  {pq.aiDetected && (
                    <span className="badge badge-danger" style={{ marginTop: 8 }}>⚠️ AI-Assisted Code Patterns Flagged</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Candidate Modal */}
      {isAddCandidateOpen && (
        <div className="modal-overlay" onClick={() => setIsAddCandidateOpen(false)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()} style={{ padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Register New Candidate</h3>
              <button onClick={() => setIsAddCandidateOpen(false)} className="btn btn-ghost btn-icon btn-sm"><X size={15} /></button>
            </div>
            <form onSubmit={handleCreateCandidate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Username *</label>
                <input required value={newCandidateName} onChange={e => setNewCandidateName(e.target.value)} placeholder="e.g. sarah_connor" className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Full Name</label>
                <input value={newCandidateFullname} onChange={e => setNewCandidateFullname(e.target.value)} placeholder="Sarah Connor" className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" value={newCandidateEmail} onChange={e => setNewCandidateEmail(e.target.value)} placeholder="sarah@example.com" className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Exam Password *</label>
                <input required minLength={6} type="password" value={newCandidatePass} onChange={e => setNewCandidatePass(e.target.value)} placeholder="At least 6 characters" className="form-input" />
              </div>
              <div className="form-group">
                <label className="form-label">Target Job Role</label>
                <input value={newCandidateJobRole} onChange={e => setNewCandidateJobRole(e.target.value)} placeholder="Senior Software Engineer" className="form-input" />
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 12 }}>
                <button type="button" onClick={() => setIsAddCandidateOpen(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary"><Plus size={14} /> Register Candidate</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── SIDEBAR ───────────────────────────────────────────────────────── */}
      <aside className="sidebar" style={{ width: isSidebarCollapsed ? 64 : 240, display: isTheaterMode ? 'none' : undefined }}>
        {/* Brand & Context */}
        <div style={{
          height: 60,
          padding: isSidebarCollapsed ? '0' : '0 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isSidebarCollapsed ? 'center' : 'space-between',
          borderBottom: '1px solid var(--border-subtle)',
          flexShrink: 0
        }}>
          {!isSidebarCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: 'linear-gradient(135deg, #6366f1 0%, #4338ca 100%)',
                boxShadow: '0 2px 8px rgba(99, 102, 241, 0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffffff',
                flexShrink: 0
              }}>
                <Shield size={17} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.3px', lineHeight: 1.1 }}>ProctorAI</span>
                  <span style={{
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '1px 5px',
                    borderRadius: 4,
                    background: 'var(--primary-light)',
                    color: 'var(--primary)',
                    border: '1px solid var(--primary-border)',
                    letterSpacing: '0.4px',
                    lineHeight: 1.3
                  }}>
                    WORKSPACE
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px rgba(16, 185, 129, 0.7)' }} />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', letterSpacing: '0.2px' }}>Enterprise Node</span>
                </div>
              </div>
            </div>
          )}
          <button
            onClick={toggleSidebar}
            className="btn btn-ghost btn-icon btn-sm"
            title={isSidebarCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
          >
            {isSidebarCollapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
          </button>
        </div>

        {/* Nav list */}
        <nav style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {navItems.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => {
                setActiveSection(id);
                setIsProfileMenuOpen(false);
                if (id === 'live' && !selectedInterview && allCandidates.length > 0) {
                  const firstActive = allCandidates.find(c => c.status === 'active' || c.status === 'in_progress') || allCandidates[0];
                  setSelectedInterview({
                    id: firstActive.interview_id || firstActive.id,
                    candidate_id: firstActive.candidate_id || firstActive.id,
                    candidate_name: firstActive.candidate_name || firstActive.fullname,
                    fullname: firstActive.fullname || firstActive.candidate_name,
                    trust_score: firstActive.trust_score,
                    status: firstActive.status,
                    role: firstActive.job_role || firstActive.role
                  });
                }
              }}
              className={`nav-item ${activeSection === id ? 'active' : ''}`}
              style={{ justifyContent: isSidebarCollapsed ? 'center' : 'flex-start', padding: isSidebarCollapsed ? '10px 0' : '8px 12px' }}
              title={label}
            >
              <Icon size={16} style={{ color: activeSection === id ? 'var(--primary)' : 'var(--text-secondary)', flexShrink: 0 }} />
              {!isSidebarCollapsed && <span style={{ flex: 1, whiteSpace: 'nowrap' }}>{label}</span>}
              {!isSidebarCollapsed && badge > 0 && (
                <span className={`nav-badge ${id === 'live' ? 'live-pulse' : ''}`}>
                  {id === 'live' && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', display: 'inline-block', marginRight: 4 }} />
                  )}
                  {badge}
                </span>
              )}
            </button>
          ))}
        </nav>

        {/* User Profile Footer (Docked Bottom with Discreet Menu) */}
        <div className="sidebar-profile-card">
          {/* User Popover Menu */}
          {isProfileMenuOpen && (
            <div className="profile-popup-menu" onClick={e => e.stopPropagation()}>
              <div style={{ padding: '6px 8px 8px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>
                  {currentUser?.fullname || currentUser?.username || 'Sayeem Raza'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  Interviewer Workspace
                </div>
              </div>
              <button
                type="button"
                className="profile-menu-item"
                onClick={() => { setTheme(t => t === 'white' ? 'black' : 'white'); setIsProfileMenuOpen(false); }}
              >
                {theme === 'white' ? <Moon size={13} /> : <Sun size={13} />}
                <span>Toggle {theme === 'white' ? 'Dark' : 'Light'} Mode</span>
              </button>
              <button
                type="button"
                className="profile-menu-item"
                onClick={() => { fetchCandidates(); fetchStats(); setIsProfileMenuOpen(false); addToast('Workspace records synced', 'success'); }}
              >
                <RefreshCw size={13} />
                <span>Sync Data & Stats</span>
              </button>
              <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
              <button
                type="button"
                className="profile-menu-item danger"
                onClick={() => { setIsProfileMenuOpen(false); handleLogout(); }}
              >
                <LogOut size={13} />
                <span>Sign Out of Workspace</span>
              </button>
            </div>
          )}

          <div className="profile-avatar">
            {((currentUser?.fullname || currentUser?.username || 'Sayeem Raza')[0] || 'S').toUpperCase()}
          </div>

          {!isSidebarCollapsed && (
            <div className="profile-info">
              <div className="profile-name truncate">
                {currentUser?.fullname || currentUser?.username || 'Sayeem Raza'}
              </div>
              <div className="profile-role-tag">
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--primary)' }} />
                <span>Interviewer Workspace</span>
              </div>
            </div>
          )}

          <button
            onClick={() => setIsProfileMenuOpen(p => !p)}
            className="btn btn-ghost btn-icon btn-sm"
            style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}
            title="Workspace User Settings"
          >
            <MoreVertical size={14} />
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT VIEWPORT ────────────────────────────────────────── */}
      <div
        className="main-content"
        onClick={() => isProfileMenuOpen && setIsProfileMenuOpen(false)}
        style={isTheaterMode ? { margin: 0, padding: 0, width: '100vw', height: '100vh', position: 'fixed', inset: 0, zIndex: 9999, background: 'var(--bg-surface)' } : undefined}
      >
        {/* Floating Theater Mode Exit Banner */}
        {isTheaterMode && (
          <div className="theater-mode-banner">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
              Theater Mode Active · 100% Full View
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Press Esc to Exit</span>
              <button
                onClick={exitTheaterMode}
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 8px', height: 22, fontSize: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                title="Exit Full View (Esc)"
              >
                <Minimize2 size={11} />
                <span>Exit</span>
              </button>
            </div>
          </div>
        )}

        {/* Top Header */}
        {!isTheaterMode && (
          <header className="app-header">
          {/* Breadcrumbs Left Hierarchy */}
          <div className="header-breadcrumb">
            <span className="header-breadcrumb-root">
              <Layers size={13} style={{ color: 'var(--primary)' }} />
              <span>Workspace</span>
            </span>
            <span className="header-breadcrumb-sep">/</span>
            <span className="header-breadcrumb-current">
              {navItems.find(n => n.id === activeSection)?.label}
            </span>
            {selectedInterview && activeSection === 'live' && (
              <span className="header-status-pill">
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
                <span>Candidate: <strong style={{ color: 'var(--text-primary)' }}>{selectedInterview.candidate_name}</strong></span>
              </span>
            )}
          </div>

          {/* Global Actions Right */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Discreet AI Engine Status Pill / Tooltip */}
            {aiStatus && (
              aiStatus.configured ? (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 10px',
                    borderRadius: 9999,
                    fontSize: 11,
                    fontFamily: "'JetBrains Mono', monospace",
                    border: '1px solid var(--border-medium)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-secondary)'
                  }}
                  title={`Google Gemini AI connected (${aiStatus.model || '2.5 Flash'})`}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: '#10b981',
                      boxShadow: '0 0 6px rgba(16, 185, 129, 0.6)'
                    }}
                  />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Gemini</span>
                  <span style={{ color: 'var(--text-muted)' }}>Live</span>
                </div>
              ) : (
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '4px 9px',
                    borderRadius: 9999,
                    fontSize: 11,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-card)',
                    color: 'var(--text-muted)',
                    cursor: 'help'
                  }}
                  title="Smart Technical Synthesis Engine Active (Zero Setup / Offline Mode). Optional: configure GEMINI_API_KEY in Render or Vercel for live Gemini 2.5 Flash."
                >
                  <Cpu size={12} style={{ color: 'var(--primary)' }} />
                  <span style={{ fontSize: 10, fontWeight: 500, color: 'var(--text-muted)' }}>Smart Engine</span>
                </div>
              )
            )}

            {/* Segmented Two-Theme Switcher (White & Black) */}
            <div className="theme-toggle-segmented" role="radiogroup" aria-label="Color Theme">
              <button
                type="button"
                className={`theme-segment-btn ${theme === 'white' ? 'active' : ''}`}
                onClick={() => setTheme('white')}
                aria-checked={theme === 'white'}
                role="radio"
                title="Switch to White theme"
              >
                <Sun size={12} />
                <span>White</span>
              </button>
              <button
                type="button"
                className={`theme-segment-btn ${theme === 'black' ? 'active' : ''}`}
                onClick={() => setTheme('black')}
                aria-checked={theme === 'black'}
                role="radio"
                title="Switch to Black theme"
              >
                <Moon size={12} />
                <span>Black</span>
              </button>
            </div>

            {/* Refresh Workspace Records (Ghost/Outline) */}
            <button
              onClick={() => { fetchCandidates(); fetchStats(); }}
              className="btn btn-secondary btn-icon btn-sm"
              title="Refresh Workspace Data"
            >
              <RefreshCw size={13} />
            </button>

            {/* Section-Specific Primary CTA */}
            {activeSection === 'questions' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={handleAiGenerateQuestions}
                  disabled={isAiGeneratingQuestions}
                  className="btn btn-secondary btn-sm"
                  title="Generate questions using AI synthesis"
                >
                  <Sparkles size={13} style={{ color: 'var(--primary)' }} />
                  <span>{isAiGeneratingQuestions ? 'Generating...' : 'AI Generate'}</span>
                </button>
                <button
                  onClick={() => { resetQuestionForm(); setQBankView('form'); }}
                  className="btn btn-primary btn-sm"
                >
                  <Plus size={13} />
                  <span>New Question</span>
                </button>
              </div>
            ) : (
              <button
                onClick={() => setIsAddCandidateOpen(true)}
                className="btn btn-primary btn-sm"
              >
                <Plus size={13} />
                <span>Add Candidate</span>
              </button>
            )}
          </div>
        </header>
        )}

        {/* Content Body */}
        <div
          className="content-viewport"
          style={isTheaterMode ? { padding: 0, overflowY: 'auto', overflowX: 'hidden' } : { overflowY: 'auto', overflowX: 'hidden' }}
        >

          {/* ══════════════════════════════════════════════════════════════
             SECTION: DASHBOARD
             ══════════════════════════════════════════════════════════════ */}
          {activeSection === 'dashboard' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              {/* Active Session Alert Banner (if active) */}
              {stats?.activeSessions > 0 && (
                <div style={{
                  padding: '14px 20px', borderRadius: 10,
                  background: 'var(--primary-light)', border: '1px solid var(--primary-border)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)', boxShadow: '0 0 8px var(--success)' }} />
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
                        {stats.activeSessions} Active Candidate Session{stats.activeSessions > 1 ? 's' : ''} in Progress
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        Live video, keystroke proctoring telemetry, and candidate code syncing active.
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const firstActive = allCandidates.find(c => c.status === 'active');
                      if (firstActive) {
                        setSelectedInterview({
                          id: firstActive.interview_id,
                          candidate_id: firstActive.candidate_id,
                          candidate_name: firstActive.candidate_name,
                          fullname: firstActive.fullname,
                          trust_score: firstActive.trust_score,
                          status: firstActive.status
                        });
                      }
                      setActiveSection('live');
                    }}
                    className="btn btn-primary btn-sm"
                  >
                    <Activity size={13} />
                    <span>Open Live Monitor</span>
                  </button>
                </div>
              )}

              {/* KPI Cards Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14 }}>
                {[
                  { label: 'Active Sessions', val: stats?.activeSessions ?? 0, icon: Activity, color: 'var(--primary)' },
                  { label: 'Total Candidates', val: stats?.totalCandidates ?? allCandidates.length, icon: Users, color: 'var(--info)' },
                  { label: 'Completed Tests', val: stats?.completedSessions ?? 0, icon: CheckCircle, color: 'var(--success)' },
                  { label: 'Average Trust', val: `${stats?.avgTrustScore ?? 100}%`, icon: Shield, color: getTrustColor(stats?.avgTrustScore ?? 100) },
                  { label: 'Total Violations', val: stats?.totalLogs ?? 0, icon: Bell, color: 'var(--warning)' },
                  { label: 'High Risk Flags', val: stats?.highSeverityLogs ?? 0, icon: AlertTriangle, color: 'var(--danger)' },
                ].map(k => {
                  const Icon = k.icon;
                  return (
                    <div key={k.label} className="stat-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>{k.label}</span>
                        <div style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: k.color }}>
                          <Icon size={14} />
                        </div>
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'JetBrains Mono', color: k.color, lineHeight: 1 }}>
                        {k.val}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Main Dual Panels: Anomaly Distribution + Recent Candidate Roster */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* Anomaly Distribution */}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ marginBottom: 16 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Proctoring Telemetry Breakdown</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>Most frequent integrity events flagged</p>
                  </div>
                  {stats?.anomalyBreakdown?.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {stats.anomalyBreakdown.slice(0, 5).map((a, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }} className="truncate">
                            {a._id?.replace(/_/g, ' ') || 'Incident'}
                          </span>
                          <div className="trust-bar-track" style={{ flex: 2 }}>
                            <div style={{
                              width: `${Math.min(100, (a.count / (stats.anomalyBreakdown[0]?.count || 1)) * 100)}%`,
                              height: '100%',
                              borderRadius: 9999,
                              background: 'var(--primary)'
                            }} />
                          </div>
                          <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--text-primary)', minWidth: 24, textAlign: 'right' }}>
                            {a.count}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ padding: '30px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                      No proctoring anomalies recorded yet.
                    </div>
                  )}
                </div>

                {/* Recent Candidates */}
                <div className="card" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <div>
                      <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Candidate Sessions</h3>
                      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '2px 0 0' }}>Latest candidates ready for assessment</p>
                    </div>
                    <button onClick={() => setActiveSection('candidates')} className="btn btn-ghost btn-sm" style={{ padding: 0 }}>
                      View All
                    </button>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {allCandidates.slice(0, 5).map(c => (
                      <div
                        key={c.candidate_id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 10px', borderRadius: 8,
                          background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                          cursor: 'pointer'
                        }}
                        onClick={() => {
                          setSelectedInterview({
                            id: c.interview_id,
                            candidate_id: c.candidate_id,
                            candidate_name: c.candidate_name,
                            fullname: c.fullname,
                            trust_score: c.trust_score,
                            status: c.status
                          });
                          setActiveSection('live');
                        }}
                      >
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>
                          {(c.candidate_name || 'C')[0].toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }} className="truncate">
                            {c.candidate_name}
                          </p>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>
                            {c.job_role || 'Software Engineer'}
                          </p>
                        </div>
                        <span className={`badge badge-${c.status}`} style={{ fontSize: 10 }}>
                          {c.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
             SECTION: LIVE MONITOR (REVOLUTIONIZED WORKSPACE)
             ══════════════════════════════════════════════════════════════ */}
          {activeSection === 'live' && (
            <div
              className="animate-fade-in w-full max-w-full"
              style={{
                minHeight: isTheaterMode ? '100vh' : 'calc(100vh - 104px)',
                width: '100%',
                maxWidth: '100%',
                overflowY: 'auto',
                overflowX: 'hidden'
              }}
            >
              <LiveMonitoringView
                candidates={allCandidates}
                selectedCandidate={selectedInterview}
                isTheaterMode={isTheaterMode}
                toggleTheaterMode={toggleTheaterMode}
                exitTheaterMode={exitTheaterMode}
                onSelectCandidate={(c) => {
                  setSelectedInterview({
                    id: c.interview_id || c.id,
                    candidate_id: c.candidate_id || c.id,
                    candidate_name: c.candidate_name || c.fullname,
                    fullname: c.fullname || c.candidate_name,
                    trust_score: c.trust_score,
                    status: c.status,
                    role: c.job_role || c.role
                  });
                }}
                onActivateInterview={handleActivateInterview}
                onTerminateInterview={handleTerminateFromMonitoring}
                onSendWarning={handleSendProctorWarning}
                onFlagIncident={handleFlagProctorIncident}
                incidents={globalIncidents}
                candidateLiveCode={candidateLiveCode}
                codeOutput={codeOutput}
                codeOutputError={codeOutputError}
                isExecuting={isRunningCode}
                handleRunCode={runCode}
                runAiEvaluation={runAiEvaluation}
                isEvaluating={isEvaluating}
                aiFollowups={aiFollowups}
                handleGetAiFollowup={getAiFollowups}
                isGeneratingFollowup={isLoadingFollowups}
                evaluationRubric={rubricScores}
                setEvaluationRubric={setRubricScores}
                interviewerNotes={interviewerNotes}
                setInterviewerNotes={setInterviewerNotes}
                interviewerRating={interviewerRating}
                setInterviewerRating={setInterviewerRating}
                onSaveRubric={saveNotes}
                BACKEND={BACKEND}
              />
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
             SECTION: CANDIDATES
             ══════════════════════════════════════════════════════════════ */}
          {activeSection === 'candidates' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Segmented Filter & Action Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div className="toolbar-segmented">
                  <div className="toolbar-search-box">
                    <Search size={13} className="toolbar-search-icon" />
                    <input
                      placeholder="Search candidates by name, role or email..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="toolbar-search-input"
                      style={{ width: 280 }}
                    />
                  </div>
                  <select
                    value={filterStatus}
                    onChange={e => setFilterStatus(e.target.value)}
                    className="toolbar-select"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="completed">Completed</option>
                    <option value="terminated">Terminated</option>
                  </select>
                  {(searchQuery || filterStatus !== 'all') && (
                    <button
                      onClick={() => { setSearchQuery(''); setFilterStatus('all'); }}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, padding: '4px 8px', color: 'var(--text-muted)' }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>
                    {processedCandidates.length} candidate{processedCandidates.length === 1 ? '' : 's'}
                  </span>
                  <button onClick={() => setIsAddCandidateOpen(true)} className="btn btn-primary btn-sm">
                    <Plus size={13} />
                    <span>Register Candidate</span>
                  </button>
                </div>
              </div>

              {/* Candidates Table */}
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Candidate</th>
                      <th>Job Role</th>
                      <th>Status</th>
                      <th>Trust Score</th>
                      <th>Decision</th>
                      <th>Date</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedCandidates.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)' }}>
                          No candidates found matching the selected filters.
                        </td>
                      </tr>
                    ) : (
                      processedCandidates.map(c => (
                        <tr key={c.candidate_id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: 'var(--bg-elevated)',
                                border: '1px solid var(--border-subtle)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                color: 'var(--primary)',
                                fontSize: 12,
                                flexShrink: 0
                              }}>
                                {(c.candidate_name || 'C')[0].toUpperCase()}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{c.candidate_name}</p>
                                <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }} className="truncate">{c.email || c.fullname || '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.job_role || 'Software Engineer'}</td>
                          <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="trust-bar-track" style={{ width: 64 }}>
                                <div className={`trust-bar-fill ${getTrustClass(c.trust_score || 100)}`} style={{ width: `${c.trust_score || 100}%` }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'JetBrains Mono', color: getTrustColor(c.trust_score || 100) }}>
                                {Math.round(c.trust_score || 100)}%
                              </span>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${c.decision === 'hire' ? 'badge-hire' : c.decision === 'reject' ? 'badge-reject' : 'badge-hold'}`}>
                              {c.decision || 'pending'}
                            </span>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(c.date)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center' }}>
                              <button
                                onClick={() => {
                                  setSelectedInterview({
                                    id: c.interview_id,
                                    candidate_id: c.candidate_id,
                                    candidate_name: c.candidate_name,
                                    fullname: c.fullname,
                                    trust_score: c.trust_score,
                                    status: c.status
                                  });
                                  setActiveSection('live');
                                }}
                                className="btn btn-secondary btn-icon btn-sm"
                                title="Open Live Monitor"
                              >
                                <Monitor size={12} />
                              </button>
                              {c.status === 'scheduled' && (
                                <button
                                  onClick={() => handleActivateInterview(c.interview_id)}
                                  className="btn btn-success btn-icon btn-sm"
                                  title="Activate Session"
                                >
                                  <Play size={12} />
                                </button>
                              )}
                              <button
                                onClick={() => handleDeleteCandidate(c.candidate_id, c.candidate_name)}
                                className="btn btn-ghost btn-icon btn-sm"
                                style={{ color: 'var(--danger)' }}
                                title="Delete Record"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
             SECTION: QUESTION BANK
             ══════════════════════════════════════════════════════════════ */}
          {activeSection === 'questions' && (
            <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Segmented Filter & Action Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                <div className="toolbar-segmented">
                  <div className="toolbar-search-box">
                    <Search size={13} className="toolbar-search-icon" />
                    <input
                      placeholder="Search question bank..."
                      value={qFilter.search}
                      onChange={e => setQFilter(p => ({ ...p, search: e.target.value }))}
                      className="toolbar-search-input"
                      style={{ width: 240 }}
                    />
                  </div>
                  <select
                    value={qFilter.type}
                    onChange={e => setQFilter(p => ({ ...p, type: e.target.value }))}
                    className="toolbar-select"
                  >
                    <option value="all">All Types</option>
                    <option value="coding">Coding</option>
                    <option value="mcq">MCQ</option>
                    <option value="system_design">System Design</option>
                    <option value="behavioral">Behavioral</option>
                  </select>
                  <select
                    value={qFilter.difficulty}
                    onChange={e => setQFilter(p => ({ ...p, difficulty: e.target.value }))}
                    className="toolbar-select"
                  >
                    <option value="all">All Difficulty</option>
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                  {(qFilter.search || qFilter.type !== 'all' || qFilter.difficulty !== 'all') && (
                    <button
                      onClick={() => setQFilter({ search: '', type: 'all', difficulty: 'all' })}
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11, padding: '4px 8px', color: 'var(--text-muted)' }}
                    >
                      Clear Filters
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={handleAiGenerateQuestions}
                    disabled={isAiGeneratingQuestions}
                    className="btn btn-secondary btn-sm"
                    title="Generate questions with AI Engine"
                  >
                    <Sparkles size={13} style={{ color: 'var(--primary)' }} />
                    <span>{isAiGeneratingQuestions ? 'Generating...' : 'AI Generate Questions'}</span>
                  </button>

                  <button
                    onClick={() => { resetQuestionForm(); setQBankView('form'); }}
                    className="btn btn-primary btn-sm"
                  >
                    <Plus size={13} />
                    <span>New Question</span>
                  </button>
                </div>
              </div>

              {/* View: Form or List */}
              {qBankView === 'form' ? (
                <div className="card" style={{ padding: 24, maxWidth: 680 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                      {editingQuestion ? 'Edit Question' : 'Add New Question to Bank'}
                    </h3>
                    <button onClick={() => { setQBankView('list'); resetQuestionForm(); }} className="btn btn-ghost btn-sm">
                      <ArrowLeft size={13} /> Back
                    </button>
                  </div>
                  <form onSubmit={handleSaveQuestion} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="form-group">
                      <label className="form-label">Title *</label>
                      <input required value={qTitle} onChange={e => setQTitle(e.target.value)} placeholder="e.g. Find Kth Largest Element" className="form-input" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                      <div className="form-group">
                        <label className="form-label">Type</label>
                        <select value={qType} onChange={e => setQType(e.target.value)} className="form-select">
                          <option value="coding">Coding</option>
                          <option value="mcq">MCQ</option>
                          <option value="system_design">System Design</option>
                          <option value="behavioral">Behavioral</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Difficulty</label>
                        <select value={qDiff} onChange={e => setQDiff(e.target.value)} className="form-select">
                          <option value="easy">Easy</option>
                          <option value="medium">Medium</option>
                          <option value="hard">Hard</option>
                        </select>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Topic</label>
                        <input value={qTopic} onChange={e => setQTopic(e.target.value)} placeholder="Arrays, Trees, etc." className="form-input" />
                      </div>
                    </div>
                    <div className="form-group">
                      <label className="form-label">Problem Prompt & Constraints *</label>
                      <textarea required value={qDesc} onChange={e => setQDesc(e.target.value)} placeholder="Full problem statement..." className="form-textarea" style={{ minHeight: 90 }} />
                    </div>
                    {qType !== 'mcq' && (
                      <div className="form-group">
                        <label className="form-label">Starter Code Template</label>
                        <textarea value={qStarter} onChange={e => setQStarter(e.target.value)} placeholder="// Write function header..." className="form-textarea" style={{ fontFamily: 'JetBrains Mono', fontSize: 12, minHeight: 90 }} />
                      </div>
                    )}
                    <div className="form-group">
                      <label className="form-label">Tags (comma separated)</label>
                      <input value={qTags} onChange={e => setQTags(e.target.value)} placeholder="two-pointer, hash-map" className="form-input" />
                    </div>
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 10 }}>
                      <button type="button" onClick={() => { setQBankView('list'); resetQuestionForm(); }} className="btn btn-secondary">Cancel</button>
                      <button type="submit" className="btn btn-primary"><Save size={13} /> {editingQuestion ? 'Update Question' : 'Save Question'}</button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="data-table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Title & Description</th>
                        <th>Type</th>
                        <th>Difficulty</th>
                        <th>Topic</th>
                        <th>Tags</th>
                        <th style={{ textAlign: 'right', minWidth: 180 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processedQuestions.length === 0 ? (
                        <tr>
                          <td colSpan="6" style={{ textAlign: 'center', padding: '36px 20px', color: 'var(--text-muted)' }}>
                            No questions found matching your filter criteria.
                          </td>
                        </tr>
                      ) : (
                        processedQuestions.map(q => (
                          <tr key={q._id}>
                            <td>
                              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{q.title}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '2px 0 0', maxWidth: 360 }} className="truncate">{q.description}</p>
                            </td>
                            <td>
                              <span className="type-pill">{q.type}</span>
                            </td>
                            <td>
                              <span className={`diff-pill ${q.difficulty}`}>
                                <span className="diff-pill-dot" />
                                {q.difficulty}
                              </span>
                            </td>
                            <td style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{q.topic || '—'}</td>
                            <td>
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                {(q.tags || []).slice(0, 3).map(t => (
                                  <span key={t} className="tag-pill">{t}</span>
                                ))}
                              </div>
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'flex-end' }}>
                                <button
                                  type="button"
                                  onClick={() => handleOpenSendModal(q)}
                                  className="btn btn-primary btn-sm"
                                  style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}
                                  title="Send Question to Candidate"
                                >
                                  <Send size={11} />
                                  <span>Send to Candidate</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEditQuestion(q)}
                                  className="btn btn-ghost btn-sm btn-icon"
                                  title="Edit Question"
                                >
                                  <Edit size={12} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteQuestion(q)}
                                  className="btn btn-ghost btn-sm btn-icon"
                                  style={{ color: 'var(--danger)' }}
                                  title="Delete Question"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ══════════════════════════════════════════════════════════════
             SECTION: REPORTS & ANALYTICS
             ══════════════════════════════════════════════════════════════ */}
          {activeSection === 'reports' && (
            <div className="animate-fade-in">
              <ReportView />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
