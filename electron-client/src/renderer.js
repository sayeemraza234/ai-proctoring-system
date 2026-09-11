/**
 * ProctorAI — Secure Exam Terminal Renderer
 * Handles: Login → System Check → Locked Kiosk Exam → Submission
 */

// Polyfill for simple-peer in Electron
if (typeof global === 'undefined') {
    window.global = window;
}
if (typeof process === 'undefined' || !process.env) {
    window.process = { env: {} };
}

const API = 'http://localhost:5000';
let proctorSocket = null;
let signalingSocket = null;
let peerConnection = null;

// ── State ─────────────────────────────────────────────────────────────────────
let currentUser   = null;
let currentInterview = null;
let questions     = [];
let currentQIndex = 0;
let answers       = {};      // { questionId: code/text/mcqIndex }
let trustScore    = 100;
let examStartTime = null;
let timerInterval = null;
let camStream     = null;
let examActive    = false;

// ─── Utility ──────────────────────────────────────────────────────────────────
function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });
    const el = document.getElementById(id);
    el.style.display = 'flex';
    el.classList.add('active');
}

function ts() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
}

// ─── SCREEN 1: LOGIN ──────────────────────────────────────────────────────────
async function doLogin() {
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errBox   = document.getElementById('login-error');
    const btn      = document.getElementById('login-btn');
    const btnText  = document.getElementById('login-btn-text');
    const spinner  = document.getElementById('login-spinner');

    if (!username || !password) {
        errBox.textContent = 'Please enter your username and password.';
        errBox.classList.remove('hidden');
        return;
    }

    errBox.classList.add('hidden');
    btn.disabled = true;
    btnText.textContent = 'Signing in...';
    spinner.classList.remove('hidden');

    try {
        const res  = await fetch(`${API}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!res.ok) throw new Error(data.error || 'Login failed');
        if (data.role !== 'candidate') {
            throw new Error('This terminal is for candidates only. Use the interviewer dashboard.');
        }

        currentUser = data;
        currentInterview = data.interviewId || data.interview_id;
        questions = data.questions || [];

        // Go to system check
        document.getElementById('candidate-name').textContent = data.fullname || data.username;
        showScreen('screen-syscheck');
        runSystemChecks();

    } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
    } finally {
        btn.disabled = false;
        btnText.textContent = 'Enter Exam Portal';
        spinner.classList.add('hidden');
    }
}

// Enter on password field
document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
});
document.getElementById('login-username').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-password').focus();
});

// ─── SCREEN 2: SYSTEM CHECK ───────────────────────────────────────────────────
function setCheck(id, state, desc) {
    const item = document.getElementById(`check-${id}`);
    const icon = item.querySelector('.check-icon');
    const descEl = document.getElementById(`check-${id}-desc`);
    item.className = `check-item ${state}`;
    icon.className = `check-icon ${state}`;
    if (state === 'ok')   icon.textContent = '✅';
    if (state === 'fail') icon.textContent = '❌';
    if (desc) descEl.textContent = desc;
}

async function runSystemChecks() {
    let allOk = true;

    // Camera check
    try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        document.getElementById('cam-preview').srcObject = camStream;
        setCheck('camera', 'ok', 'Camera detected and accessible');
    } catch (e) {
        setCheck('camera', 'fail', 'Camera not found or permission denied');
        allOk = false;
    }

    await delay(400);

    // Backend check
    try {
        const r = await fetch(`${API}/`);
        if (!r.ok) throw new Error();
        setCheck('backend', 'ok', 'Connected to ProctorAI servers');
    } catch {
        setCheck('backend', 'fail', 'Cannot reach backend server');
        allOk = false;
    }

    await delay(400);

    // Interview check — proceed if an interview session exists, even with 0 questions
    // (interviewer can send questions live during the exam)
    if (currentInterview) {
        const qText = questions.length > 0 ? `${questions.length} question(s) loaded` : 'Session ready — interviewer will send questions live';
        setCheck('interview', 'ok', qText);
        document.getElementById('info-role').textContent = currentUser.jobRole || 'Software Engineer';
        document.getElementById('info-qcount').textContent = questions.length > 0 ? questions.length : 'Live (TBD)';
        document.getElementById('info-duration').textContent = '90 minutes';
        document.getElementById('exam-info-box').style.display = 'flex';
        document.getElementById('exam-info-box').style.flexDirection = 'column';
    } else {
        setCheck('interview', 'fail', 'No interview session assigned. Contact your interviewer.');
        allOk = false;
    }

    await delay(400);

    // Kiosk check
    if (window.electronAPI) {
        setCheck('kiosk', 'ok', 'Secure kiosk mode ready');
    } else {
        setCheck('kiosk', 'ok', 'Secure mode ready');
    }

    // Enable start button if all checks pass
    if (allOk) {
        const btn = document.getElementById('start-exam-btn');
        btn.disabled = false;
        btn.classList.remove('disabled');
    }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── BEGIN EXAM ───────────────────────────────────────────────────────────────
async function beginExam() {
    // Activate kiosk lockdown in Electron main process
    if (window.electronAPI) {
        window.electronAPI.startAiEngine({ mock: false });

        // Listen to AI proctoring events
        window.electronAPI.onAiLog((log) => {
            handleProctoringEvent(log);
        });
    }

    // Activate interview on server
    if (currentInterview) {
        try {
            await fetch(`${API}/api/interviews/${currentInterview}/activate`, { method: 'POST' });
        } catch(e) { console.warn('Could not activate interview:', e); }
    }

    // Connect proctoring socket
    try {
        proctorSocket = io(`${API}/proctor`);
        proctorSocket.emit('join_room', String(currentInterview));

        // Listen for manual questions from the interviewer in real-time
        proctorSocket.on('question_assigned', (question) => {
            if (!questions.some(q => q._id === question._id)) {
                questions.push(question);
                buildQuestionNav();
                renderQuestion(currentQIndex);
            }
        });
    } catch(e) {}

    examActive = true;
    showScreen('screen-exam');

    // Attach camera to exam views
    if (camStream) {
        document.getElementById('cam-thumb').srcObject = camStream;
        document.getElementById('cam-large').srcObject = camStream;
        // Start live video call connection
        initWebRTC(camStream);
    }

    // Start timer
    examStartTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);

    // Build question nav and render first question
    buildQuestionNav();
    renderQuestion(0);

    // Block all keyboard escape shortcuts (belt + suspenders on top of main process)
    blockKeyboard();
}

// ─── WebRTC Live Call ──────────────────────────────────────────────────────────
function initWebRTC(localStream) {
    if (!currentInterview) return;
    
    try {
        signalingSocket = io(`${API}/signaling`);
        let peerStarted = false;
        
        signalingSocket.on('connect', () => {
            signalingSocket.emit('join_room', String(currentInterview));
        });

        const createPeer = (initiator) => {
            if (peerStarted) return;
            peerStarted = true;
            if (peerConnection) peerConnection.destroy();
            
            const PeerClass = window.SimplePeer || SimplePeer;
            peerConnection = new PeerClass({
                initiator,
                stream: localStream,
                trickle: false
            });

            peerConnection.on('signal', (data) => {
                signalingSocket.emit(initiator ? 'offer' : 'answer', {
                    roomId: String(currentInterview),
                    signal: data
                });
            });

            peerConnection.on('stream', (remoteStream) => {
                const interviewerVideo = document.getElementById('interviewer-video');
                if (interviewerVideo) {
                    interviewerVideo.srcObject = remoteStream;
                    interviewerVideo.play().catch(console.error);
                    
                    const placeholder = document.getElementById('interviewer-placeholder');
                    if (placeholder) placeholder.classList.add('hidden');
                }
            });

            peerConnection.on('error', (err) => console.error('Peer connection error:', err));
        };

        // The candidate is the only initiator. This avoids offer/answer races
        // when both clients enter the room at nearly the same time.
        signalingSocket.on('user_joined', () => createPeer(true));
        signalingSocket.on('peer_present', () => createPeer(true));

        signalingSocket.on('offer', (data) => {
            if (peerStarted) return;
            const PeerClass = window.SimplePeer || SimplePeer;
            peerConnection = new PeerClass({
                initiator: false,
                stream: localStream,
                trickle: false
            });

            peerConnection.on('signal', (d) => {
                signalingSocket.emit('answer', {
                    roomId: String(currentInterview),
                    signal: d
                });
            });

            peerConnection.on('stream', (remoteStream) => {
                const interviewerVideo = document.getElementById('interviewer-video');
                if (interviewerVideo) {
                    interviewerVideo.srcObject = remoteStream;
                    interviewerVideo.play().catch(console.error);
                    
                    const placeholder = document.getElementById('interviewer-placeholder');
                    if (placeholder) placeholder.classList.add('hidden');
                }
            });

            peerConnection.signal(data.signal);
        });

        signalingSocket.on('answer', (data) => {
            if (peerConnection) peerConnection.signal(data.signal);
        });

    } catch (e) {
        console.error('WebRTC initialization failed:', e);
    }
}

// ─── KIOSK KEYBOARD BLOCK ─────────────────────────────────────────────────────
function blockKeyboard() {
    document.addEventListener('keydown', function kioskBlock(e) {
        // Allow typing in code editor and text areas
        const tag = document.activeElement?.tagName;
        const isInput = tag === 'TEXTAREA' || tag === 'INPUT';

        // Always block
        if (
            e.altKey ||                            // Alt+Tab, Alt+F4
            (e.ctrlKey && e.key !== 'a' && e.key !== 'z' && !isInput) ||
            e.key === 'Escape' ||
            e.key === 'F11' ||
            e.key === 'F12' ||
            e.key === 'F5' ||
            (e.ctrlKey && ['c','v','x','r','w','q','t','n'].includes(e.key.toLowerCase()) && !isInput) ||
            e.key === 'Meta'
        ) {
            e.preventDefault();
            e.stopPropagation();
            logAnomaly('keyboard_shortcut_attempt', 'medium');
            return false;
        }
    }, true);

    // Block context menu
    document.addEventListener('contextmenu', e => {
        if (examActive) { e.preventDefault(); logAnomaly('context_menu_attempt', 'low'); }
    });

    // Block drag
    document.addEventListener('dragstart', e => { if (examActive) e.preventDefault(); });
}

// ─── TIMER ────────────────────────────────────────────────────────────────────
function updateTimer() {
    const elapsed = Math.floor((Date.now() - examStartTime) / 1000);
    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60);
    const s = elapsed % 60;
    document.getElementById('exam-timer').textContent =
        `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}

// ─── QUESTIONS ────────────────────────────────────────────────────────────────
function buildQuestionNav() {
    const nav = document.getElementById('q-nav');
    nav.innerHTML = '';
    questions.forEach((q, i) => {
        const dot = document.createElement('div');
        dot.className = 'q-dot' + (i === 0 ? ' active' : '');
        dot.textContent = i + 1;
        dot.onclick = () => goToQuestion(i);
        dot.id = `q-dot-${i}`;
        nav.appendChild(dot);
    });
}

function renderQuestion(idx) {
    if (questions.length === 0) {
        document.getElementById('q-number').textContent = '—';
        const diffEl = document.getElementById('q-difficulty');
        diffEl.textContent = '—';
        diffEl.className = 'q-badge';
        document.getElementById('q-topic').textContent = '—';
        document.getElementById('q-title').textContent = 'Waiting for questions...';
        document.getElementById('q-description').textContent = 'The interviewer has not assigned any questions yet. Once a question is asked, it will appear here in real-time.';
        document.getElementById('q-progress-text').textContent = '0 / 0';
        document.getElementById('progress-fill').style.width = '0%';
        document.getElementById('mcq-options').classList.add('hidden');
        document.getElementById('code-section').classList.add('hidden');
        document.getElementById('text-section').classList.add('hidden');
        return;
    }
    if (!questions[idx]) return;
    const q = questions[idx];
    currentQIndex = idx;

    // Update nav dots
    document.querySelectorAll('.q-dot').forEach((d, i) => {
        d.className = 'q-dot' + (i === idx ? ' active' : '') + (answers[q._id || i] !== undefined ? ' answered' : '');
    });

    // Header
    document.getElementById('q-number').textContent = `Q${idx + 1}`;
    const diffEl = document.getElementById('q-difficulty');
    diffEl.textContent = q.difficulty || 'medium';
    diffEl.className = `q-badge ${(q.difficulty || 'medium').toLowerCase()}`;
    document.getElementById('q-topic').textContent = q.topic || 'General';
    document.getElementById('q-title').textContent = q.title || 'Question';
    document.getElementById('q-description').textContent = q.description || '';

    // Progress
    document.getElementById('q-progress-text').textContent = `${idx + 1} / ${questions.length}`;
    document.getElementById('progress-fill').style.width = `${((idx + 1) / questions.length) * 100}%`;

    // Hide all answer sections
    document.getElementById('mcq-options').classList.add('hidden');
    document.getElementById('code-section').classList.add('hidden');
    document.getElementById('text-section').classList.add('hidden');

    if (q.type === 'mcq') {
        const opts = document.getElementById('mcq-options');
        opts.classList.remove('hidden');
        opts.innerHTML = '';
        (q.options || []).forEach((opt, oi) => {
            const div = document.createElement('div');
            div.className = 'mcq-opt' + (answers[q._id] === oi ? ' selected' : '');
            div.textContent = opt.text || opt;
            div.onclick = () => selectMcq(q, oi, div, opts);
            opts.appendChild(div);
        });
    } else if (q.type === 'coding') {
        document.getElementById('code-section').classList.remove('hidden');
        document.getElementById('code-lang-label').textContent = (q.language || 'javascript').charAt(0).toUpperCase() + (q.language || 'javascript').slice(1);
        const editor = document.getElementById('code-editor');
        editor.value = answers[q._id] !== undefined ? answers[q._id] : (q.starterCode || '');
        editor.oninput = () => { answers[q._id] = editor.value; markAnswered(idx); };
    } else {
        document.getElementById('text-section').classList.remove('hidden');
        const ta = document.getElementById('text-answer');
        ta.value = answers[q._id] || '';
        ta.oninput = () => { answers[q._id] = ta.value; markAnswered(idx); };
    }
}

function selectMcq(q, oi, el, container) {
    container.querySelectorAll('.mcq-opt').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
    answers[q._id] = oi;
    markAnswered(currentQIndex);
}

function markAnswered(idx) {
    const dot = document.getElementById(`q-dot-${idx}`);
    if (dot && !dot.classList.contains('active')) dot.classList.add('answered');
}

function goToQuestion(idx) { renderQuestion(idx); }
function nextQuestion() { if (currentQIndex < questions.length - 1) renderQuestion(currentQIndex + 1); }
function prevQuestion() { if (currentQIndex > 0) renderQuestion(currentQIndex - 1); }

// ─── CODE EXECUTION ───────────────────────────────────────────────────────────
async function runCode() {
    const q = questions[currentQIndex];
    const code = document.getElementById('code-editor').value;
    const outBox = document.getElementById('code-output');
    const outText = document.getElementById('output-text');

    outBox.classList.remove('hidden');
    outText.textContent = '⏳ Running...';
    outText.style.color = '#94A3B8';

    try {
        const res = await fetch(`${API}/api/run-code`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code, language: q.language || 'javascript', stdin: '' })
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            outText.textContent = data.error || 'Code execution failed';
            outText.style.color = '#FCA5A5';
        } else if (data.stderr) {
            outText.textContent = data.stderr;
            outText.style.color = '#FCA5A5';
        } else {
            outText.textContent = data.stdout || '(no output)';
            outText.style.color = '#10B981';
        }
    } catch (e) {
        outText.textContent = 'Error: ' + e.message;
        outText.style.color = '#FCA5A5';
    }
}

// ─── STRICT PROCTORING & VISION MONITORING ─────────────────────────────────────
let visionInterval = null;
let isAnalyzingFrame = false;

function onWindowBlur() {
    if (examActive) {
        handleProctoringEvent({
            event: 'window_switch_attempt',
            severity: 'high',
            confidence: 1.0,
            text: 'Unauthorized attempt to switch away from the exam window.'
        });
    }
}

function onVisibilityChange() {
    if (document.hidden && examActive) {
        handleProctoringEvent({
            event: 'window_switch_attempt',
            severity: 'high',
            confidence: 1.0,
            text: 'Exam window lost focus or was minimized.'
        });
    }
}

function startStrictVisionProctoring() {
    if (visionInterval) clearInterval(visionInterval);
    const canvas = document.getElementById('vision-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const video = document.getElementById('cam-thumb');

    visionInterval = setInterval(async () => {
        if (!examActive || !camStream || isAnalyzingFrame) return;
        if (!video || video.readyState < 2) return;

        try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const pixels = imgData.data;

            // Check average brightness across the frame
            let totalBrightness = 0;
            for (let i = 0; i < pixels.length; i += 16) {
                totalBrightness += (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
            }
            const avgBrightness = totalBrightness / (pixels.length / 16);

            // If camera is covered or dark (blackout / blocked camera)
            if (avgBrightness < 12) {
                handleProctoringEvent({
                    event: 'no_face',
                    severity: 'high',
                    confidence: 1.0,
                    text: 'Webcam is covered or obstructed. Your face must be clearly visible.'
                });
                return;
            }

            // Send snapshot to backend AI Vision endpoint (Gemini Multimodal)
            isAnalyzingFrame = true;
            const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
            const res = await fetch(`${API}/api/proctor/analyze-frame`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    image: dataUrl,
                    roomId: String(currentInterview || '')
                })
            });

            if (res.ok) {
                const data = await res.json();
                if (data.analyzed && data.result) {
                    const r = data.result;
                    if (r.alert) {
                        const eventCode = r.faceCount === 0 ? 'no_face' :
                                          r.faceCount > 1 ? 'multiple_faces' :
                                          r.lookingAway ? 'off_screen_gaze' : 'suspicious_material';
                        handleProctoringEvent({
                            event: eventCode,
                            severity: r.severity || 'high',
                            confidence: r.confidence || 0.95,
                            text: r.alert
                        });
                    }
                }
            }
        } catch (err) {
            // Silently continue vision loop
        } finally {
            isAnalyzingFrame = false;
        }
    }, 2800);
}

function stopStrictVisionProctoring() {
    if (visionInterval) {
        clearInterval(visionInterval);
        visionInterval = null;
    }
}

function showAlertDialog(title, desc, penalty = 10) {
    const dialog = document.getElementById('proctor-alert-dialog');
    if (!dialog) return;
    document.getElementById('alert-dialog-title').textContent = title;
    document.getElementById('alert-dialog-desc').textContent = desc;
    document.getElementById('alert-dialog-penalty').textContent = `-${penalty} pts`;
    document.getElementById('alert-dialog-score').textContent = trustScore;
    document.getElementById('alert-dialog-time').textContent = new Date().toLocaleTimeString();
    dialog.classList.remove('hidden');

    // Audio alert chime
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(260, audioCtx.currentTime + 0.35);
        gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.35);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
    } catch {}
}

function dismissAlertDialog() {
    const dialog = document.getElementById('proctor-alert-dialog');
    if (dialog) dialog.classList.add('hidden');
}
window.dismissAlertDialog = dismissAlertDialog;

function handleProctoringEvent(log) {
    const msgMap = {
        no_face:                { text: '⚠ Face not visible in camera', title: 'FACE NOT DETECTED', sev: 'danger', penalty: 10 },
        multiple_faces:         { text: '🔴 Multiple faces detected in frame', title: 'MULTIPLE FACES DETECTED', sev: 'danger', penalty: 15 },
        off_screen_gaze:        { text: '👁 Looking away from screen', title: 'OFF-SCREEN GAZE DETECTED', sev: 'warn', penalty: 5 },
        window_switch_attempt:  { text: '🚨 Window / Tab switch attempt blocked', title: 'WINDOW SWITCH ATTEMPT', sev: 'danger', penalty: 15 },
        keyboard_shortcut_attempt: { text: 'Blocked keyboard shortcut', title: 'KEYBOARD SHORTCUT ATTEMPT', sev: 'warn', penalty: 5 },
        context_menu_attempt:   { text: 'Right-click blocked', title: 'RIGHT-CLICK ATTEMPT', sev: 'warn', penalty: 2 },
        suspicious_material:    { text: '🚨 Unauthorized material detected', title: 'UNAUTHORIZED MATERIAL FLAGGED', sev: 'danger', penalty: 20 },
        system_start:           { text: '✅ AI Proctoring active', title: 'AI MONITORING INITIALIZED', sev: 'info', penalty: 0 },
        camera_error:           { text: '⚠ Camera offline or unreadable', title: 'CAMERA ACCESS ERROR', sev: 'danger', penalty: 10 },
        dependency_error:       { text: '⚠ Proctoring engine using client fallback', title: 'PROCTORING NOTICE', sev: 'warn', penalty: 0 },
    };

    const info = msgMap[log.event] || { text: log.text || log.event, title: 'MALPRACTICE WARNING', sev: log.severity === 'high' ? 'danger' : 'warn', penalty: log.severity === 'high' ? 10 : 5 };
    logAnomaly(log.event, log.severity || 'medium', log.text || info.text, info.sev);

    const drop = info.penalty || (log.severity === 'high' ? 10 : log.severity === 'medium' ? 5 : 1);
    if (drop > 0) {
        trustScore = Math.max(0, trustScore - drop);
        updateTrust();
    }

    if (proctorSocket) {
        proctorSocket.emit('anomaly_alert', {
            roomId: String(currentInterview),
            event: log.event,
            severity: log.severity || (info.sev === 'danger' ? 'high' : 'medium'),
            confidence: log.confidence || 1.0,
            details: log.text || info.text
        });
    }

    showBanner(log.text || info.text);

    // If critical / high severity, pop up the full alert dialog box
    if (info.sev === 'danger' || log.severity === 'high') {
        showAlertDialog(info.title, log.text || info.text, drop);
    }
}

function logAnomaly(event, severity, text, cls) {
    if (!text) text = event.replace(/_/g, ' ');
    if (!cls) cls = severity === 'high' ? 'danger' : 'warn';

    const entries = document.getElementById('log-entries');
    const el = document.createElement('div');
    el.className = `log-entry ${cls}`;
    el.textContent = `[${ts()}] ${text}`;
    entries.insertBefore(el, entries.firstChild);

    // Keep max 30 entries
    while (entries.children.length > 30) entries.removeChild(entries.lastChild);
}

function updateTrust() {
    const el = document.getElementById('trust-display');
    el.textContent = trustScore;
    if (trustScore >= 75) { el.className = 'trust-val'; }
    else if (trustScore >= 40) { el.className = 'trust-val warn'; }
    else { el.className = 'trust-val danger'; }
}

let bannerTimeout = null;
function showBanner(msg) {
    const b = document.getElementById('anomaly-banner');
    document.getElementById('anomaly-text').textContent = msg;
    b.classList.remove('hidden');
    if (bannerTimeout) clearTimeout(bannerTimeout);
    bannerTimeout = setTimeout(() => b.classList.add('hidden'), 4000);
}

// ─── END INTERVIEW ────────────────────────────────────────────────────────────
function confirmEndInterview() {
    document.getElementById('modal-end').classList.remove('hidden');
}
function closeModal() {
    document.getElementById('modal-end').classList.add('hidden');
}

async function submitAndEnd() {
    closeModal();
    stopStrictVisionProctoring();
    window.removeEventListener('blur', onWindowBlur);
    document.removeEventListener('visibilitychange', onVisibilityChange);

    // Collect all answers
    const codeAnswers = {};
    const mcqAnswers  = {};
    questions.forEach((q, i) => {
        const ans = answers[q._id];
        if (q.type === 'mcq') mcqAnswers[q._id] = ans;
        else codeAnswers[q._id] = ans || '';
    });

    // Save to backend
    if (currentInterview) {
        try {
            await fetch(`${API}/api/interviews/${currentInterview}/end`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ codeAnswers, mcqAnswers })
            });

            // Save trust score
            await fetch(`${API}/api/candidates/${currentUser._id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trust_score: trustScore })
            });
        } catch(e) { console.warn('Submit error:', e); }
    }

    // Stop timer
    if (timerInterval) clearInterval(timerInterval);
    examActive = false;

    // Disconnect sockets & Peer connections
    if (proctorSocket) proctorSocket.disconnect();
    if (signalingSocket) signalingSocket.disconnect();
    if (peerConnection) peerConnection.destroy();

    // Show done screen
    showScreen('screen-done');

    // Release kiosk and quit Electron
    if (window.electronAPI) {
        window.electronAPI.endInterview();
    }

    // Countdown
    let count = 5;
    const countEl = document.getElementById('close-countdown');
    const iv = setInterval(() => {
        count--;
        if (countEl) countEl.textContent = count;
        if (count <= 0) { clearInterval(iv); window.close(); }
    }, 1000);
}

// ─── AUTO-SESSION & BOOTSTRAP ────────────────────────────────────────────────
async function loginCandidateDirectly(username, interviewId) {
    try {
        const res = await fetch(`${API}/api/candidates`);
        if (!res.ok) throw new Error('Could not fetch candidate details');
        const list = await res.json();
        const cand = list.find(c => c.username === username);
        if (!cand) throw new Error(`Candidate "${username}" not found.`);

        currentUser = cand;
        currentInterview = interviewId || cand.interview_id || cand.interviewId;

        if (currentInterview) {
            try {
                const intRes = await fetch(`${API}/api/interviews/${currentInterview}`);
                if (intRes.ok) {
                    const intData = await intRes.json();
                    questions = intData.questions || [];
                }
            } catch {}
        }

        document.getElementById('candidate-name').textContent = cand.fullname || cand.username;
        showScreen('screen-syscheck');
        runSystemChecks();
    } catch (e) {
        console.warn('Auto-login failed, falling back to manual login screen:', e.message);
        showScreen('screen-login');
    }
}

async function bootTerminal() {
    let session = null;
    if (window.electronAPI && window.electronAPI.getSessionArgs) {
        try {
            session = await window.electronAPI.getSessionArgs();
        } catch {}
    }

    const params = new URLSearchParams(window.location.search);
    const userFromUrl = params.get('user') || params.get('username');
    const interviewFromUrl = params.get('interview') || params.get('interviewId');

    const username = session?.username || userFromUrl;
    const interviewId = session?.interviewId || interviewFromUrl;

    if (username) {
        console.log(`[BOOT] Auto-authenticating candidate: "${username}"`);
        await loginCandidateDirectly(username, interviewId);
        return;
    }

    // Check backend active session cache
    try {
        const res = await fetch(`${API}/api/candidate/active-session`);
        if (res.ok) {
            const data = await res.json();
            if (data.active && data.session?.username) {
                console.log(`[BOOT] Auto-authenticating from backend active session: "${data.session.username}"`);
                await loginCandidateDirectly(data.session.username, data.session.interviewId);
                return;
            }
        }
    } catch {}

    // Default to login screen
    showScreen('screen-login');
}

bootTerminal();
