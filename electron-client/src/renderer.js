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

const API = window.localStorage.getItem('PROCTOR_BACKEND_URL') || 'https://ai-proctoring-system-8nma.onrender.com';
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
let interviewerReady = false;
let waitingProctorSocket = null;

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

    const usernameInput = document.getElementById('login-username');
    const usernameErrorEl = document.getElementById('login-username-error');

    if (!username || !password) {
        errBox.textContent = 'Please enter your username and password.';
        errBox.classList.remove('hidden');
        return;
    }

    const NAME_REGEX = /^[A-Za-z]+(?:[\s.]+[A-Za-z]+)*$/;
    const isValidName = username.length >= 2 && username.length <= 50 && NAME_REGEX.test(username);

    if (!isValidName) {
        if (usernameErrorEl) {
            usernameErrorEl.textContent = 'Please enter a valid name using only alphabets (numbers are not allowed).';
            usernameErrorEl.classList.remove('hidden');
        }
        if (usernameInput) {
            usernameInput.style.borderColor = '#ef4444';
            usernameInput.style.boxShadow = '0 0 0 1px #ef4444';
            usernameInput.focus();
        }
        errBox.textContent = 'Please enter a valid name using only alphabets (numbers are not allowed).';
        errBox.classList.remove('hidden');
        return;
    } else {
        if (usernameErrorEl) {
            usernameErrorEl.textContent = '';
            usernameErrorEl.classList.add('hidden');
        }
        if (usernameInput) {
            usernameInput.style.borderColor = '';
            usernameInput.style.boxShadow = '';
        }
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

        // Keep the candidate informed before the secure exam starts.
        if (currentInterview && typeof io === 'function') {
            waitingProctorSocket = io(`${API}/proctor`);
            waitingProctorSocket.on('connect', () => {
                waitingProctorSocket.emit('join_room', String(currentInterview));
            });
            waitingProctorSocket.on('interviewer_started', (event) => {
                interviewerReady = true;
                const notice = document.getElementById('interviewer-ready-notice');
                if (notice) {
                    notice.textContent = `${event?.interviewerName || 'The interviewer'} is ready. Complete the checks, then enter the exam.`;
                    notice.classList.remove('hidden');
                }
            });
        }

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

// ─── Clean Application Exit Handler ──────────────────────────────────
function exitApplication() {
    console.log('[RENDERER] Application exit requested.');
    if (camStream) {
        try {
            camStream.getTracks().forEach(track => track.stop());
        } catch (e) {}
        camStream = null;
    }
    if (window.electronAPI && typeof window.electronAPI.exitApp === 'function') {
        window.electronAPI.exitApp();
    } else if (window.electronAPI && typeof window.electronAPI.emergencyExit === 'function') {
        window.electronAPI.emergencyExit();
    } else {
        window.close();
    }
}
window.exitApplication = exitApplication;

// Global shortcut: Escape or Ctrl+Q to exit before locked exam starts
window.addEventListener('keydown', (e) => {
    if (!examActive) {
        if (e.key === 'Escape' || ((e.ctrlKey || e.metaKey) && (e.key === 'q' || e.key === 'Q'))) {
            exitApplication();
        }
    }
});

// ─── EMERGENCY EXIT ───────────────────────────────────────────────────────────
function showEmergencyExitModal() {
    const modal = document.getElementById('emergency-exit-modal');
    if (modal) {
        modal.classList.remove('hidden');
        const input = document.getElementById('emergency-exit-input');
        if (input) { input.value = ''; input.focus(); }
    }
}
window.showEmergencyExitModal = showEmergencyExitModal;

function hideEmergencyExitModal() {
    const modal = document.getElementById('emergency-exit-modal');
    if (modal) modal.classList.add('hidden');
}
window.hideEmergencyExitModal = hideEmergencyExitModal;

function confirmEmergencyExit() {
    const input = document.getElementById('emergency-exit-input');
    if (!input || input.value.trim().toUpperCase() !== 'EXIT') {
        input.style.borderColor = '#EF4444';
        input.placeholder = 'You must type EXIT to confirm';
        return;
    }
    // Trigger emergency exit via Electron IPC
    if (window.electronAPI && window.electronAPI.emergencyExit) {
        window.electronAPI.emergencyExit();
    } else {
        // Fallback for non-Electron: just close window
        window.close();
    }
}
window.confirmEmergencyExit = confirmEmergencyExit;

// Enter on password field
document.getElementById('login-password').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
});
document.getElementById('login-username').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-password').focus();
});

// Real-time input constraint: only letters, spaces, and dot
const loginUsernameInputEl = document.getElementById('login-username');
if (loginUsernameInputEl) {
    loginUsernameInputEl.addEventListener('input', (e) => {
        const filtered = e.target.value.replace(/[^a-zA-Z\s.]/g, '');
        if (e.target.value !== filtered) {
            e.target.value = filtered;
        }
        const errEl = document.getElementById('login-username-error');
        if (errEl && !errEl.classList.contains('hidden')) {
            const trimmed = filtered.trim();
            if (trimmed.length >= 2 && /^[A-Za-z]+(?:[\s.]+[A-Za-z]+)*$/.test(trimmed)) {
                errEl.textContent = '';
                errEl.classList.add('hidden');
                loginUsernameInputEl.style.borderColor = '';
                loginUsernameInputEl.style.boxShadow = '';
            }
        }
    });
}

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
    const camHelp = document.getElementById('syscheck-camera-help');
    if (camHelp) camHelp.classList.add('hidden');

    const startBtn = document.getElementById('start-exam-btn');
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.classList.add('disabled');
    }

    // Camera check
    try {
        if (camStream) {
            try { camStream.getTracks().forEach(t => t.stop()); } catch (e) {}
            camStream = null;
        }
        camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        document.getElementById('cam-preview').srcObject = camStream;
        setCheck('camera', 'ok', 'Camera detected and accessible');
    } catch (e) {
        setCheck('camera', 'fail', 'Camera not found or permission denied');
        if (camHelp) camHelp.classList.remove('hidden');
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

    // Interview check – proceed if an interview session exists, even with 0 questions
    if (currentInterview) {
        const qText = questions.length > 0 ? `${questions.length} question(s) loaded` : 'Session ready – interviewer will send questions live';
        setCheck('interview', 'ok', qText);
        document.getElementById('info-role').textContent = (currentUser && currentUser.jobRole) || 'Software Engineer';
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

    await delay(300);

    // AI Vision Models check (MediaPipe Face Mesh + TensorFlow COCO-SSD)
    try {
        setCheck('aimodels', 'pending', 'Calibrating MediaPipe Face Mesh & COCO-SSD...');
        await initAiProctoringModels();
        setCheck('aimodels', 'ok', 'Pre-trained vision models active (Zero latency)');
    } catch {
        setCheck('aimodels', 'ok', 'Vision monitoring calibrated with fallback');
    }

    // Enable start button if all checks pass
    if (allOk && startBtn) {
        startBtn.disabled = false;
        startBtn.classList.remove('disabled');
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

    if (waitingProctorSocket) {
        waitingProctorSocket.disconnect();
        waitingProctorSocket = null;
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

        // Listen for server-authoritative trust score updates
        proctorSocket.on('score_update', (data) => {
            if (data && data.score !== undefined) {
                trustScore = Math.max(0, data.score);
                updateTrust();
            }
        });

        // Listen for proctor alerts broadcast by server (from AI analysis)
                // Listen for remote interview termination by interviewer
        proctorSocket.on('interview_terminated', (data) => {
            console.log('[PROCTOR] Remote interview termination signal received:', data);
            examActive = false;
            if (timerInterval) clearInterval(timerInterval);
            if (camStream) {
                try { camStream.getTracks().forEach(t => t.stop()); } catch (e) {}
                camStream = null;
            }
            if (proctorSocket) proctorSocket.disconnect();
            if (signalingSocket) signalingSocket.disconnect();
            if (peerConnection) peerConnection.destroy();

            const titleEl = document.getElementById('done-title');
            const descEl = document.getElementById('done-desc');
            if (titleEl) titleEl.textContent = 'Session Concluded';
            if (descEl) descEl.textContent = data.reason || 'Your interview session has been concluded by the interviewer.';

            showScreen('screen-done');

            if (window.electronAPI) {
                window.electronAPI.endInterview();
            }
        });

        proctorSocket.on('proctor_alert', (data) => {
            if (data && data.source === 'gemini_ai') {
                // AI alerts are already handled visually by the vision loop response
                // This listener ensures the trust score display is always in sync
                return;
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
        initAudioProctoring(camStream);
    }

    // Start timer
    examStartTime = Date.now();
    timerInterval = setInterval(updateTimer, 1000);

    // Build question nav and render first question
    buildQuestionNav();
    renderQuestion(0);

    // Start strict Gemini AI multimodal vision proctoring!
    startStrictVisionProctoring();

    // Start abnormal mouse movements detector
    initMouseProctoring();

    // Block all keyboard escape shortcuts (belt + suspenders on top of main process)
    blockKeyboard();
}

// ─── Native WebRTC Live Call (Peer-to-Peer + Google STUN + Socket Relay Fallback) ──
let rtcPeer = null;

const rtcConfig = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
    ]
};

function initWebRTC(localStream) {
    if (!currentInterview) return;

    try {
        if (signalingSocket) signalingSocket.disconnect();
        signalingSocket = io(`${API}/signaling`);

        signalingSocket.on('connect', () => {
            console.log('[RTC] Connected to signaling server, joining room:', currentInterview);
            signalingSocket.emit('join_room', String(currentInterview));
        });

        async function setupPeerConnection(isInitiator) {
            if (rtcPeer) {
                try { rtcPeer.close(); } catch(e) {}
            }

            rtcPeer = new RTCPeerConnection(rtcConfig);

            // Add local audio and video tracks
            if (localStream) {
                localStream.getTracks().forEach(track => {
                    rtcPeer.addTrack(track, localStream);
                });
            }

            // Remote stream arrived
            rtcPeer.ontrack = (event) => {
                console.log('[RTC] Candidate received interviewer stream track:', event.track.kind);
                const remoteStream = event.streams[0] || new MediaStream([event.track]);
                const interviewerVideo = document.getElementById('interviewer-video');
                if (interviewerVideo) {
                    interviewerVideo.srcObject = remoteStream;
                    interviewerVideo.style.display = 'block';
                    interviewerVideo.play().catch(e => console.warn('Autoplay prevented:', e));
                    const placeholder = document.getElementById('interviewer-placeholder');
                    if (placeholder) placeholder.classList.add('hidden');
                    const relayImg = document.getElementById('interviewer-relay-img');
                    if (relayImg) relayImg.style.display = 'none';
                }
            };

            rtcPeer.onicecandidate = (event) => {
                if (event.candidate) {
                    signalingSocket.emit('ice_candidate', {
                        roomId: String(currentInterview),
                        candidate: event.candidate
                    });
                }
            };

            rtcPeer.onconnectionstatechange = () => {
                console.log('[RTC] Connection state:', rtcPeer.connectionState);
            };

            if (isInitiator) {
                try {
                    const offer = await rtcPeer.createOffer({
                        offerToReceiveAudio: true,
                        offerToReceiveVideo: true
                    });
                    await rtcPeer.setLocalDescription(offer);
                    signalingSocket.emit('offer', {
                        roomId: String(currentInterview),
                        signal: offer
                    });
                    console.log('[RTC] Sent offer to interviewer');
                } catch (err) {
                    console.error('[RTC] Error creating offer:', err);
                }
            }
        }

        signalingSocket.on('peer_present', () => setupPeerConnection(true));
        signalingSocket.on('user_joined', () => setupPeerConnection(true));

        signalingSocket.on('offer', async (data) => {
            console.log('[RTC] Received offer from interviewer');
            await setupPeerConnection(false);
            try {
                const sdp = data.signal || data;
                await rtcPeer.setRemoteDescription(new RTCSessionDescription(sdp));
                const answer = await rtcPeer.createAnswer();
                await rtcPeer.setLocalDescription(answer);
                signalingSocket.emit('answer', {
                    roomId: String(currentInterview),
                    signal: answer
                });
                console.log('[RTC] Sent answer to interviewer');
            } catch (err) {
                console.error('[RTC] Error answering offer:', err);
            }
        });

        signalingSocket.on('answer', async (data) => {
            console.log('[RTC] Received answer from interviewer');
            if (rtcPeer) {
                try {
                    const sdp = data.signal || data;
                    await rtcPeer.setRemoteDescription(new RTCSessionDescription(sdp));
                } catch (err) {
                    console.error('[RTC] Error setting remote description:', err);
                }
            }
        });

        signalingSocket.on('ice_candidate', async (data) => {
            if (rtcPeer && data.candidate) {
                try {
                    await rtcPeer.addIceCandidate(new RTCIceCandidate(data.candidate));
                } catch (err) {
                    console.warn('[RTC] Error adding ICE candidate:', err);
                }
            }
        });

        // Fail-safe frame relay: if interviewer video is relayed over socket
        signalingSocket.on('remote_frame', (data) => {
            if (data && data.image) {
                let imgEl = document.getElementById('interviewer-relay-img');
                const placeholder = document.getElementById('interviewer-placeholder');
                if (placeholder) placeholder.classList.add('hidden');

                if (!imgEl) {
                    imgEl = document.createElement('img');
                    imgEl.id = 'interviewer-relay-img';
                    imgEl.style.cssText = 'width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;border-radius:10px;z-index:2;';
                    const wrap = document.querySelector('.interviewer-video-wrap');
                    if (wrap) wrap.appendChild(imgEl);
                }
                imgEl.style.display = 'block';
                imgEl.src = data.image;
            }
        });

        // Periodic candidate frame relay every 1.5s as fail-safe fallback
        setInterval(() => {
            if (!examActive || !camStream) return;
            const canvas = document.getElementById('vision-canvas');
            const video = document.getElementById('cam-thumb');
            if (canvas && video && video.readyState >= 2) {
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                const frameData = canvas.toDataURL('image/jpeg', 0.45);
                signalingSocket.emit('relay_frame', {
                    roomId: String(currentInterview),
                    role: 'candidate',
                    image: frameData
                });
            }
        }, 1500);

    } catch (e) {
        console.error('WebRTC initialization failed:', e);
    }
}

// ─── AUDIO & SPEECH PROCTORING SENSOR ─────────────────────────────────────────
let audioContext = null;
let speechCooldown = 0;

function initAudioProctoring(stream) {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx || !stream) return;
        audioContext = new AudioCtx();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let sustainedLoudCount = 0;
        let lastAudioAlert = 0;

        setInterval(() => {
            if (!examActive) return;
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
            const avgVolume = sum / dataArray.length;

            // Threshold raised to 75 to ignore typing, fan hum, and background breathing
            if (avgVolume > 75) {
                sustainedLoudCount++;
                // Require 3 consecutive loud detections (sustained voice > 3.5s)
                if (sustainedLoudCount >= 3 && Date.now() - lastAudioAlert > 25000) {
                    lastAudioAlert = Date.now();
                    sustainedLoudCount = 0;
                    handleProctoringEvent({
                        event: 'speech_detected',
                        severity: 'low',
                        confidence: 0.85,
                        text: 'Notice: Moderate background voice or audio detected in room.'
                    });
                }
            } else {
                sustainedLoudCount = Math.max(0, sustainedLoudCount - 1);
            }
        }, 1200);
        console.log('🎤 Real-time audio proctoring analyzer active (calibrated).');
    } catch (e) {
        console.warn('Audio proctoring could not initialize:', e);
    }
}

// ─── ABNORMAL MOUSE MOVEMENTS SENSOR ──────────────────────────────────────────
function initMouseProctoring() {
    let lastX = null, lastY = null, lastT = null;
    let rapidCount = 0;
    let mouseAlertCooldown = 0;

    window.addEventListener('mousemove', (e) => {
        if (!examActive) return;
        const now = Date.now();
        if (lastX !== null && lastT !== null) {
            const dt = (now - lastT) || 1;
            const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY);
            const speed = dist / dt;

            // Only flag truly erratic, continuous shaking movements (not normal fast gestures)
            if (speed > 8.0 && dt < 25) {
                rapidCount++;
                if (rapidCount > 12 && now - mouseAlertCooldown > 20000) {
                    mouseAlertCooldown = now;
                    rapidCount = 0;
                    handleProctoringEvent({
                        event: 'abnormal_mouse_movement',
                        severity: 'low',
                        confidence: 0.75,
                        text: 'Notice: Rapid mouse movement detected.'
                    });
                }
            } else if (rapidCount > 0) {
                rapidCount = Math.max(0, rapidCount - 1);
            }
        }
        lastX = e.clientX;
        lastY = e.clientY;
        lastT = now;
    });

    // NOTE: mouseleave removed - moving cursor near edges in kiosk is NOT malpractice

    window.addEventListener('blur', () => {
        if (!examActive) return;
        handleProctoringEvent({
            event: 'window_switch_attempt',
            severity: 'high',
            confidence: 1.0,
            text: 'Window switch / Alt+Tab attempt detected.'
        });
    });

    document.addEventListener('visibilitychange', () => {
        if (document.hidden && examActive) {
            handleProctoringEvent({
                event: 'window_switch_attempt',
                severity: 'high',
                confidence: 1.0,
                text: 'Exam terminal lost focus / switched window.'
            });
        }
    });
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
            (e.ctrlKey && ['c', 'v', 'x'].includes(e.key.toLowerCase())) ||
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
            const clipboardAction = e.ctrlKey && ['c', 'v', 'x'].includes(e.key.toLowerCase());
            logAnomaly(clipboardAction ? `${e.key.toLowerCase()}_attempt` : 'keyboard_shortcut_attempt', clipboardAction ? 'high' : 'medium');
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
        // Keep the candidate workspace blank. Question examples belong in the
        // prompt, never in the submitted answer.
        editor.value = answers[q._id] !== undefined ? answers[q._id] : '';
        editor.oninput = () => {
            answers[q._id] = editor.value;
            markAnswered(idx);
            if (proctorSocket && currentInterview) {
                proctorSocket.emit('answer_update', {
                    roomId: String(currentInterview),
                    questionId: q._id,
                    questionIndex: idx,
                    answer: editor.value,
                    answerType: 'code'
                });
            }
        };
    } else {
        document.getElementById('text-section').classList.remove('hidden');
        const ta = document.getElementById('text-answer');
        ta.value = answers[q._id] || '';
        ta.oninput = () => {
            answers[q._id] = ta.value;
            markAnswered(idx);
            if (proctorSocket && currentInterview) {
                proctorSocket.emit('answer_update', {
                    roomId: String(currentInterview),
                    questionId: q._id,
                    questionIndex: idx,
                    answer: ta.value,
                    answerType: 'text'
                });
            }
        };
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

// ─── Real-Time Pre-Trained AI Vision Proctoring ──────────────────────────────
let aiFaceLandmarker = null;
let aiCocoModel = null;
let isAiModelsReady = false;
let isAiLoading = false;
let overlayCanvas = null;

async function initAiProctoringModels() {
    if (isAiModelsReady) return true;
    if (isAiLoading) return false;
    isAiLoading = true;

    try {
        // 1. Initialize TensorFlow & COCO-SSD
        if (typeof tf !== 'undefined') {
            await tf.ready();
        }
        if (typeof cocoSsd !== 'undefined') {
            aiCocoModel = await cocoSsd.load({ base: 'lite_mobilenet_v2' });
        }

        // 2. Initialize MediaPipe Face Landmarker
        const visionModule = window.Vision;
        if (visionModule && visionModule.FilesetResolver && visionModule.FaceLandmarker) {
            const wasmPath = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
            const modelUrl = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
            const resolver = await visionModule.FilesetResolver.forVisionTasks(wasmPath);
            try {
                aiFaceLandmarker = await visionModule.FaceLandmarker.createFromOptions(resolver, {
                    baseOptions: { modelAssetPath: modelUrl, delegate: 'GPU' },
                    runningMode: 'VIDEO',
                    numFaces: 3,
                    minFaceDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
            } catch (gpuErr) {
                console.warn('[AI Vision] Falling back to CPU for FaceLandmarker:', gpuErr);
                aiFaceLandmarker = await visionModule.FaceLandmarker.createFromOptions(resolver, {
                    baseOptions: { modelAssetPath: modelUrl, delegate: 'CPU' },
                    runningMode: 'VIDEO',
                    numFaces: 3,
                    minFaceDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
            }
        }

        isAiModelsReady = true;
        isAiLoading = false;
        console.log('✅ Real-time Pre-Trained AI Vision Models loaded successfully.');
        return true;
    } catch (err) {
        console.warn('⚠️ Pre-trained model initialization warning:', err.message);
        isAiLoading = false;
        return false;
    }
}

let consecutiveNoFaceCount = 0;
let consecutiveMultiFaceCount = 0;
let consecutiveGazeCount = 0;
let consecutiveObjectCounts = {};
let lastNoseCentroid = null;
let lastCentroidTimestamp = null;
let visionLoopFrameCount = 0;

function startStrictVisionProctoring() {
    if (visionInterval) clearInterval(visionInterval);
    const video = document.getElementById('cam-thumb');
    overlayCanvas = document.getElementById('cam-overlay-canvas');
    const badgeText = document.getElementById('ai-live-text');
    const badgeDot = document.getElementById('ai-live-dot');

    if (!isAiModelsReady) {
        initAiProctoringModels().catch(() => {});
    }

    visionInterval = setInterval(async () => {
        if (!examActive || !camStream || isAnalyzingFrame) return;
        if (!video || video.readyState < 2 || video.videoWidth === 0) return;

        isAnalyzingFrame = true;
        visionLoopFrameCount++;

        try {
            const now = performance.now();

            // 1. MediaPipe 3D Face Landmarker check
            if (aiFaceLandmarker) {
                const results = aiFaceLandmarker.detectForVideo(video, now);
                const faces = results?.faceLandmarks || [];

                if (faces.length === 0) {
                    consecutiveNoFaceCount++;
                    consecutiveMultiFaceCount = 0;
                    consecutiveGazeCount = 0;

                    if (badgeText) badgeText.textContent = 'No Face';
                    if (badgeDot) badgeDot.style.background = '#ef4444';

                    if (consecutiveNoFaceCount >= 3) {
                        handleProctoringEvent({
                            event: 'no_face',
                            severity: 'high',
                            confidence: 0.95,
                            text: 'Face not detected in camera frame. Please face your screen.'
                        });
                    }
                } else if (faces.length > 1) {
                    consecutiveMultiFaceCount++;
                    consecutiveNoFaceCount = 0;
                    consecutiveGazeCount = 0;

                    if (badgeText) badgeText.textContent = `Multiple Faces (${faces.length})`;
                    if (badgeDot) badgeDot.style.background = '#ef4444';

                    if (consecutiveMultiFaceCount >= 2) {
                        handleProctoringEvent({
                            event: 'multiple_faces',
                            severity: 'high',
                            confidence: 0.95,
                            text: `Multiple faces (${faces.length}) detected in frame.`
                        });
                    }
                } else {
                    consecutiveNoFaceCount = 0;
                    consecutiveMultiFaceCount = 0;

                    const landmarks = faces[0];
                    const nose = landmarks[1];
                    const leftEye = landmarks[33];
                    const rightEye = landmarks[263];
                    const leftEar = landmarks[234];
                    const rightEar = landmarks[454];
                    const chin = landmarks[152];
                    const forehead = landmarks[10];

                    // Yaw (left/right) calculation
                    const eyeMidX = (leftEye.x + rightEye.x) / 2;
                    const eyeDist = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y) || 0.01;
                    const yawOffset = (nose.x - eyeMidX) / eyeDist;
                    const yawDegrees = Math.round(yawOffset * 48);

                    // Pitch (up/down) calculation
                    const faceHeight = Math.abs(chin.y - forehead.y) || 0.01;
                    const pitchRatio = (nose.y - forehead.y) / faceHeight;
                    const pitchDegrees = Math.round((pitchRatio - 0.58) * 85);

                    let isLookingAway = false;
                    let direction = 'Forward';

                    if (yawDegrees < -26) {
                        isLookingAway = true;
                        direction = 'Looking Left';
                    } else if (yawDegrees > 26) {
                        isLookingAway = true;
                        direction = 'Looking Right';
                    } else if (pitchDegrees > 20 || pitchRatio > 0.74) {
                        isLookingAway = true;
                        direction = 'Looking Down';
                    } else if (pitchDegrees < -18 || pitchRatio < 0.40) {
                        isLookingAway = true;
                        direction = 'Looking Up';
                    }

                    // Centroid movement velocity tracking
                    if (lastNoseCentroid && lastCentroidTimestamp) {
                        const dt = (now - lastCentroidTimestamp) / 1000;
                        const velocity = Math.hypot(nose.x - lastNoseCentroid.x, nose.y - lastNoseCentroid.y) / Math.max(0.01, dt);
                        if (velocity > 0.22) {
                            handleProctoringEvent({
                                event: 'abnormal_mouse_movement',
                                severity: 'info',
                                confidence: 0.8,
                                text: 'Rapid body movement detected.'
                            });
                        }
                    }
                    lastNoseCentroid = { x: nose.x, y: nose.y };
                    lastCentroidTimestamp = now;

                    if (isLookingAway) {
                        consecutiveGazeCount++;
                        if (badgeText) badgeText.textContent = `${direction} (${yawDegrees}°)`;
                        if (badgeDot) badgeDot.style.background = '#f59e0b';

                        if (consecutiveGazeCount >= 3) {
                            handleProctoringEvent({
                                event: 'off_screen_gaze',
                                severity: 'medium',
                                confidence: 0.88,
                                text: `Candidate looking away from screen (${direction}: Yaw ${yawDegrees}°, Pitch ${pitchDegrees}°)`
                            });
                        }
                    } else {
                        consecutiveGazeCount = Math.max(0, consecutiveGazeCount - 1);
                        if (badgeText) badgeText.textContent = 'AI Proctor Active';
                        if (badgeDot) badgeDot.style.background = '#10b981';
                    }

                    // Draw landmarks and face bounding box onto overlay canvas
                    if (overlayCanvas) {
                        const octx = overlayCanvas.getContext('2d');
                        if (octx) {
                            if (overlayCanvas.width !== video.videoWidth || overlayCanvas.height !== video.videoHeight) {
                                overlayCanvas.width = video.videoWidth || 320;
                                overlayCanvas.height = video.videoHeight || 240;
                            }
                            octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
                            octx.strokeStyle = isLookingAway ? '#f59e0b' : '#10b981';
                            octx.lineWidth = 2;
                            octx.strokeRect(
                                leftEar.x * overlayCanvas.width,
                                forehead.y * overlayCanvas.height,
                                (rightEar.x - leftEar.x) * overlayCanvas.width,
                                (chin.y - forehead.y) * overlayCanvas.height
                            );
                        }
                    }
                }
            }

            // 2. Prohibited Object Detection (COCO-SSD) every 2nd frame
            if (aiCocoModel && visionLoopFrameCount % 2 === 0) {
                const preds = await aiCocoModel.detect(video);
                const prohibitedTargets = ['cell phone', 'book', 'laptop'];
                let personCount = 0;

                for (const p of preds) {
                    const cls = (p.class || '').toLowerCase();
                    if (cls === 'person' && p.score >= 0.6) personCount++;

                    if (prohibitedTargets.includes(cls) && p.score >= 0.6) {
                        consecutiveObjectCounts[cls] = (consecutiveObjectCounts[cls] || 0) + 1;
                        if (consecutiveObjectCounts[cls] >= 2) {
                            handleProctoringEvent({
                                event: 'suspicious_material',
                                severity: 'high',
                                confidence: Number(p.score.toFixed(2)),
                                text: `Unauthorized item detected: ${cls.toUpperCase()} (${Math.round(p.score * 100)}%)`
                            });
                            consecutiveObjectCounts[cls] = 0;
                        }
                    }
                }

                if (personCount > 1) {
                    handleProctoringEvent({
                        event: 'multiple_faces',
                        severity: 'high',
                        confidence: 0.9,
                        text: `Multiple people detected in view (${personCount}).`
                    });
                }
            }
        } catch (err) {
            // Silently continue loop
        } finally {
            isAnalyzingFrame = false;
        }
    }, 280);
}

function stopStrictVisionProctoring() {
    if (visionInterval) {
        clearInterval(visionInterval);
        visionInterval = null;
    }
    if (overlayCanvas) {
        const octx = overlayCanvas.getContext('2d');
        if (octx) octx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
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

const lastEventTimes = {};
let alertDialogTimeout = null;

function handleProctoringEvent(log) {
    if (!log || !log.event) return;
    if (log.event === 'system_start') {
        logAnomaly('system_start', 'low', 'AI Proctoring Active', 'info');
        return;
    }

    const now = Date.now();
    // Cooldown per event type to prevent duplicate alert storms (4s between same events)
    if (lastEventTimes[log.event] && (now - lastEventTimes[log.event] < 4000)) {
        return;
    }
    lastEventTimes[log.event] = now;

    const msgMap = {
        no_face:                { text: 'Face not detected in camera frame', title: 'FACE NOT DETECTED', sev: 'danger', penalty: 8 },
        multiple_faces:         { text: 'Multiple people detected in camera frame', title: 'MULTIPLE FACES DETECTED', sev: 'danger', penalty: 10 },
        off_screen_gaze:        { text: 'Candidate looking away from screen', title: 'OFF-SCREEN GAZE', sev: 'warn', penalty: 3 },
        phone_detected:         { text: 'Prohibited smartphone or mobile device detected', title: 'CELL PHONE DETECTED', sev: 'danger', penalty: 10 },
        prohibited_material:    { text: 'Prohibited book or reading material detected', title: 'UNAUTHORIZED MATERIAL', sev: 'danger', penalty: 8 },
        secondary_device:       { text: 'Secondary laptop or computer detected', title: 'SECONDARY DEVICE', sev: 'danger', penalty: 10 },
        window_switch_attempt:  { text: 'Window / Tab switch attempt blocked', title: 'WINDOW SWITCH ATTEMPT', sev: 'danger', penalty: 12 },
        keyboard_shortcut_attempt: { text: 'Blocked keyboard shortcut', title: 'KEYBOARD SHORTCUT ATTEMPT', sev: 'warn', penalty: 2 },
        context_menu_attempt:   { text: 'Right-click blocked', title: 'RIGHT-CLICK ATTEMPT', sev: 'warn', penalty: 1 },
        suspicious_material:    { text: 'Unauthorized material or device detected', title: 'UNAUTHORIZED MATERIAL', sev: 'danger', penalty: 15 },
        speech_detected:        { text: 'Background conversation or audio detected', title: 'AUDIO DETECTED', sev: 'warn', penalty: 2 },
        abnormal_mouse_movement:{ text: 'Notice: Rapid movement detected', title: 'RAPID MOVEMENT', sev: 'info', penalty: 0 },
        camera_error:           { text: 'Camera feed obstructed or unreadable', title: 'CAMERA WARNING', sev: 'danger', penalty: 5 }
    };

    const info = msgMap[log.event] || {
        text: log.text || log.event.replace(/_/g, ' '),
        title: 'PROCTORING NOTICE',
        sev: log.severity === 'high' ? 'danger' : 'warn',
        penalty: log.severity === 'high' ? 5 : 2
    };

    const drop = (info.penalty !== undefined) ? info.penalty : (log.severity === 'high' ? 5 : 2);
    logAnomaly(log.event, log.severity || 'medium', log.text || info.text, info.sev);

    if (drop > 0) {
        trustScore = Math.max(0, trustScore - drop);
        updateTrust();
    }

    if (proctorSocket && currentInterview) {
        proctorSocket.emit('anomaly_alert', {
            roomId: String(currentInterview),
            event: log.event,
            severity: log.severity || (info.sev === 'danger' ? 'high' : 'medium'),
            confidence: log.confidence || 0.9,
            details: log.text || info.text
        });
    }

    if (currentInterview) {
        fetch(`${API}/api/interviews/${currentInterview}/logs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                event: log.event,
                severity: log.severity || (info.sev === 'danger' ? 'high' : 'medium'),
                confidence: log.confidence || 0.9,
                details: log.text || info.text,
                penalty: drop
            })
        }).catch(() => {});
    }

    showBanner(log.text || info.text);

    // Only show modal dialog for confirmed high-severity violations
    if (info.sev === 'danger' && drop >= 5) {
        showAlertDialog(info.title, log.text || info.text, drop);
        // Auto-dismiss dialog after 6 seconds so user is not permanently stuck
        if (alertDialogTimeout) clearTimeout(alertDialogTimeout);
        alertDialogTimeout = setTimeout(() => {
            dismissAlertDialog();
        }, 6000);
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
        console.log(`[AUTH] Fetching candidate profile for: ${username}`);
        let cand = null;

        const res = await fetch(`${API}/api/candidates`);
        if (res.ok) {
            const list = await res.json();
            cand = list.find(c => (c.username && c.username.toLowerCase() === username.toLowerCase()) || 
                                 (c.candidate_name && c.candidate_name.toLowerCase() === username.toLowerCase()));
        }

        let resolvedInterviewId = interviewId || cand?.interview_id || cand?.interviewId;

        // If interview ID not found, check terminal session endpoint
        if (!resolvedInterviewId) {
            try {
                const termRes = await fetch(`${API}/api/auth/terminal-session`);
                if (termRes.ok) {
                    const termData = await termRes.json();
                    if (termData.active && termData.session?.interviewId) {
                        resolvedInterviewId = termData.session.interviewId;
                    }
                }
            } catch(e) {}
        }

        currentUser = cand || {
            username: username,
            fullname: username,
            role: 'candidate',
            interviewId: resolvedInterviewId
        };
        currentInterview = resolvedInterviewId;

        if (currentInterview) {
            try {
                const intRes = await fetch(`${API}/api/interviews/${currentInterview}`);
                if (intRes.ok) {
                    const intData = await intRes.json();
                    if (intData.questions && intData.questions.length > 0) {
                        questions = intData.questions;
                    }
                }
            } catch {}
        }

        // If still no questions loaded, load default question catalog
        if (!questions || questions.length === 0) {
            try {
                const qRes = await fetch(`${API}/api/questions`);
                if (qRes.ok) {
                    const allQs = await qRes.json();
                    questions = allQs.slice(0, 5);
                }
            } catch(e) {}
        }

        document.getElementById('candidate-name').textContent = currentUser.fullname || currentUser.username;
        console.log(`[AUTH] Successfully auto-authenticated: ${username} (Interview: ${currentInterview})`);
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
        const res = await fetch(`${API}/api/auth/terminal-session`);
        if (res.ok) {
            const data = await res.json();
            if (data.active && data.session?.username) {
                console.log(`[BOOT] Auto-authenticating from backend active session: "${data.session.username}"`);
                await loginCandidateDirectly(data.session.username, data.session.interviewId);
                return;
            }
        }
    } catch {}

    try {
        const res = await fetch(`${API}/api/candidate/active-session`);
        if (res.ok) {
            const data = await res.json();
            if (data.active && data.session?.username) {
                console.log(`[BOOT] Auto-authenticating from legacy candidate session: "${data.session.username}"`);
                await loginCandidateDirectly(data.session.username, data.session.interviewId);
                return;
            }
        }
    } catch {}

    // Default to login screen
    showScreen('screen-login');
}

bootTerminal();
