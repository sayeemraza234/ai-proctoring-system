import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Shield, Users, Activity, LogOut, Key, User, Plus, Trash2, Edit, Search,
  CheckCircle, XCircle, AlertTriangle, Play, FileText, Lock, RefreshCw,
  Briefcase, Mail, Phone, Building, Award, ChevronRight, Clock, Eye, EyeOff,
  Camera, Wifi, WifiOff, BarChart2, Calendar, MessageSquare, BookOpen,
  Zap, Star, TrendingUp, TrendingDown, Settings, Database, ChevronDown,
  ChevronUp, Code, Terminal, Cpu, Monitor, Download, Filter, X, Check,
  Send, Bell, HelpCircle, Layers, Target, Brain, Save, Video, Mic,
  MicOff, Volume2, VolumeX, Share2, Flag, Hash, ArrowLeft, PlusCircle,
  AlertCircle, Info, MoreVertical, ExternalLink, Copy, Clipboard
} from 'lucide-react';
import LiveStream from './components/LiveStream';
import AlertsPanel from './components/AlertsPanel';
import ReportView from './components/ReportView';
import { io } from 'socket.io-client';
import SimplePeer from 'simple-peer';

const BACKEND = (() => {
  const host = window.location.hostname;
  if (host === 'localhost' || host === '127.0.0.1') return 'http://127.0.0.1:5000';
  if (host.includes('loca.lt')) return `https://${host.replace('.loca.lt', '-api.loca.lt')}`;
  return 'http://127.0.0.1:5000';
})();

// ── Utilities ────────────────────────────────────────────────────────────────
const getTrustColor = (score) => score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
const getTrustClass = (score) => score >= 80 ? 'trust-high' : score >= 50 ? 'trust-medium' : 'trust-low';
const getTrustLabel = (score) => score >= 80 ? 'Excellent' : score >= 50 ? 'Moderate' : 'Critical';
const formatDuration = (secs) => {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
};
const formatTimer = (secs) => {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h > 0 ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}` : `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
};
const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// ── Toast Notification ────────────────────────────────────────────────────────
function Toast({ toasts, removeToast }) {
  return (
    <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380 }}>
      {toasts.map(t => (
        <div key={t.id} className="toast animate-slide-up" style={{
          background: t.type === 'error' ? 'rgba(127,29,29,0.95)' : t.type === 'success' ? 'rgba(5,46,22,0.95)' : t.type === 'warning' ? 'rgba(78,52,0,0.95)' : 'rgba(9,21,38,0.95)',
          border: `1px solid ${t.type === 'error' ? 'rgba(239,68,68,0.4)' : t.type === 'success' ? 'rgba(34,197,94,0.35)' : t.type === 'warning' ? 'rgba(245,158,11,0.35)' : 'rgba(99,102,241,0.3)'}`,
        }}>
          {t.type === 'error' ? <AlertCircle size={16} style={{ color: '#f87171', flexShrink: 0 }} /> :
           t.type === 'success' ? <CheckCircle size={16} style={{ color: '#4ade80', flexShrink: 0 }} /> :
           t.type === 'warning' ? <AlertTriangle size={16} style={{ color: '#fbbf24', flexShrink: 0 }} /> :
           <Bell size={16} style={{ color: '#818cf8', flexShrink: 0 }} />}
          <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{t.message}</span>
          <button onClick={() => removeToast(t.id)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: 2 }}><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}

// ── Confirm Dialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div className="modal-overlay">
      <div className="modal-panel" style={{ maxWidth: 400, padding: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, textAlign: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
            <AlertTriangle size={22} style={{ color: 'var(--danger)' }} />
          </div>
          <div>
            <h3 className="text-serif" style={{ fontSize: 18, marginBottom: 8 }}>Confirm Action</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-ghost w-full" onClick={onCancel}>Cancel</button>
            <button className="btn btn-danger w-full" onClick={onConfirm}>Confirm</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
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

  // Toast system
  const [toasts, setToasts] = useState([]);
  const addToast = useCallback((message, type = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);
  const removeToast = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  // Confirm dialog
  const [confirmDialog, setConfirmDialog] = useState(null);
  const showConfirm = (message) => new Promise(resolve => {
    setConfirmDialog({ message, resolve });
  });

  // Interviewer states
  const [activeSection, setActiveSection] = useState('dashboard');
  const [allCandidates, setAllCandidates] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [sortBy, setSortBy] = useState('date');
  const [selectedInterview, setSelectedInterview] = useState(null);
  const [isAddCandidateOpen, setIsAddCandidateOpen] = useState(false);
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [dbViewerData, setDbViewerData] = useState(null);
  const [dbViewerTab, setDbViewerTab] = useState('users');

  // Candidate states
  const [interviewStarted, setInterviewStarted] = useState(false);
  const [candidateCameraActive, setCandidateCameraActive] = useState(false);
  const [candidateLocalStream, setCandidateLocalStream] = useState(null);
  const [candidateWarnings, setCandidateWarnings] = useState([]);
  const [activeQuestionIdx, setActiveQuestionIdx] = useState(0);
  const [codeAnswers, setCodeAnswers] = useState({});
  const [mcqAnswers, setMcqAnswers] = useState({});
  const [examTimeElapsed, setExamTimeElapsed] = useState(0);
  const [examDuration, setExamDuration] = useState(5400); // 90 min default
  const [authPassword, setAuthPassword] = useState('');
  const [isLaunchingTerminal, setIsLaunchingTerminal] = useState(false);
  const [isInterviewerStreaming, setIsInterviewerStreaming] = useState(false);
  const [isRunningCode, setIsRunningCode] = useState(false);
  const [codeOutput, setCodeOutput] = useState(null);
  const [codeOutputError, setCodeOutputError] = useState(false);
  const [systemCheckStep, setSystemCheckStep] = useState('idle'); // idle, running, done
  const [systemChecks, setSystemChecks] = useState({ camera: null, browser: null, network: null });
  const [interviewQuestions, setInterviewQuestions] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState('javascript');
  const [interviewerNotes, setInterviewerNotes] = useState('');
  const [interviewerRating, setInterviewerRating] = useState(0);
  const [decision, setDecision] = useState('pending');
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [aiEvalResult, setAiEvalResult] = useState(null);
  const [showAiEval, setShowAiEval] = useState(false);

  // Live question form state
  const [liveQuestionTitle, setLiveQuestionTitle] = useState('');
  const [liveQuestionDesc, setLiveQuestionDesc] = useState('');
  const [liveQuestionType, setLiveQuestionType] = useState('coding');
  const [liveQuestionDifficulty, setLiveQuestionDifficulty] = useState('medium');
  const [isSendingQuestion, setIsSendingQuestion] = useState(false);

  // Add candidate form
  const [newCandidateName, setNewCandidateName] = useState('');
  const [newCandidateFullname, setNewCandidateFullname] = useState('');
  const [newCandidateEmail, setNewCandidateEmail] = useState('');
  const [newCandidatePass, setNewCandidatePass] = useState('');
  const [newCandidateJobRole, setNewCandidateJobRole] = useState('Software Engineer');

  // Schedule form
  const [schedJobRole, setSchedJobRole] = useState('Software Engineer');
  const [schedJobLevel, setSchedJobLevel] = useState('mid');
  const [schedCandidateId, setSchedCandidateId] = useState('');
  const [schedDuration, setSchedDuration] = useState(90);
  const [schedSelectedQs, setSchedSelectedQs] = useState([]);
  const [schedNotes, setSchedNotes] = useState('');

  // Question form
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

  const candidateVideoRef = useRef(null);
  const interviewerVideoRef = useRef(null);
  const signalingSocketRef = useRef(null);
  const proctorSocketRef = useRef(null);
  const chatSocketRef = useRef(null);
  const peerRef = useRef(null);
  const examTimerRef = useRef(null);
  const notesTimerRef = useRef(null);

  // ── API Helpers ────────────────────────────────────────────────────────────
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

  useEffect(() => {
    if (view === 'interviewer') {
      fetchCandidates();
      fetchStats();
      fetchQuestions();
      const interval = setInterval(() => { fetchCandidates(); fetchStats(); }, 10000);
      return () => clearInterval(interval);
    }
  }, [view]);

  useEffect(() => {
    if (view === 'interviewer' && activeSection === 'questions') fetchQuestions();
  }, [qFilter, activeSection]);

  // Connect proctor socket for interviewer when monitoring a candidate
  useEffect(() => {
    if (view === 'interviewer' && selectedInterview?.id) {
      if (proctorSocketRef.current) {
        proctorSocketRef.current.disconnect();
      }
      const pSock = io(`${BACKEND}/proctor`);
      proctorSocketRef.current = pSock;
      
      pSock.on('connect', () => {
        pSock.emit('join_room', String(selectedInterview.id));
        console.log('[PROCTOR] Interviewer joined room:', selectedInterview.id);
      });

      return () => {
        pSock.disconnect();
        proctorSocketRef.current = null;
      };
    }
  }, [view, selectedInterview?.id]);

  // ── Auth ───────────────────────────────────────────────────────────────────
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
        if (!res.ok) { setError('Invalid credentials. Please verify your username and password.'); setIsLoading(false); return; }
        const user = await res.json();
        if (user.role !== loginRole) { setError(`This account is registered as a ${user.role}.`); setIsLoading(false); return; }
        completeLogin(user);
      }
    } catch { setError('Cannot connect to server. Ensure backend is running on port 5000.'); }
    setIsLoading(false);
  };

  const completeLogin = (user) => {
    setCurrentUser(user);
    setAuthPassword(password);
    if (user.role === 'candidate' && user.questions?.length > 0) {
      setInterviewQuestions(user.questions);
      setExamDuration((user.questions.length * 30) * 60);
    }
    setView(user.role);
    setUsername(''); setPassword('');
    resetForms();
  };

  const resetForms = () => {
    setFullname(''); setEmail(''); setPhone(''); setCompany(''); setJobTitle(''); setDepartment(''); setLinkedIn('');
    setIsRegistering(false);
  };

  const handleLogout = () => {
    setCurrentUser(null); setView('landing'); setSelectedInterview(null);
    setInterviewStarted(false); setExamTimeElapsed(0); setActiveSection('dashboard');
    if (examTimerRef.current) clearInterval(examTimerRef.current);
    if (signalingSocketRef.current) signalingSocketRef.current.disconnect();
    if (proctorSocketRef.current) proctorSocketRef.current.disconnect();
    if (chatSocketRef.current) chatSocketRef.current.disconnect();
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    if (candidateLocalStream) { candidateLocalStream.getTracks().forEach(t => t.stop()); setCandidateLocalStream(null); }
    if (window._cleanupSecurity) window._cleanupSecurity();
  };

  // ── Candidate CRUD ─────────────────────────────────────────────────────────
  const handleCreateCandidate = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${BACKEND}/api/candidates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: newCandidateName, password: newCandidatePass || 'pass', fullname: newCandidateFullname, email: newCandidateEmail })
      });
      if (!res.ok) { const d = await res.json(); addToast(d.error || 'Failed to create candidate', 'error'); return; }
      const candidate = await res.json();
      addToast(`Candidate ${newCandidateName} created`, 'success');

      // Auto-create interview for them
      if (schedSelectedQs.length > 0 || newCandidateJobRole) {
        await fetch(`${BACKEND}/api/interviews`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidateId: candidate._id || candidate.id,
            interviewerId: currentUser?._id,
            jobRole: newCandidateJobRole,
            questionIds: schedSelectedQs
          })
        });
      } else {
        await fetch(`${BACKEND}/api/interviews`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ candidateId: candidate._id || candidate.id, interviewerId: currentUser?._id, jobRole: newCandidateJobRole, status: 'active' })
        });
      }
      setIsAddCandidateOpen(false);
      setNewCandidateName(''); setNewCandidateFullname(''); setNewCandidateEmail(''); setNewCandidatePass('');
      fetchCandidates();
    } catch (err) { addToast('Server error', 'error'); }
  };

  const handleDeleteCandidate = async (id, name) => {
    const ok = await showConfirm(`Delete candidate "${name}" and all their proctoring records? This cannot be undone.`);
    if (!ok) return;
    const res = await fetch(`${BACKEND}/api/candidates/${id}`, { method: 'DELETE' });
    if (res.ok) { addToast('Candidate deleted', 'success'); fetchCandidates(); if (selectedInterview?.candidate_id === id) setSelectedInterview(null); }
  };

  const handleActivateInterview = async (interviewId) => {
    const res = await fetch(`${BACKEND}/api/interviews/${interviewId}/activate`, { method: 'POST' });
    if (res.ok) { addToast('Interview activated', 'success'); fetchCandidates(); }
    else addToast('Failed to activate', 'error');
  };

  // ── Save Notes (auto-debounced) ────────────────────────────────────────────
  const saveNotes = async () => {
    if (!selectedInterview?.id) return;
    setIsSavingNotes(true);
    await fetch(`${BACKEND}/api/interviews/${selectedInterview.id}/notes`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ interviewerNotes, interviewerRating, decision })
    });
    setIsSavingNotes(false);
  };

  useEffect(() => {
    if (!selectedInterview?.id) return;
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(saveNotes, 1500);
    return () => clearTimeout(notesTimerRef.current);
  }, [interviewerNotes, interviewerRating, decision]);

  // ── AI Evaluation ──────────────────────────────────────────────────────────
  const runAiEvaluation = async () => {
    if (!selectedInterview?.id) return;
    setIsEvaluating(true);
    try {
      // Get interview details to get submissions
      const interviewRes = await fetch(`${BACKEND}/api/interviews/${selectedInterview.id}`);
      const interview = await interviewRes.json();
      const submissions = JSON.parse(interview.codeSubmissions || '{}');
      const qList = interview.questions || [];

      const res = await fetch(`${BACKEND}/api/ai/evaluate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          interviewId: selectedInterview.id,
          submissions: qList.map((q, i) => submissions[i] || submissions[q._id] || ''),
          questions: qList.map(q => ({ title: q.title, description: q.description, difficulty: q.difficulty, topic: q.topic }))
        })
      });
      const data = await res.json();
      if (data.success) {
        setAiEvalResult(data.evaluation);
        setShowAiEval(true);
        addToast('AI evaluation complete!', 'success');
      } else {
        addToast(data.message || 'AI evaluation failed — check your Gemini API key', 'warning');
      }
    } catch { addToast('Evaluation error', 'error'); }
    setIsEvaluating(false);
  };

  const handleSendLiveQuestion = async () => {
    if (!selectedInterview?.id || !liveQuestionTitle.trim() || !liveQuestionDesc.trim()) return;
    setIsSendingQuestion(true);
    try {
      const res = await fetch(`${BACKEND}/api/interviews/${selectedInterview.id}/ask-question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: liveQuestionTitle,
          description: liveQuestionDesc,
          type: liveQuestionType,
          difficulty: liveQuestionDifficulty,
          topic: 'General'
        })
      });
      const data = await res.json();
      if (res.ok) {
        if (proctorSocketRef.current) {
          proctorSocketRef.current.emit('assign_question', {
            roomId: selectedInterview.id,
            question: data.question
          });
        }
        addToast('Question sent to candidate!', 'success');
        setLiveQuestionTitle('');
        setLiveQuestionDesc('');
        setLiveQuestionType('coding');
        setLiveQuestionDifficulty('medium');
      } else {
        addToast(data.error || 'Failed to send question', 'error');
      }
    } catch {
      addToast('Error sending question', 'error');
    } finally {
      setIsSendingQuestion(false);
    }
  };

  // ── Question CRUD ──────────────────────────────────────────────────────────
  const handleSaveQuestion = async (e) => {
    e.preventDefault();
    const body = {
      title: qTitle, description: qDesc, type: qType, difficulty: qDiff,
      topic: qTopic, starterCode: qStarter,
      tags: qTags.split(',').map(t => t.trim()).filter(Boolean),
      language: selectedLanguage, createdBy: currentUser?._id
    };
    try {
      let res;
      if (editingQuestion) {
        res = await fetch(`${BACKEND}/api/questions/${editingQuestion._id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        addToast('Question updated', 'success');
      } else {
        res = await fetch(`${BACKEND}/api/questions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        addToast('Question added to bank', 'success');
      }
      if (res.ok) { fetchQuestions(); resetQuestionForm(); setQBankView('list'); }
    } catch { addToast('Error saving question', 'error'); }
  };

  const handleDeleteQuestion = async (q) => {
    const ok = await showConfirm(`Delete question "${q.title}"?`);
    if (!ok) return;
    await fetch(`${BACKEND}/api/questions/${q._id}`, { method: 'DELETE' });
    addToast('Question deleted', 'success');
    fetchQuestions();
  };

  const resetQuestionForm = () => {
    setQTitle(''); setQDesc(''); setQType('coding'); setQDiff('medium'); setQTopic(''); setQStarter(''); setQTags('');
    setEditingQuestion(null);
  };

  const editQuestion = (q) => {
    setEditingQuestion(q);
    setQTitle(q.title); setQDesc(q.description); setQType(q.type); setQDiff(q.difficulty);
    setQTopic(q.topic); setQStarter(q.starterCode || ''); setQTags((q.tags || []).join(', '));
    setQBankView('form');
  };

  // ── Webcam ─────────────────────────────────────────────────────────────────
  const initCandidateWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
      setCandidateLocalStream(stream);
      setTimeout(() => {
        if (candidateVideoRef.current) {
          candidateVideoRef.current.srcObject = stream;
          candidateVideoRef.current.onloadedmetadata = () => candidateVideoRef.current.play().catch(console.error);
        }
      }, 100);
      setCandidateCameraActive(true);
      return stream;
    } catch (err) {
      console.error('Webcam error:', err);
      setCandidateCameraActive(false);
      return null;
    }
  };

  const sendAnomalyAlert = useCallback((event, severity, details = '') => {
    const interviewId = currentUser?.interview_id || currentUser?.interviewId;
    if (proctorSocketRef.current) {
      if (interviewId) {
        proctorSocketRef.current.emit('anomaly_alert', { roomId: interviewId, event, severity, confidence: 1.0, details });
      }
    }
    const labels = {
      'no_face': '⚠ Face not detected in frame',
      'multiple_faces': '🔴 Multiple faces detected',
      'off_screen_gaze': '👁 Looking off-screen',
      'window_switch_attempt': '🔴 Tab / Window switch detected',
      'paste_detected': '⚠ Paste detected in editor',
      'rapid_paste': '🔴 Suspicious paste / code injection',
    };
    setCandidateWarnings(prev => [{ id: Date.now(), msg: labels[event] || event, time: new Date().toLocaleTimeString(), severity }, ...prev].slice(0, 20));
  }, [currentUser]);

  // ── Code Execution ─────────────────────────────────────────────────────────
  const runCode = async () => {
    if (!interviewQuestions[activeQuestionIdx]) return;
    const code = codeAnswers[activeQuestionIdx] || '';
    if (!code.trim()) { addToast('Write some code first!', 'warning'); return; }
    setIsRunningCode(true);
    setCodeOutput(null); setCodeOutputError(false);
    try {
      const res = await fetch(`${BACKEND}/api/run-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, language: selectedLanguage, stdin: '' })
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setCodeOutput(data.error || 'Code execution failed'); setCodeOutputError(true);
      } else if (data.stderr && data.stderr.trim()) {
        setCodeOutput(data.stderr); setCodeOutputError(true);
      } else {
        setCodeOutput(data.stdout || '(No output)'); setCodeOutputError(false);
      }
    } catch { setCodeOutput('Error connecting to execution engine'); setCodeOutputError(true); }
    setIsRunningCode(false);
  };

  // ── System Check ───────────────────────────────────────────────────────────
  // ── System Check ───────────────────────────────────────────────────────────
  const runSystemCheck = async () => {
    setSystemCheckStep('running');
    setSystemChecks({ camera: 'checking', microphone: 'checking', browser: 'checking', network: 'checking' });

    // 1. Camera check + live stream preview
    try {
      const vStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }
      });
      setCandidateLocalStream(vStream);
      setSystemChecks(prev => ({ ...prev, camera: 'pass' }));
    } catch {
      setSystemChecks(prev => ({ ...prev, camera: 'fail' }));
    }

    // 2. Microphone check
    try {
      const aStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      aStream.getTracks().forEach(t => t.stop());
      setSystemChecks(prev => ({ ...prev, microphone: 'pass' }));
    } catch {
      setSystemChecks(prev => ({ ...prev, microphone: 'fail' }));
    }

    // 3. Browser check
    setTimeout(() => {
      const isChrome = /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor);
      const isEdge = /Edg/.test(navigator.userAgent);
      setSystemChecks(prev => ({ ...prev, browser: isChrome || isEdge ? 'pass' : 'warn' }));
    }, 400);

    // 4. Network check
    try {
      const start = Date.now();
      await fetch(`${BACKEND}/`, { method: 'GET' });
      const latency = Date.now() - start;
      setSystemChecks(prev => ({ ...prev, network: latency < 1000 ? 'pass' : 'warn' }));
    } catch {
      setSystemChecks(prev => ({ ...prev, network: 'fail' }));
    }

    setSystemCheckStep('done');
  };

  // ── Start Interview Session & Launch Electron Kiosk ───────────────────────
  const startInterviewSession = async (userObj = null) => {
    const activeUser = userObj || currentUser;
    const interviewId = activeUser?.interview_id || activeUser?.interviewId;
    if (!interviewId) {
      addToast('No interview session is assigned to this candidate.', 'error');
      return;
    }

    // In web browser: Launch the secure Electron Terminal via Backend API
    if (!window.electronAPI) {
      setIsLaunchingTerminal(true);
      try {
        const res = await fetch(`${BACKEND}/api/launch-electron`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: activeUser?.username || '',
            interviewId: String(interviewId)
          })
        });
        const data = await res.json();
        if (data.success) {
          addToast('Secure Exam Terminal launched! Check your desktop.', 'success');
        } else {
          // Secondary fallback to OS protocol
          window.location.href = `proctorai://start-exam?username=${encodeURIComponent(activeUser?.username || '')}&host=${encodeURIComponent(window.location.origin)}`;
        }
      } catch (err) {
        console.warn('Backend spawn error, trying protocol:', err);
        window.location.href = `proctorai://start-exam?username=${encodeURIComponent(activeUser?.username || '')}&host=${encodeURIComponent(window.location.origin)}`;
      }
      return;
    }

    setInterviewStarted(true);
    const activeStream = await initCandidateWebcam();

    const sigSock = io(`${BACKEND}/signaling`);
    signalingSocketRef.current = sigSock;
    const proctSock = io(`${BACKEND}/proctor`);
    proctorSocketRef.current = proctSock;
    const chatSock = io(`${BACKEND}/chat`);
    chatSocketRef.current = chatSock;

    sigSock.emit('join_room', String(interviewId));
    proctSock.emit('join_room', String(interviewId));
    chatSock.emit('join_room', String(interviewId));

    proctSock.on('question_assigned', (question) => {
      setInterviewQuestions(prev => {
        if (prev.some(q => q._id === question._id)) return prev;
        return [...prev, question];
      });
    });

    chatSock.on('new_message', (msg) => {
      setChatMessages(prev => [...prev, msg]);
    });

    examTimerRef.current = setInterval(() => {
      setExamTimeElapsed(t => {
        if (t + 1 >= examDuration) { endInterviewSession(); return t; }
        if ((examDuration - (t + 1)) === 300) addToast('⏰ 5 minutes remaining!', 'warning');
        return t + 1;
      });
    }, 1000);

    // WebRTC
    if (activeStream) {
      let peerStarted = false;
      const createPeer = (initiator) => {
        if (peerStarted) return;
        peerStarted = true;
        if (peerRef.current) peerRef.current.destroy();
        const peer = new SimplePeer({ initiator, stream: activeStream, trickle: false });
        peer.on('signal', data => sigSock.emit(initiator ? 'offer' : 'answer', { roomId: String(interviewId), signal: data }));
        peer.on('error', console.error);
        peer.on('stream', remoteStream => {
          setIsInterviewerStreaming(true);
          if (interviewerVideoRef.current) {
            interviewerVideoRef.current.srcObject = remoteStream;
            interviewerVideoRef.current.play().catch(console.error);
          }
        });
        peerRef.current = peer;
      };
      // Candidates initiate the call; interviewers answer the offer in LiveStream.
      // Start when either side is already present or joins after us.
      sigSock.on('user_joined', () => createPeer(true));
      sigSock.on('peer_present', () => createPeer(true));
      sigSock.on('offer', data => {
        if (peerStarted) return;
        const peer = new SimplePeer({ initiator: false, stream: activeStream, trickle: false });
        peer.on('signal', d => sigSock.emit('answer', { roomId: String(interviewId), signal: d }));
        peer.on('stream', remoteStream => {
          setIsInterviewerStreaming(true);
          if (interviewerVideoRef.current) { interviewerVideoRef.current.srcObject = remoteStream; interviewerVideoRef.current.play().catch(console.error); }
        });
        peer.signal(data.signal);
        peerRef.current = peer;
      });
      sigSock.on('answer', data => { if (peerRef.current) peerRef.current.signal(data.signal); });
    }

    if (window.electronAPI) {
      window.electronAPI.startAiEngine({ mock: false });
      window.electronAPI.onAiLog(log => {
        if (log.severity) { proctSock.emit('anomaly_alert', { roomId: String(interviewId), event: log.event, severity: log.severity, confidence: log.confidence || 1.0 }); }
      });
    }

    // Anti-cheat listeners
    let lastPasteTime = 0;
    const blockCopyPaste = (e) => {
      e.preventDefault();
      const now = Date.now();
      const severity = now - lastPasteTime < 2000 ? 'high' : 'medium';
      sendAnomalyAlert(severity === 'high' ? 'rapid_paste' : 'paste_detected', severity);
      lastPasteTime = now;
    };
    const blockCtx = (e) => e.preventDefault();
    const handleVisibility = () => { if (document.hidden) sendAnomalyAlert('window_switch_attempt', 'high'); };
    document.addEventListener('copy', blockCopyPaste);
    document.addEventListener('paste', blockCopyPaste);
    document.addEventListener('contextmenu', blockCtx);
    document.addEventListener('visibilitychange', handleVisibility);
    window._cleanupSecurity = () => {
      document.removeEventListener('copy', blockCopyPaste);
      document.removeEventListener('paste', blockCopyPaste);
      document.removeEventListener('contextmenu', blockCtx);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  };

  // ── End Interview ──────────────────────────────────────────────────────────
  const endInterviewSession = async () => {
    const interviewId = currentUser?.interview_id || currentUser?.interviewId;
    try {
      if (interviewId) await fetch(`${BACKEND}/api/interviews/${interviewId}/end`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeAnswers, mcqAnswers })
      });
    } catch {}
    if (window._cleanupSecurity) window._cleanupSecurity();
    if (examTimerRef.current) clearInterval(examTimerRef.current);
    if (peerRef.current) { peerRef.current.destroy(); peerRef.current = null; }
    if (candidateLocalStream) { candidateLocalStream.getTracks().forEach(t => t.stop()); setCandidateLocalStream(null); }
    setCandidateCameraActive(false); setInterviewStarted(false);
    if (window.electronAPI) window.electronAPI.endInterview();
    handleLogout();
  };

  // Filtered candidates
  const processedCandidates = allCandidates
    .filter(c => {
      const name = (c.candidate_name || '').toLowerCase() + (c.fullname || '').toLowerCase();
      const matchSearch = name.includes(searchQuery.toLowerCase());
      return filterStatus === 'all' ? matchSearch : matchSearch && c.status === filterStatus;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return (a.candidate_name || '').localeCompare(b.candidate_name || '');
      if (sortBy === 'score') return (b.trust_score || 0) - (a.trust_score || 0);
      return new Date(b.date || 0) - new Date(a.date || 0);
    });

  // Filtered questions
  const processedQuestions = questions.filter(q => {
    if (qFilter.type !== 'all' && q.type !== qFilter.type) return false;
    if (qFilter.difficulty !== 'all' && q.difficulty !== qFilter.difficulty) return false;
    if (qFilter.search && !q.title.toLowerCase().includes(qFilter.search.toLowerCase())) return false;
    return true;
  });

  // ══════════════════════════════════════════════════════════════════════
  // RENDER: LANDING PAGE
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'landing') {
    return (
      <>
        <Toast toasts={toasts} removeToast={removeToast} />
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '48px 24px', position: 'relative', overflow: 'hidden' }}>
          {/* Decorative blobs */}
          <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(22,45,82,0.35) 0%, transparent 70%)', pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

          <div className="animate-slide-up" style={{ maxWidth: 920, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}>
            {/* Logo */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <div className="animate-float" style={{ width: 72, height: 72, borderRadius: 20, background: 'linear-gradient(135deg, #102440 0%, #162d52 100%)', border: '1px solid var(--border-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--shadow-xl), var(--shadow-gold)' }}>
                <Shield size={34} style={{ color: 'var(--gold-400)' }} />
              </div>
            </div>

            <h1 className="text-serif" style={{ fontSize: 54, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1, color: 'var(--text-primary)', marginBottom: 12 }}>
              Proctor<span style={{ color: 'var(--gold-400)' }}>AI</span>
            </h1>
            <p style={{ fontSize: 13, color: 'var(--gold-400)', letterSpacing: '0.28em', textTransform: 'uppercase', fontWeight: 600, marginBottom: 16 }}>
              Enterprise Interview Intelligence Platform
            </p>
            <hr className="divider" style={{ maxWidth: 280, margin: '0 auto 28px' }} />
            <p style={{ fontSize: 16, color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto 48px', lineHeight: 1.8 }}>
              AI-powered technical interview platform with real-time proctoring, live code execution,
              behavioral analytics, and automated evaluation — trusted by enterprise hiring teams.
            </p>

            {/* Portal Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, maxWidth: 700, margin: '0 auto 48px' }}>
              <div className="portal-card animate-slide-up" onClick={() => { setLoginRole('interviewer'); setView('login'); }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--indigo-glow)', border: '1px solid var(--border-indigo)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <Briefcase size={24} style={{ color: 'var(--indigo-400)' }} />
                </div>
                <h2 className="text-serif" style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Interviewer Portal</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
                  Manage sessions, question bank, live monitoring, AI evaluation and analytics.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--indigo-400)', fontSize: 13, fontWeight: 700 }}>
                  Enter Portal <ChevronRight size={16} />
                </div>
              </div>

              <div className="portal-card animate-slide-up-delay" onClick={() => { setLoginRole('candidate'); setView('login'); }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, background: 'var(--gold-glow)', border: '1px solid var(--border-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <Code size={24} style={{ color: 'var(--gold-400)' }} />
                </div>
                <h2 className="text-serif" style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Candidate Portal</h2>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
                  Access your secure exam, solve coding challenges under AI proctoring.
                </p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--gold-400)', fontSize: 13, fontWeight: 700 }}>
                  Enter Portal <ChevronRight size={16} />
                </div>
              </div>
            </div>

            {/* Feature pills */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                { icon: Brain, label: 'AI Code Evaluation' },
                { icon: Camera, label: 'Real-time Proctoring' },
                { icon: Terminal, label: 'Live Code Execution' },
                { icon: Shield, label: 'Anti-Cheat Detection' },
                { icon: BarChart2, label: 'Trust Score Analytics' },
                { icon: MessageSquare, label: 'Live Chat' },
              ].map(({ icon: Icon, label }) => (
                <span key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.12)', borderRadius: 20, padding: '5px 14px', fontSize: 11, color: 'rgba(129,140,248,0.8)', fontWeight: 500 }}>
                  <Icon size={11} />{label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER: LOGIN / REGISTRATION
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'login') {
    const isInterviewer = loginRole === 'interviewer';
    return (
      <>
        <Toast toasts={toasts} removeToast={removeToast} />
        <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '32px 16px' }}>
          <div className="glass-panel animate-slide-up" style={{ width: '100%', maxWidth: isRegistering && isInterviewer ? 580 : 440, padding: '40px 36px' }}>
            <button onClick={() => { setView('landing'); setIsRegistering(false); setError(''); resetForms(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 28, fontSize: 12, color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <ArrowLeft size={14} /> Back to Home
            </button>

            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ width: 50, height: 50, borderRadius: 12, background: isInterviewer ? 'var(--indigo-glow)' : 'var(--gold-glow)', border: `1px solid ${isInterviewer ? 'var(--border-indigo)' : 'var(--border-gold)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                {isRegistering ? <Award size={22} style={{ color: isInterviewer ? 'var(--indigo-400)' : 'var(--gold-400)' }} /> : <Lock size={22} style={{ color: isInterviewer ? 'var(--indigo-400)' : 'var(--gold-400)' }} />}
              </div>
              <h2 className="text-serif" style={{ fontSize: 24, fontWeight: 700, marginBottom: 6 }}>
                {isRegistering ? 'Create Account' : `${isInterviewer ? 'Interviewer' : 'Candidate'} Login`}
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {isRegistering ? (isInterviewer ? 'Register as a verified interviewer' : 'Register as an exam candidate') : 'Authenticate to access the secure portal'}
              </p>
            </div>

            {error && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 8, background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', marginBottom: 16 }}>
                <AlertCircle size={14} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#fca5a5' }}>{error}</span>
              </div>
            )}

            <form onSubmit={handleAuthSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: isRegistering && isInterviewer ? '1fr 1fr' : '1fr', gap: 14 }}>
                <div style={{ gridColumn: isRegistering && isInterviewer ? 'span 2' : undefined }} className="form-group">
                  <label className="form-label">Username</label>
                  <div style={{ position: 'relative' }}>
                    <User size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="e.g. johndoe" required className="form-input" style={{ paddingLeft: 36 }} />
                  </div>
                </div>
                <div style={{ gridColumn: isRegistering && isInterviewer ? 'span 2' : undefined }} className="form-group">
                  <label className="form-label">Password</label>
                  <div style={{ position: 'relative' }}>
                    <Key size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required className="form-input" style={{ paddingLeft: 36, paddingRight: 36 }} />
                    <button type="button" onClick={() => setShowPassword(p => !p)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)' }}>
                      {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {isRegistering && (
                  <>
                    <div style={{ gridColumn: isInterviewer ? 'span 2' : undefined }}>
                      <hr className="divider-subtle" style={{ margin: '4px 0 14px' }} />
                      <p style={{ fontSize: 10, color: 'var(--text-gold)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, marginBottom: 14 }}>
                        {isInterviewer ? 'Professional Details' : 'Personal Details'}
                      </p>
                    </div>
                    <div className="form-group"><label className="form-label">Full Name</label><input type="text" value={fullname} onChange={e => setFullname(e.target.value)} placeholder="John Doe" required className="form-input" /></div>
                    <div className="form-group"><label className="form-label">Email Address</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="john@example.com" className="form-input" /></div>
                    <div className="form-group"><label className="form-label">Phone</label><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 555-0000" className="form-input" /></div>
                    {isInterviewer && (
                      <>
                        <div className="form-group"><label className="form-label">Company</label><input type="text" value={company} onChange={e => setCompany(e.target.value)} placeholder="Google Inc." required className="form-input" /></div>
                        <div className="form-group"><label className="form-label">Job Title</label><input type="text" value={jobTitle} onChange={e => setJobTitle(e.target.value)} placeholder="Senior HR Manager" required className="form-input" /></div>
                        <div className="form-group"><label className="form-label">Department</label><input type="text" value={department} onChange={e => setDepartment(e.target.value)} placeholder="Engineering" className="form-input" /></div>
                        <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">LinkedIn URL</label><input type="url" value={linkedIn} onChange={e => setLinkedIn(e.target.value)} placeholder="https://linkedin.com/in/..." className="form-input" /></div>
                      </>
                    )}
                  </>
                )}
              </div>

              <button type="submit" disabled={isLoading} className={`btn ${isInterviewer ? 'btn-indigo' : 'btn-gold'} w-full btn-lg`} style={{ marginTop: 20 }}>
                {isLoading ? <span className="spinner" style={{ width: 18, height: 18 }} /> : <>{isRegistering ? <Award size={16} /> : <Lock size={16} />} {isRegistering ? 'Create Account' : 'Authenticate'}</>}
              </button>
            </form>

            <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
              {isRegistering ? <>Already have an account?{' '}<button type="button" onClick={() => { setIsRegistering(false); setError(''); }} style={{ color: isInterviewer ? 'var(--indigo-400)' : 'var(--gold-400)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>Sign In</button></> :
               <>Don't have an account?{' '}<button type="button" onClick={() => { setIsRegistering(true); setError(''); }} style={{ color: isInterviewer ? 'var(--indigo-400)' : 'var(--gold-400)', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}>Register Now</button></>}
            </p>
          </div>
        </div>
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER: CANDIDATE PORTAL
  // ══════════════════════════════════════════════════════════════════════
  if (view === 'candidate') {
    const currentQ = interviewQuestions[activeQuestionIdx];
    const timeRemaining = examDuration - examTimeElapsed;
    const isTimeLow = timeRemaining < 300;
    const answeredCount = Object.values(codeAnswers).filter(a => a && a.trim()).length;

    return (
      <>
        <Toast toasts={toasts} removeToast={removeToast} />
        {confirmDialog && <ConfirmDialog message={confirmDialog.message} onConfirm={() => { confirmDialog.resolve(true); setConfirmDialog(null); }} onCancel={() => { confirmDialog.resolve(false); setConfirmDialog(null); }} />}

        <div style={{ minHeight: '100vh', background: 'var(--navy-950)', display: 'flex', flexDirection: 'column' }}>
          {/* Candidate Header */}
          <header className="app-header" style={{ padding: '0 20px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gold-glow)', border: '1px solid var(--border-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Shield size={16} style={{ color: 'var(--gold-400)' }} />
              </div>
              <div>
                <span className="text-serif" style={{ fontSize: 16, fontWeight: 700 }}>ProctorAI</span>
                <span style={{ fontSize: 10, color: 'var(--gold-400)', letterSpacing: '0.15em', textTransform: 'uppercase', marginLeft: 8, opacity: 0.7 }}>Secure Exam</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {interviewStarted && (
                <>
                  <div className={`timer-display ${isTimeLow ? 'danger' : ''}`}>
                    {isTimeLow ? '⏰ ' : ''}{formatTimer(timeRemaining)}
                  </div>
                  <div className="live-indicator">
                    <span className="live-dot" />
                    REC {formatTimer(examTimeElapsed)}
                  </div>
                  <button onClick={() => setShowChat(c => !c)} className="btn btn-ghost btn-icon" style={{ position: 'relative' }}>
                    <MessageSquare size={15} />
                    {chatMessages.filter(m => m.senderRole === 'interviewer').length > 0 && (
                      <span style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: 'var(--indigo-400)' }} />
                    )}
                  </button>
                  <button onClick={endInterviewSession} className="btn btn-danger btn-sm">
                    <CheckCircle size={13} /> Submit & End
                  </button>
                </>
              )}
              <div style={{ padding: '5px 12px', borderRadius: 6, background: 'var(--surface-2)', border: '1px solid var(--border-faint)', fontSize: 12, color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--text-muted)' }}>Candidate: </span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{currentUser?.username}</span>
              </div>
              {!interviewStarted && <button onClick={handleLogout} className="btn btn-ghost btn-sm"><LogOut size={13} /> Exit</button>}
            </div>
          </header>

          <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
            {/* PRE-INTERVIEW */}
            {!interviewStarted && (
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                {!currentUser?.interview_id && !currentUser?.interviewId ? (
                  <div className="glass-panel animate-slide-up" style={{ maxWidth: 480, width: '100%', padding: 40, textAlign: 'center' }}>
                    <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                      <AlertTriangle size={28} style={{ color: 'var(--danger)' }} />
                    </div>
                    <h2 className="text-serif" style={{ fontSize: 22, marginBottom: 12 }}>No Active Interview</h2>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>
                      You don't have an active interview session. Please contact your interviewer to activate your session.
                    </p>
                    <button onClick={handleLogout} className="btn btn-primary w-full">Return to Login</button>
                  </div>
                ) : systemCheckStep === 'idle' ? (
                  /* System Check + Briefing */
                  <div className="glass-panel animate-slide-up" style={{ maxWidth: 620, width: '100%', padding: 40 }}>
                    <div style={{ textAlign: 'center', marginBottom: 28 }}>
                      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gold-glow)', border: '1px solid var(--border-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', animation: 'pulse-ring 2.5s ease infinite' }}>
                        <Lock size={28} style={{ color: 'var(--gold-400)' }} />
                      </div>
                      <h2 className="text-serif" style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Technical Interview Briefing</h2>
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Read all rules carefully before proceeding</p>
                    </div>
                    <hr className="divider" style={{ marginBottom: 24 }} />

                    {/* Interview details */}
                    {currentUser?.jobRole && (
                      <div style={{ display: 'flex', gap: 10, marginBottom: 20, padding: '12px 16px', borderRadius: 10, background: 'var(--surface-3)', border: '1px solid var(--border-gold)' }}>
                        <Briefcase size={16} style={{ color: 'var(--gold-400)', flexShrink: 0, marginTop: 2 }} />
                        <div>
                          <p style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 2 }}>Position</p>
                          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{currentUser.jobRole}</p>
                        </div>
                      </div>
                    )}

                    {/* Rules */}
                    <div className="glass-inset" style={{ padding: '16px 18px', marginBottom: 20 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--gold-400)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Examination Rules & Regulations</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[
                          ['Right-click and context menu are completely disabled.', 'low'],
                          ['Copy and paste are blocked. Any attempt is flagged and logged.', 'medium'],
                          ['Switching tabs or windows triggers a high-severity proctoring alert.', 'high'],
                          ['Your webcam must remain active. Face must be visible at all times.', 'medium'],
                          ['All proctoring events are logged and shared with your interviewer in real-time.', 'low'],
                          ['Each question has a time allocation. The exam auto-submits on timeout.', 'medium'],
                        ].map(([rule, sev], i) => (
                          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', marginTop: 6, flexShrink: 0, background: sev === 'high' ? 'var(--danger)' : sev === 'medium' ? 'var(--warning)' : 'var(--indigo-400)' }} />
                            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{rule}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Questions overview */}
                    {interviewQuestions.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
                        {interviewQuestions.map((q, i) => (
                          <div key={i} style={{ flex: '1 1 80px', minWidth: 80, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border-gold)', textAlign: 'center' }}>
                            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 2 }}>Q{i + 1}</p>
                            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{q.type?.replace('_', ' ')}</p>
                            <span className={`diff-${q.difficulty}`} style={{ fontSize: 9, marginTop: 2, display: 'inline-block' }}>{q.difficulty}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <button onClick={runSystemCheck} className="btn btn-gold w-full btn-lg">
                      <Cpu size={18} /> Run System Check & Continue
                    </button>
                  </div>
                ) : isLaunchingTerminal ? (
                  /* Terminal Launched Waiting Screen */
                  <div className="glass-panel animate-slide-up" style={{ maxWidth: 540, width: '100%', padding: 40, textAlign: 'center' }}>
                    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--gold-glow)', border: '1px solid var(--border-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', animation: 'pulse-ring 2s ease infinite' }}>
                      <Shield size={36} style={{ color: 'var(--gold-400)' }} />
                    </div>
                    <h2 className="text-serif" style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Secure Exam Terminal Active</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.7 }}>
                      The dedicated full-screen desktop terminal is opening on your computer. Please switch to the terminal window to take your examination under AI proctoring.
                    </p>

                    <div className="glass-inset" style={{ padding: '16px 18px', marginBottom: 24, textAlign: 'left' }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold-400)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>
                        🔒 Security Mode Initialized
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        <div>• Fullscreen Kiosk Mode locks out Alt+Tab, Windows Key, and DevTools.</div>
                        <div>• Continuous AI proctoring tracks face visibility and off-screen gaze.</div>
                        <div>• Any secondary face or cheating attempts are flagged to your interviewer immediately.</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: 12 }}>
                      <button onClick={() => startInterviewSession()} className="btn btn-gold flex-1">
                        <RefreshCw size={15} /> Re-launch Terminal
                      </button>
                      <button onClick={() => { setIsLaunchingTerminal(false); setSystemCheckStep('done'); }} className="btn btn-ghost">
                        Back to Check
                      </button>
                    </div>
                  </div>
                ) : systemCheckStep === 'running' || systemCheckStep === 'done' ? (
                  /* System Check Results */
                  <div className="glass-panel animate-slide-up" style={{ maxWidth: 560, width: '100%', padding: '36px 32px' }}>
                    <h2 className="text-serif" style={{ fontSize: 24, marginBottom: 4, textAlign: 'center' }}>System Readiness Check</h2>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 20 }}>Verifying your camera, microphone, and environment</p>

                    {/* Live Camera Preview Box */}
                    {candidateLocalStream && (
                      <div style={{ position: 'relative', width: '100%', height: 180, borderRadius: 12, overflow: 'hidden', marginBottom: 20, border: '1px solid var(--border-gold)', background: '#000' }}>
                        <video
                          ref={el => { if (el && candidateLocalStream) { el.srcObject = candidateLocalStream; el.play().catch(() => {}); } }}
                          autoPlay
                          muted
                          playsInline
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', padding: '4px 10px', borderRadius: 20, fontSize: 10, color: 'var(--gold-400)', fontWeight: 600 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} /> Camera Active
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                      {[
                        { key: 'camera', label: 'Webcam / Video', icon: Camera, passMsg: 'Camera detected and live', failMsg: 'Camera not accessible — required', warnMsg: 'Camera active' },
                        { key: 'microphone', label: 'Microphone / Audio', icon: Mic, passMsg: 'Microphone active and ready', failMsg: 'Microphone permission denied', warnMsg: 'Microphone detected' },
                        { key: 'browser', label: 'Browser Compatibility', icon: Monitor, passMsg: 'Chrome / Edge detected — optimal', failMsg: 'Unsupported browser', warnMsg: 'Standard browser' },
                        { key: 'network', label: 'Backend Server & DB', icon: Wifi, passMsg: 'Connected to ProctorAI Cloud', failMsg: 'Cannot reach backend server', warnMsg: 'High latency detected' },
                      ].map(({ key, label, icon: Icon, passMsg, failMsg, warnMsg }) => {
                        const status = systemChecks[key];
                        return (
                          <div key={key} className={`check-step ${status === 'pass' ? 'passing' : status === 'fail' ? 'failing' : status === 'warn' ? '' : ''}`}>
                            <div style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Icon size={17} style={{ color: status === 'pass' ? 'var(--success)' : status === 'fail' ? 'var(--danger)' : status === 'warn' ? 'var(--warning)' : 'var(--text-secondary)' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{label}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                {!status || status === 'checking' ? 'Checking...' : status === 'pass' ? passMsg : status === 'warn' ? warnMsg : failMsg}
                              </p>
                            </div>
                            <div>
                              {!status || status === 'checking' ? <span className="spinner" /> :
                               status === 'pass' ? <CheckCircle size={17} style={{ color: 'var(--success)' }} /> :
                               status === 'warn' ? <AlertTriangle size={17} style={{ color: 'var(--warning)' }} /> :
                               <XCircle size={17} style={{ color: 'var(--danger)' }} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {systemCheckStep === 'done' && (
                      <>
                        {systemChecks.camera === 'fail' || systemChecks.microphone === 'fail' ? (
                          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'var(--danger-dim)', border: '1px solid rgba(239,68,68,0.3)', fontSize: 13, color: '#fca5a5', marginBottom: 16, lineHeight: 1.6 }}>
                            ⚠ Camera and microphone permissions are required to begin the exam. Please permit access and click "Run System Check".
                          </div>
                        ) : (
                          <button onClick={() => startInterviewSession()} className="btn btn-gold w-full btn-lg">
                            <Shield size={18} /> Launch Secure Exam Terminal (Electron)
                          </button>
                        )}
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            )}

            {/* ACTIVE EXAM */}
            {interviewStarted && (
              <div style={{ flex: 1, display: 'flex', gap: 0, overflow: 'hidden', minHeight: 0 }}>
                {/* Left: Code/Question area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, borderRight: '1px solid var(--border-faint)' }}>
                  {/* Question Navigator */}
                  <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border-faint)', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(3,8,15,0.4)' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginRight: 4 }}>Questions:</span>
                    {interviewQuestions.length > 0 ? interviewQuestions.map((q, i) => (
                      <button key={i} className={`q-tab ${activeQuestionIdx === i ? 'active' : (codeAnswers[i] && codeAnswers[i].trim()) ? 'answered' : ''}`}
                        onClick={() => { setActiveQuestionIdx(i); setCodeOutput(null); }}>
                        {i + 1}
                      </button>
                    )) : [0, 1, 2].map(i => (
                      <button key={i} className={`q-tab ${activeQuestionIdx === i ? 'active' : ''}`} onClick={() => { setActiveQuestionIdx(i); setCodeOutput(null); }}>
                        {i + 1}
                      </button>
                    ))}
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>{answeredCount}/{interviewQuestions.length || 3} answered</span>

                    {/* Language selector */}
                    {currentQ?.type === 'coding' && (
                      <select value={selectedLanguage} onChange={e => setSelectedLanguage(e.target.value)} className="form-select" style={{ width: 'auto', padding: '4px 10px', fontSize: 11 }}>
                        {[['javascript', 'JavaScript'], ['python', 'Python'], ['java', 'Java'], ['cpp', 'C++'], ['go', 'Go'], ['rust', 'Rust']].map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Question Body */}
                  {currentQ ? (
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                      <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border-faint)', background: 'rgba(3,8,15,0.2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                          <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{currentQ.title}</h3>
                          <span className={`diff-${currentQ.difficulty}`}>{currentQ.difficulty}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'var(--surface-3)', padding: '2px 8px', borderRadius: 12 }}>{currentQ.topic}</span>
                        </div>
                        <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.7 }}>{currentQ.description}</p>
                        {currentQ.testCases?.filter(tc => !tc.isHidden).length > 0 && (
                          <div style={{ marginTop: 12, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                            {currentQ.testCases.filter(tc => !tc.isHidden).slice(0, 2).map((tc, i) => (
                              <div key={i} style={{ flex: '1 1 200px', padding: '8px 12px', borderRadius: 8, background: 'rgba(3,8,15,0.5)', border: '1px solid var(--border-faint)', fontFamily: 'JetBrains Mono', fontSize: 11 }}>
                                <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>Example {i + 1}</p>
                                <p style={{ color: 'var(--indigo-400)' }}>Input: {tc.input}</p>
                                <p style={{ color: 'var(--success)' }}>Output: {tc.expectedOutput}</p>
                              </div>
                            ))}
                          </div>
                        )}
                        {/* MCQ options */}
                        {currentQ.type === 'mcq' && currentQ.options?.length > 0 && (
                          <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {currentQ.options.map((opt, i) => (
                              <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, border: `1px solid ${mcqAnswers[activeQuestionIdx] === i ? 'var(--border-indigo)' : 'var(--border-subtle)'}`, background: mcqAnswers[activeQuestionIdx] === i ? 'var(--indigo-glow)' : 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--text-primary)', transition: 'all 0.15s' }}>
                                <input type="radio" name={`q-${activeQuestionIdx}`} checked={mcqAnswers[activeQuestionIdx] === i} onChange={() => setMcqAnswers(prev => ({ ...prev, [activeQuestionIdx]: i }))} style={{ accentColor: 'var(--indigo-400)' }} />
                                {String.fromCharCode(65 + i)}. {opt.text}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Code Editor */}
                      {(currentQ.type === 'coding' || currentQ.type === 'system_design') && (
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                          <div className="code-editor-header">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <Terminal size={14} style={{ color: 'var(--indigo-400)' }} />
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono' }}>{selectedLanguage}</span>
                            </div>
                            <button onClick={runCode} disabled={isRunningCode} className="btn btn-success btn-sm">
                              {isRunningCode ? <span className="spinner" style={{ width: 14, height: 14 }} /> : <Play size={12} />}
                              {isRunningCode ? 'Running...' : 'Run Code'}
                            </button>
                          </div>
                          <textarea
                            className="form-textarea"
                            value={codeAnswers[activeQuestionIdx] || currentQ.starterCode || ''}
                            onChange={e => setCodeAnswers(prev => ({ ...prev, [activeQuestionIdx]: e.target.value }))}
                            placeholder="// Write your solution here..."
                            style={{ flex: 1, fontFamily: 'JetBrains Mono', fontSize: 13, lineHeight: 1.8, padding: '14px 16px', borderRadius: 0, border: 'none', borderTop: '1px solid var(--border-faint)', resize: 'none', minHeight: 0, background: '#04090f', color: '#c9d1d9' }}
                            spellCheck={false}
                          />
                          {codeOutput !== null && (
                            <div className={`code-output ${codeOutputError ? 'error' : ''}`}>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{codeOutputError ? 'Error Output' : 'Program Output'}</span>
                              {codeOutput}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Blank state - waiting for questions */
                    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 40, background: 'rgba(3,8,15,0.2)' }}>
                      <HelpCircle size={48} style={{ color: 'var(--text-tertiary)', opacity: 0.2 }} />
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Waiting for questions...</p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>The interviewer has not asked any questions yet. When they send a question, it will appear here in real-time.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Right: Video + Warnings */}
                <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-faint)', overflow: 'hidden' }}>
                  {/* Candidate Video */}
                  <div style={{ padding: 12, borderBottom: '1px solid var(--border-faint)' }}>
                    <div className="video-tile" style={{ borderRadius: 10, marginBottom: 8 }}>
                      {candidateCameraActive
                        ? <video ref={candidateVideoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        : <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}><Camera size={28} style={{ color: 'rgba(148,163,184,0.2)' }} /></div>
                      }
                      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(3,8,15,0.85)', border: '1px solid var(--border-gold)', borderRadius: 5, padding: '3px 8px' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: candidateCameraActive ? 'var(--success)' : 'var(--danger)', animation: 'pulse-dot 2s infinite' }} />
                        <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.1em' }}>YOU</span>
                      </div>
                    </div>
                    <div className="video-tile" style={{ borderRadius: 10 }}>
                      <video ref={interviewerVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {!isInterviewerStreaming && (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(3,8,15,0.9)', gap: 10 }}>
                          <User size={22} style={{ color: 'rgba(212,160,23,0.4)' }} />
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Connecting interviewer...</span>
                        </div>
                      )}
                      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(3,8,15,0.85)', border: '1px solid var(--border-gold)', borderRadius: 5, padding: '3px 8px' }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: isInterviewerStreaming ? 'var(--success)' : 'var(--warning)', animation: 'pulse-dot 2s infinite' }} />
                        <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.1em' }}>INTERVIEWER</span>
                      </div>
                    </div>
                  </div>

                  {/* Proctoring Warnings */}
                  <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-faint)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Proctoring</span>
                      <span style={{ fontSize: 10, color: candidateWarnings.length > 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {candidateWarnings.length} alerts
                      </span>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                      {candidateWarnings.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: 'var(--text-muted)', textAlign: 'center', padding: 20 }}>
                          <Shield size={24} style={{ opacity: 0.2 }} />
                          <p style={{ fontSize: 11 }}>No violations detected</p>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {candidateWarnings.map(w => (
                            <div key={w.id} className={`alert-item alert-${w.severity}`}>
                              <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2, color: w.severity === 'high' ? 'var(--danger)' : w.severity === 'medium' ? 'var(--warning)' : 'var(--indigo-400)' }} />
                              <div>
                                <p style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.4 }}>{w.msg}</p>
                                <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'JetBrains Mono' }}>{w.time}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Chat Sidebar */}
                {showChat && (
                  <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', borderLeft: '1px solid var(--border-subtle)', background: 'rgba(3,8,15,0.6)' }}>
                    <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-faint)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Live Chat</span>
                      <button onClick={() => setShowChat(false)} className="btn btn-ghost btn-icon" style={{ width: 24, height: 24 }}><X size={12} /></button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {chatMessages.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20 }}>No messages yet</p>}
                      {chatMessages.map((m, i) => (
                        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.senderRole === 'candidate' ? 'flex-end' : 'flex-start' }}>
                          <div className={`chat-bubble ${m.senderRole === 'candidate' ? 'sent' : 'received'}`}>{m.message}</div>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{m.senderName || m.senderRole} · {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: 10, borderTop: '1px solid var(--border-faint)', display: 'flex', gap: 8 }}>
                      <input value={chatInput} onChange={e => setChatInput(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && chatInput.trim() && chatSocketRef.current) {
                            chatSocketRef.current.emit('send_message', { interviewId: currentUser?.interview_id || currentUser?.interviewId, senderId: currentUser?._id || currentUser?.id, senderRole: 'candidate', senderName: currentUser?.fullname || currentUser?.username, message: chatInput });
                            setChatMessages(prev => [...prev, { senderRole: 'candidate', senderName: 'You', message: chatInput, timestamp: new Date() }]);
                            setChatInput('');
                          }
                        }}
                        placeholder="Type a message..." className="form-input" style={{ fontSize: 12 }} />
                      <button className="btn btn-indigo btn-icon" onClick={() => {
                        if (chatInput.trim() && chatSocketRef.current) {
                          chatSocketRef.current.emit('send_message', { interviewId: currentUser?.interview_id || currentUser?.interviewId, senderId: currentUser?._id || currentUser?.id, senderRole: 'candidate', senderName: currentUser?.fullname || currentUser?.username, message: chatInput });
                          setChatMessages(prev => [...prev, { senderRole: 'candidate', senderName: 'You', message: chatInput, timestamp: new Date() }]);
                          setChatInput('');
                        }
                      }}><Send size={13} /></button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Launch Terminal Screen */}
            {isLaunchingTerminal && !interviewStarted && (
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <div className="glass-panel animate-slide-up" style={{ maxWidth: 500, width: '100%', padding: 40, textAlign: 'center' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--gold-glow)', border: '1px solid var(--border-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', animation: 'pulse-ring 2s infinite' }}>
                    <Shield size={28} style={{ color: 'var(--gold-400)' }} />
                  </div>
                  <h2 className="text-serif" style={{ fontSize: 24, marginBottom: 12 }}>Launching Secure Terminal</h2>
                  <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 24 }}>Click "Open ProctorAI" in the browser prompt to launch the desktop kiosk application.</p>
                  <div style={{ display: 'flex', gap: 12, flexDirection: 'column' }}>
                    <div style={{ display: 'flex', gap: 12, width: '100%' }}>
                      <button onClick={() => { window.location.href = `proctorai://start-exam?username=${encodeURIComponent(currentUser?.username || '')}&password=${encodeURIComponent(authPassword || 'pass')}&host=${encodeURIComponent(window.location.origin)}`; }} className="btn btn-gold" style={{ flex: 1 }}>Retry Launch</button>
                      <button onClick={() => setIsLaunchingTerminal(false)} className="btn btn-primary" style={{ flex: 1 }}>Cancel</button>
                    </div>
                    <button onClick={() => {
                      setIsLaunchingTerminal(false);
                      setInterviewStarted(true);
                      initCandidateWebcam();
                    }} className="btn btn-indigo" style={{ width: '100%', marginTop: 8 }}>
                      🧪 Continue in Browser (Developer Sandbox)
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  // ══════════════════════════════════════════════════════════════════════
  // RENDER: INTERVIEWER DASHBOARD
  // ══════════════════════════════════════════════════════════════════════

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: BarChart2 },
    { id: 'live', label: 'Live Monitor', icon: Activity },
    { id: 'candidates', label: 'Candidates', icon: Users },
    { id: 'questions', label: 'Question Bank', icon: BookOpen },
    { id: 'reports', label: 'Reports & Analytics', icon: FileText },
    { id: 'database', label: 'DB Viewer', icon: Database },
  ];

  return (
    <>
      <Toast toasts={toasts} removeToast={removeToast} />
      {confirmDialog && <ConfirmDialog message={confirmDialog.message} onConfirm={() => { confirmDialog.resolve(true); setConfirmDialog(null); }} onCancel={() => { confirmDialog.resolve(false); setConfirmDialog(null); }} />}

      {/* AI Eval Result Modal */}
      {showAiEval && aiEvalResult && (
        <div className="modal-overlay" onClick={() => setShowAiEval(false)}>
          <div className="modal-panel modal-panel-lg animate-slide-up" onClick={e => e.stopPropagation()} style={{ padding: 0, overflow: 'hidden', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Brain size={20} style={{ color: 'var(--indigo-400)' }} />
                <h3 className="text-serif" style={{ fontSize: 20 }}>AI Evaluation Results</h3>
              </div>
              <button onClick={() => setShowAiEval(false)} className="btn btn-ghost btn-icon"><X size={15} /></button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1, padding: 24 }}>
              {/* Overall Score */}
              <div style={{ display: 'flex', gap: 16, marginBottom: 24, padding: 20, borderRadius: 12, background: 'var(--surface-3)', border: '1px solid var(--border-indigo)' }}>
                <div style={{ textAlign: 'center', minWidth: 100 }}>
                  <div style={{ fontSize: 48, fontWeight: 800, color: aiEvalResult.overallScore >= 70 ? 'var(--success)' : aiEvalResult.overallScore >= 50 ? 'var(--warning)' : 'var(--danger)', fontFamily: 'JetBrains Mono', lineHeight: 1 }}>{aiEvalResult.overallScore}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>/ 100</div>
                </div>
                <div>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                    <span className="badge badge-active">{aiEvalResult.technicalLevel}</span>
                    <span className={`badge ${aiEvalResult.recommendation === 'hire' ? 'badge-hire' : aiEvalResult.recommendation === 'reject' ? 'badge-reject' : 'badge-hold'}`}>
                      {aiEvalResult.recommendation}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{aiEvalResult.summary}</p>
                </div>
              </div>

              {/* Per-question results */}
              {aiEvalResult.perQuestion?.map((pq, i) => (
                <div key={i} className="glass-card" style={{ padding: 16, marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h4 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>Q{i + 1}: {pq.questionTitle}</h4>
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[['Correctness', pq.correctness], ['Efficiency', pq.efficiency], ['Quality', pq.codeQuality]].map(([label, val]) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: val >= 7 ? 'var(--success)' : val >= 5 ? 'var(--warning)' : 'var(--danger)', fontFamily: 'JetBrains Mono' }}>{val}/10</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 8 }}>{pq.feedback}</p>
                  {pq.aiDetected && <span className="badge badge-reject" style={{ fontSize: 10 }}>⚠ AI-Generated Code Detected</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Add Candidate Modal */}
      {isAddCandidateOpen && (
        <div className="modal-overlay">
          <div className="modal-panel animate-slide-up" style={{ padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 className="text-serif" style={{ fontSize: 20 }}>Register New Candidate</h3>
              <button onClick={() => setIsAddCandidateOpen(false)} className="btn btn-ghost btn-icon"><X size={15} /></button>
            </div>
            <form onSubmit={handleCreateCandidate} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group"><label className="form-label">Username *</label><input required value={newCandidateName} onChange={e => setNewCandidateName(e.target.value)} placeholder="e.g. alice_jones" className="form-input" /></div>
                <div className="form-group"><label className="form-label">Full Name</label><input value={newCandidateFullname} onChange={e => setNewCandidateFullname(e.target.value)} placeholder="Alice Jones" className="form-input" /></div>
                <div className="form-group"><label className="form-label">Email</label><input type="email" value={newCandidateEmail} onChange={e => setNewCandidateEmail(e.target.value)} placeholder="alice@example.com" className="form-input" /></div>
                <div className="form-group"><label className="form-label">Password</label><input type="password" value={newCandidatePass} onChange={e => setNewCandidatePass(e.target.value)} placeholder="min. 6 characters" className="form-input" /></div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}><label className="form-label">Job Role</label>
                  <input value={newCandidateJobRole} onChange={e => setNewCandidateJobRole(e.target.value)} placeholder="e.g. Senior Software Engineer" className="form-input" />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
                <button type="button" onClick={() => setIsAddCandidateOpen(false)} className="btn btn-ghost">Cancel</button>
                <button type="submit" className="btn btn-gold"><PlusCircle size={14} /> Register</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Layout */}
      <div className="page-container">
        {/* Sidebar */}
        <aside className="sidebar" style={{ width: 220, flexShrink: 0 }}>
          <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid var(--border-faint)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--gold-glow)', border: '1px solid var(--border-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Shield size={16} style={{ color: 'var(--gold-400)' }} />
              </div>
              <div>
                <div className="text-serif" style={{ fontSize: 16, fontWeight: 700 }}>ProctorAI</div>
                <div style={{ fontSize: 9, color: 'var(--gold-400)', letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.8 }}>Interviewer Portal</div>
              </div>
            </div>
          </div>

          <nav style={{ flex: 1, padding: '10px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {sidebarItems.map(({ id, label, icon: Icon }) => (
              <button key={id} className={`nav-item ${activeSection === id ? 'active' : ''}`} onClick={() => setActiveSection(id)}>
                <Icon size={15} />
                <span>{label}</span>
                {id === 'live' && stats?.activeSessions > 0 && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, color: 'var(--indigo-400)', background: 'var(--indigo-glow)', padding: '1px 7px', borderRadius: 10, border: '1px solid var(--border-indigo)' }}>{stats.activeSessions}</span>
                )}
              </button>
            ))}
          </nav>

          {/* User info */}
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border-faint)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface-3)', border: '1px solid var(--border-medium)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <User size={14} style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)', truncate: true }} className="truncate">{currentUser?.fullname || currentUser?.username}</p>
                <p style={{ fontSize: 10, color: 'var(--text-muted)' }} className="truncate">{currentUser?.company || currentUser?.email}</p>
              </div>
            </div>
            <button onClick={handleLogout} className="btn btn-ghost w-full btn-sm"><LogOut size={12} /> Sign Out</button>
          </div>
        </aside>

        {/* Main content */}
        <div className="main-content">
          {/* Top bar */}
          <header className="app-header" style={{ padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h1 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
                {sidebarItems.find(s => s.id === activeSection)?.label}
              </h1>
            </div>
            {stats && (
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                {[
                  { label: 'Active', value: stats.activeSessions, color: 'var(--indigo-400)' },
                  { label: 'Total', value: stats.totalCandidates, color: 'var(--text-primary)' },
                  { label: 'Avg Trust', value: `${stats.avgTrustScore}%`, color: getTrustColor(stats.avgTrustScore) },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                    <span style={{ color: 'var(--text-muted)' }}>{s.label}:</span>
                    <span style={{ fontWeight: 800, color: s.color, fontFamily: 'JetBrains Mono' }}>{s.value}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setIsAddCandidateOpen(true); }} className="btn btn-gold btn-sm"><Plus size={13} /> Add Candidate</button>
              <button onClick={() => fetchCandidates()} className="btn btn-ghost btn-icon btn-sm"><RefreshCw size={13} /></button>
            </div>
          </header>

          <div className="content-area">

            {/* ── DASHBOARD ───────────────────────────────────────── */}
            {activeSection === 'dashboard' && (
              <div className="animate-fade-in">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 24 }}>
                  {stats ? [
                    { label: 'Active Sessions', value: stats.activeSessions, icon: Activity, color: 'var(--indigo-400)', bg: 'var(--indigo-glow)' },
                    { label: 'Total Candidates', value: stats.totalCandidates, icon: Users, color: 'var(--info)', bg: 'rgba(56,189,248,0.08)' },
                    { label: 'Completed', value: stats.completedSessions, icon: CheckCircle, color: 'var(--success)', bg: 'var(--success-dim)' },
                    { label: 'Avg Trust Score', value: `${stats.avgTrustScore}%`, icon: Shield, color: getTrustColor(stats.avgTrustScore), bg: 'transparent' },
                    { label: 'Total Alerts', value: stats.totalLogs, icon: Bell, color: 'var(--warning)', bg: 'var(--warning-dim)' },
                    { label: 'High Severity', value: stats.highSeverityLogs, icon: AlertTriangle, color: 'var(--danger)', bg: 'var(--danger-dim)' },
                    { label: 'Hired', value: stats.hireCount || 0, icon: Award, color: '#4ade80', bg: 'rgba(74,222,128,0.08)' },
                    { label: 'Rejected', value: stats.rejectCount || 0, icon: XCircle, color: '#f87171', bg: 'rgba(248,113,113,0.08)' },
                  ].map(({ label, value, icon: Icon, color, bg }) => (
                    <div key={label} className="stat-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div style={{ width: 36, height: 36, borderRadius: 10, background: bg, border: `1px solid ${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon size={16} style={{ color }} />
                        </div>
                      </div>
                      <div style={{ fontSize: 26, fontWeight: 800, color, fontFamily: 'JetBrains Mono', lineHeight: 1, marginBottom: 4 }}>{value}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500 }}>{label}</div>
                    </div>
                  )) : Array(8).fill(0).map((_, i) => <div key={i} className="stat-card skeleton" style={{ height: 100 }} />)}
                </div>

                {/* Anomaly breakdown */}
                {stats?.anomalyBreakdown?.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div className="glass-panel" style={{ padding: 20 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Top Anomaly Types</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {stats.anomalyBreakdown.slice(0, 6).map((a, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ fontSize: 12, color: 'var(--text-secondary)', flex: 1 }} className="truncate">{a._id}</span>
                            <div className="trust-bar-track" style={{ flex: 2 }}>
                              <div style={{ width: `${Math.min(100, (a.count / (stats.anomalyBreakdown[0]?.count || 1)) * 100)}%`, height: '100%', borderRadius: 9999, background: 'var(--indigo-500)', transition: 'width 0.8s ease' }} />
                            </div>
                            <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'var(--text-primary)', minWidth: 24, textAlign: 'right' }}>{a.count}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="glass-panel" style={{ padding: 20 }}>
                      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: 'var(--text-primary)' }}>Recent Candidates</h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {allCandidates.slice(0, 5).map(c => (
                          <div key={c.candidate_id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <User size={13} style={{ color: 'var(--text-secondary)' }} />
                            </div>
                            <div style={{ flex: 1, overflow: 'hidden' }}>
                              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }} className="truncate">{c.candidate_name}</p>
                              <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.job_role || 'Software Engineer'}</p>
                            </div>
                            <span className={`badge badge-${c.status}`} style={{ fontSize: 9 }}>{c.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── LIVE MONITOR ─────────────────────────────────────── */}
            {activeSection === 'live' && (
              <div className="animate-fade-in" style={{ display: 'flex', gap: 16, height: 'calc(100vh - 110px)', overflow: 'hidden' }}>
                {/* Candidate List */}
                <aside className="glass-panel" style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0 }}>
                  <div style={{ padding: '14px 14px 10px', borderBottom: '1px solid var(--border-faint)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Candidates</span>
                      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{processedCandidates.length} shown</span>
                    </div>
                    <div style={{ position: 'relative', marginBottom: 8 }}>
                      <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                      <input type="text" placeholder="Search..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="form-input" style={{ paddingLeft: 30, fontSize: 12 }} />
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-select" style={{ flex: 1, fontSize: 11, padding: '5px 8px' }}>
                        <option value="all">All Status</option>
                        <option value="active">Active</option>
                        <option value="scheduled">Scheduled</option>
                        <option value="completed">Completed</option>
                      </select>
                      <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="form-select" style={{ flex: 1, fontSize: 11, padding: '5px 8px' }}>
                        <option value="date">Latest</option>
                        <option value="name">Name</option>
                        <option value="score">Score</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
                    {processedCandidates.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: 12 }}>No candidates found</div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {processedCandidates.map(c => (
                          <div key={c.candidate_id} className={`candidate-card ${selectedInterview?.candidate_id === c.candidate_id ? 'selected' : ''}`}
                            onClick={() => setSelectedInterview({ id: c.interview_id, candidate_id: c.candidate_id, candidate_name: c.candidate_name, fullname: c.fullname, trust_score: c.trust_score, status: c.status })}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 28, height: 28, borderRadius: 8, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <User size={13} style={{ color: 'var(--gold-400)' }} />
                                </div>
                                <div>
                                  <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{c.candidate_name}</p>
                                  {c.fullname && c.fullname !== c.candidate_name && <p style={{ fontSize: 10, color: 'var(--text-muted)' }}>{c.fullname}</p>}
                                </div>
                              </div>
                              <span className={`badge badge-${c.status}`} style={{ fontSize: 9 }}>{c.status}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="trust-bar-track" style={{ flex: 1 }}>
                                <div className={`trust-bar-fill ${getTrustClass(c.trust_score || 100)}`} style={{ width: `${c.trust_score || 100}%` }} />
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 800, fontFamily: 'JetBrains Mono', color: getTrustColor(c.trust_score || 100), minWidth: 32, textAlign: 'right' }}>{Math.round(c.trust_score || 100)}%</span>
                            </div>
                            {c.status === 'scheduled' && (
                              <button onClick={e => { e.stopPropagation(); handleActivateInterview(c.interview_id); }} className="btn btn-success btn-sm" style={{ marginTop: 8, width: '100%', fontSize: 10 }}>
                                <Play size={10} /> Activate Session
                              </button>
                            )}
                            <button onClick={e => { e.stopPropagation(); handleDeleteCandidate(c.candidate_id, c.candidate_name); }} className="btn btn-ghost btn-icon btn-sm" style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, opacity: 0 }} title="Delete">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </aside>

                {/* Live Stream + Alerts + Notes */}
                <div style={{ flex: 1, display: 'flex', gap: 14, minWidth: 0, overflow: 'hidden' }}>
                  {selectedInterview ? (
                    <>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
                        <LiveStream roomId={selectedInterview.id} candidateName={selectedInterview.candidate_name} />

                        {/* Ask a Question Panel */}
                        {selectedInterview.status === 'active' && (
                          <div className="glass-panel" style={{ padding: 16, flexShrink: 0, border: '1px solid var(--border-indigo)' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--gold-400)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Code size={13} /> Ask Question to Candidate
                              </span>
                              <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Sent questions appear instantly on candidate terminal</span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              <div style={{ display: 'flex', gap: 8 }}>
                                <input type="text" placeholder="Question Title (e.g. Find First Duplicate)" value={liveQuestionTitle} onChange={e => setLiveQuestionTitle(e.target.value)} className="form-input" style={{ flex: 1, fontSize: 12 }} />
                                <select value={liveQuestionType} onChange={e => setLiveQuestionType(e.target.value)} className="form-select" style={{ width: 110, fontSize: 11 }}>
                                  <option value="coding">💻 Coding</option>
                                  <option value="system_design">📐 Design</option>
                                  <option value="behavioral">🗣 Behavioral</option>
                                </select>
                                <select value={liveQuestionDifficulty} onChange={e => setLiveQuestionDifficulty(e.target.value)} className="form-select" style={{ width: 100, fontSize: 11 }}>
                                  <option value="easy">Easy</option>
                                  <option value="medium">Medium</option>
                                  <option value="hard">Hard</option>
                                </select>
                              </div>
                              <textarea value={liveQuestionDesc} onChange={e => setLiveQuestionDesc(e.target.value)} placeholder="Type the question details, requirements, and examples here..." className="form-textarea" style={{ resize: 'none', height: 60, fontSize: 12 }} />
                              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                <button onClick={handleSendLiveQuestion} disabled={isSendingQuestion || !liveQuestionTitle.trim() || !liveQuestionDesc.trim()} className="btn btn-gold btn-sm" style={{ padding: '6px 16px' }}>
                                  {isSendingQuestion ? 'Sending...' : 'Send Question'} <Send size={12} style={{ marginLeft: 6 }} />
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Notes + Decision Panel */}
                        <div className="glass-panel" style={{ padding: 16, flexShrink: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>Interviewer Notes</span>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                              {/* Decision */}
                              <select value={decision} onChange={e => setDecision(e.target.value)} className="form-select" style={{ padding: '4px 10px', fontSize: 11, width: 'auto' }}>
                                <option value="pending">Pending</option>
                                <option value="hire">✅ Hire</option>
                                <option value="reject">❌ Reject</option>
                                <option value="hold">⏸ Hold</option>
                              </select>
                              {/* Rating */}
                              <div style={{ display: 'flex', gap: 2 }}>
                                {[1, 2, 3, 4, 5].map(i => (
                                  <button key={i} type="button" onClick={() => setInterviewerRating(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: i <= interviewerRating ? 'var(--gold-400)' : 'var(--text-tertiary)', padding: 2 }}>
                                    <Star size={14} fill={i <= interviewerRating ? 'currentColor' : 'none'} />
                                  </button>
                                ))}
                              </div>
                              {/* AI Evaluate */}
                              <button onClick={runAiEvaluation} disabled={isEvaluating} className="btn btn-indigo btn-sm">
                                {isEvaluating ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Brain size={12} />}
                                {isEvaluating ? 'Evaluating...' : 'AI Evaluate'}
                              </button>
                              {isSavingNotes && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Saving...</span>}
                            </div>
                          </div>
                          <textarea value={interviewerNotes} onChange={e => setInterviewerNotes(e.target.value)}
                            placeholder="Add interview notes, observations, and feedback here..." className="form-textarea" style={{ resize: 'none', height: 80, fontSize: 12 }} />
                        </div>
                      </div>
                      <div style={{ width: 320, flexShrink: 0 }}>
                        <AlertsPanel roomId={selectedInterview.id} />
                      </div>
                    </>
                  ) : (
                    <div className="glass-panel" style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
                      <Shield size={64} style={{ color: 'var(--text-tertiary)', opacity: 0.15 }} />
                      <div style={{ textAlign: 'center' }}>
                        <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>Select a candidate to monitor</p>
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Live webcam stream, proctoring alerts, and notes will appear here</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── CANDIDATES ────────────────────────────────────────── */}
            {activeSection === 'candidates' && (
              <div className="animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                      <input placeholder="Search candidates..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="form-input" style={{ paddingLeft: 32, width: 220, fontSize: 12 }} />
                    </div>
                    <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="form-select" style={{ width: 130, fontSize: 12 }}>
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                </div>

                <div className="glass-panel" style={{ overflow: 'hidden' }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Job Role</th>
                        <th>Status</th>
                        <th>Trust Score</th>
                        <th>Decision</th>
                        <th>Date</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {processedCandidates.map(c => (
                        <tr key={c.candidate_id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <User size={14} style={{ color: 'var(--text-secondary)' }} />
                              </div>
                              <div>
                                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{c.candidate_name}</p>
                                <p style={{ fontSize: 11, color: 'var(--text-muted)' }}>{c.email || c.fullname || '—'}</p>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontSize: 12 }}>{c.job_role || '—'}</td>
                          <td><span className={`badge badge-${c.status}`}>{c.status}</span></td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="trust-bar-track" style={{ width: 60 }}>
                                <div className={`trust-bar-fill ${getTrustClass(c.trust_score || 100)}`} style={{ width: `${c.trust_score || 100}%` }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 800, fontFamily: 'JetBrains Mono', color: getTrustColor(c.trust_score || 100) }}>{Math.round(c.trust_score || 100)}%</span>
                            </div>
                          </td>
                          <td><span className={`badge badge-${c.decision || 'pending'}`}>{c.decision || 'pending'}</span></td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{formatDate(c.date)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {c.status === 'scheduled' && <button onClick={() => handleActivateInterview(c.interview_id)} className="btn btn-success btn-sm btn-icon" title="Activate"><Play size={11} /></button>}
                              <button onClick={() => { setSelectedInterview({ id: c.interview_id, candidate_id: c.candidate_id, candidate_name: c.candidate_name, trust_score: c.trust_score }); setActiveSection('live'); }} className="btn btn-primary btn-sm btn-icon" title="Monitor"><Monitor size={11} /></button>
                              <button onClick={() => handleDeleteCandidate(c.candidate_id, c.candidate_name)} className="btn btn-danger btn-sm btn-icon" title="Delete"><Trash2 size={11} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {processedCandidates.length === 0 && <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: 13 }}>No candidates found. Add one to get started.</div>}
                </div>
              </div>
            )}

            {/* ── QUESTION BANK ─────────────────────────────────────── */}
            {activeSection === 'questions' && (
              <div className="animate-fade-in">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                      <input placeholder="Search questions..." value={qFilter.search} onChange={e => setQFilter(p => ({ ...p, search: e.target.value }))} className="form-input" style={{ paddingLeft: 32, width: 200, fontSize: 12 }} />
                    </div>
                    <select value={qFilter.type} onChange={e => setQFilter(p => ({ ...p, type: e.target.value }))} className="form-select" style={{ width: 130, fontSize: 12 }}>
                      <option value="all">All Types</option>
                      <option value="coding">Coding</option>
                      <option value="mcq">MCQ</option>
                      <option value="system_design">System Design</option>
                      <option value="behavioral">Behavioral</option>
                    </select>
                    <select value={qFilter.difficulty} onChange={e => setQFilter(p => ({ ...p, difficulty: e.target.value }))} className="form-select" style={{ width: 120, fontSize: 12 }}>
                      <option value="all">All Difficulty</option>
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { resetQuestionForm(); setQBankView('form'); }} className="btn btn-gold btn-sm"><Plus size={13} /> New Question</button>
                  </div>
                </div>

                {qBankView === 'form' ? (
                  <div className="glass-panel" style={{ padding: 28, maxWidth: 700 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <h3 className="text-serif" style={{ fontSize: 18 }}>{editingQuestion ? 'Edit Question' : 'Add New Question'}</h3>
                      <button onClick={() => { setQBankView('list'); resetQuestionForm(); }} className="btn btn-ghost btn-sm"><ArrowLeft size={13} /> Back</button>
                    </div>
                    <form onSubmit={handleSaveQuestion} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                        <div className="form-group" style={{ gridColumn: 'span 3' }}><label className="form-label">Question Title *</label><input required value={qTitle} onChange={e => setQTitle(e.target.value)} placeholder="e.g. Merge Two Sorted Lists" className="form-input" /></div>
                        <div className="form-group"><label className="form-label">Type</label>
                          <select value={qType} onChange={e => setQType(e.target.value)} className="form-select">
                            <option value="coding">Coding</option>
                            <option value="mcq">MCQ</option>
                            <option value="system_design">System Design</option>
                            <option value="behavioral">Behavioral</option>
                          </select>
                        </div>
                        <div className="form-group"><label className="form-label">Difficulty</label>
                          <select value={qDiff} onChange={e => setQDiff(e.target.value)} className="form-select">
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                          </select>
                        </div>
                        <div className="form-group"><label className="form-label">Topic</label><input value={qTopic} onChange={e => setQTopic(e.target.value)} placeholder="e.g. Arrays" className="form-input" /></div>
                        <div className="form-group" style={{ gridColumn: 'span 3' }}><label className="form-label">Problem Description *</label><textarea required value={qDesc} onChange={e => setQDesc(e.target.value)} placeholder="Full question description with constraints..." className="form-textarea" style={{ minHeight: 100 }} /></div>
                        {qType !== 'mcq' && <div className="form-group" style={{ gridColumn: 'span 3' }}><label className="form-label">Starter Code</label><textarea value={qStarter} onChange={e => setQStarter(e.target.value)} placeholder="// Starter code template..." className="form-textarea" style={{ fontFamily: 'JetBrains Mono', fontSize: 12, minHeight: 120 }} /></div>}
                        <div className="form-group" style={{ gridColumn: 'span 3' }}><label className="form-label">Tags (comma separated)</label><input value={qTags} onChange={e => setQTags(e.target.value)} placeholder="e.g. array, hash-map, two-pointer" className="form-input" /></div>
                      </div>
                      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
                        <button type="button" onClick={() => { setQBankView('list'); resetQuestionForm(); }} className="btn btn-ghost">Cancel</button>
                        <button type="submit" className="btn btn-gold"><Save size={14} /> {editingQuestion ? 'Save Changes' : 'Add to Bank'}</button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <div className="glass-panel" style={{ overflow: 'hidden' }}>
                    <table className="data-table">
                      <thead>
                        <tr><th>Question</th><th>Type</th><th>Difficulty</th><th>Topic</th><th>Tags</th><th>Actions</th></tr>
                      </thead>
                      <tbody>
                        {processedQuestions.map(q => (
                          <tr key={q._id}>
                            <td>
                              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>{q.title}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-muted)' }} className="truncate" style={{ maxWidth: 300 }}>{q.description?.slice(0, 80)}...</p>
                            </td>
                            <td><span className="badge badge-active" style={{ fontSize: 9 }}>{q.type?.replace('_', ' ')}</span></td>
                            <td><span className={`diff-${q.difficulty}`}>{q.difficulty}</span></td>
                            <td style={{ fontSize: 12 }}>{q.topic || '—'}</td>
                            <td><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{(q.tags || []).slice(0, 2).map(t => <span key={t} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, background: 'var(--surface-3)', color: 'var(--text-secondary)' }}>{t}</span>)}</div></td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => editQuestion(q)} className="btn btn-primary btn-sm btn-icon" title="Edit"><Edit size={11} /></button>
                                <button onClick={() => handleDeleteQuestion(q)} className="btn btn-danger btn-sm btn-icon" title="Delete"><Trash2 size={11} /></button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {processedQuestions.length === 0 && <div style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)', fontSize: 13 }}>No questions found. Add one to your bank.</div>}
                  </div>
                )}
              </div>
            )}

            {/* ── REPORTS ────────────────────────────────────────────── */}
            {activeSection === 'reports' && (
              <div className="animate-fade-in">
                <ReportView />
              </div>
            )}

            {/* ── DATABASE VIEWER ─────────────────────────────────────── */}
            {activeSection === 'database' && (
              <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div className="glass-panel" style={{ padding: 20 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Database size={18} style={{ color: 'var(--gold-400)' }} />
                      <h3 className="text-serif" style={{ fontSize: 18 }}>Database Viewer</h3>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--warning-dim)', border: '1px solid rgba(245,158,11,0.2)', padding: '2px 10px', borderRadius: 12 }}>Admin Only</span>
                    </div>
                    <button onClick={async () => {
                      try {
                        const res = await fetch(`${BACKEND}/api/admin/db`);
                        const data = await res.json();
                        setDbViewerData(data);
                        addToast(`Loaded ${data.users.length} users, ${data.interviews.length} interviews, ${data.logs.length} logs`, 'success');
                      } catch { addToast('Failed to load DB data', 'error'); }
                    }} className="btn btn-primary btn-sm"><RefreshCw size={13} /> Load DB Data</button>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 0 }}>Raw database records for debugging and administration. Click the button to fetch or refresh database tables.</p>
                </div>

                {dbViewerData && (
                  <div className="glass-panel animate-fade-in" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-light)', paddingBottom: 12 }}>
                      {['users', 'interviews', 'logs', 'questions'].map(tab => (
                        <button key={tab} 
                          onClick={() => setDbViewerTab(tab)}
                          className={`btn ${dbViewerTab === tab ? 'btn-gold' : 'btn-primary'}`} 
                          style={{ textTransform: 'capitalize', fontSize: 12, padding: '6px 16px' }}>
                          {tab} ({dbViewerData[tab]?.length || 0})
                        </button>
                      ))}
                    </div>

                    {/* Content */}
                    <div style={{ overflowX: 'auto', maxHeight: '450px', background: 'rgba(5,13,26,0.3)', borderRadius: 8, border: '1px solid var(--border-light)', padding: 12 }}>
                      {dbViewerData[dbViewerTab] && dbViewerData[dbViewerTab].length > 0 ? (
                        <pre style={{ margin: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {JSON.stringify(dbViewerData[dbViewerTab], null, 2)}
                        </pre>
                      ) : (
                        <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                          No records found in this table.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Inline hover CSS */}
      <style>{`
        .candidate-card:hover .btn-danger { opacity: 1 !important; }
        select option { background: #060f1e; color: #eef2ff; }
        .candidate-card { overflow: visible; }
        .candidate-card .btn-danger { opacity: 0; transition: opacity 0.15s; }
        .candidate-card:hover .btn-danger { opacity: 1; }
      `}</style>
    </>
  );
}
