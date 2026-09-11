const { app, BrowserWindow, globalShortcut, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let aiProcess;
let isKioskMode = false;
let examActive = false;

// ─── Custom OS Protocol Registration & Utilities ──────────────────────────────
if (process.defaultApp) {
    if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('proctorai', process.execPath, [path.resolve(process.argv[1])]);
    }
} else {
    app.setAsDefaultProtocolClient('proctorai');
}

let allowedHost = 'localhost:5000';

function getProtocolUrl(argv) {
    const url = argv.find(arg => arg.startsWith('proctorai://'));
    return url;
}

function getWebUrlFromProtocol(protocolUrl) {
    if (!protocolUrl) return 'http://localhost:5173/';
    try {
        const urlObj = new URL(protocolUrl);
        const searchParams = new URLSearchParams(urlObj.search);
        const hostParam = searchParams.get('host');
        let baseHost = 'http://localhost:5173';
        if (hostParam) {
            baseHost = hostParam;
            try {
                const hostUrl = new URL(hostParam);
                allowedHost = hostUrl.host;
            } catch (err) {
                console.error('[PROTOCOL] Failed to parse hostParam:', hostParam);
            }
        }
        searchParams.delete('host');
        searchParams.set('autostart', 'true');
        const targetUrl = `${baseHost}/?${searchParams.toString()}`;
        console.log(`[PROTOCOL] Generated URL: ${targetUrl}, allowedHost: ${allowedHost}`);
        return targetUrl;
    } catch (e) {
        console.error('[PROTOCOL] Failed to parse protocol URL:', e);
        return 'http://localhost:5173/?autostart=true';
    }
}

function getCommandLineSession(argv = []) {
    let username = null;
    let interviewId = null;
    argv.forEach(arg => {
        if (arg.startsWith('--user=')) {
            username = arg.replace('--user=', '').replace(/"/g, '').trim();
        }
        if (arg.startsWith('--interview=')) {
            interviewId = arg.replace('--interview=', '').replace(/"/g, '').trim();
        }
        if (arg.startsWith('proctorai://')) {
            try {
                const u = new URL(arg);
                username = u.searchParams.get('username') || u.searchParams.get('user');
                interviewId = u.searchParams.get('interviewId') || u.searchParams.get('interview');
            } catch {}
        }
    });
    return { username, interviewId };
}

ipcMain.handle('get-session-args', () => {
    return getCommandLineSession(process.argv);
});

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
    console.log('[SYSTEM] Another instance is running. Quitting.');
    app.quit();
} else {
    app.on('second-instance', (event, commandLine) => {
        if (mainWindow) {
            if (mainWindow.isMinimized()) mainWindow.restore();
            mainWindow.focus();
            
            const session = getCommandLineSession(commandLine);
            if (session.username) {
                mainWindow.webContents.send('cli-session-received', session);
            }
        }
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 1024,
        minHeight: 680,
        fullscreen: true,        // Open full-screen from the very first launch
        kiosk: false,
        alwaysOnTop: false,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            webSecurity: false,   // allow local file to call localhost:5000 API
            devTools: process.env.NODE_ENV !== 'production'
        },
        title: 'ProctorAI — Secure Exam Terminal',
        backgroundColor: '#050d1a',
    });

    // Remove default application menu
    Menu.setApplicationMenu(null);

    // Auto-approve webcam / media permissions inside Electron
    mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
        if (permission === 'media') return true;
        return false;
    });
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
        if (permission === 'media') return callback(true);
        return callback(false);
    });

    // Automatically close DevTools if opened during exam mode
    mainWindow.webContents.on('devtools-opened', () => {
        if (examActive) {
            mainWindow.webContents.closeDevTools();
        }
    });

    // Load the self-contained candidate exam UI with CLI session query parameters
    const examPage = path.join(__dirname, 'src', 'index.html');
    const initialSession = getCommandLineSession(process.argv);
    const queryParams = {};
    if (initialSession.username) queryParams.user = initialSession.username;
    if (initialSession.interviewId) queryParams.interview = initialSession.interviewId;

    mainWindow.loadFile(examPage, { query: queryParams }).catch(err => {
        console.error('Failed to load exam page:', err.message);
    });
    console.log('[BOOT] Loading secure exam terminal with session:', initialSession);

    // Handle window blur — block alt-tab aggressively during exam
    let blurInterval = null;
    mainWindow.on('blur', () => {
        if (examActive && mainWindow) {
            // Keep window on top and steal focus repeatedly
            blurInterval = setInterval(() => {
                if (mainWindow && !mainWindow.isFocused()) {
                    mainWindow.focus();
                    mainWindow.setAlwaysOnTop(true, 'screen-saver');
                } else if (blurInterval) {
                    clearInterval(blurInterval);
                    blurInterval = null;
                }
            }, 50);

            mainWindow.webContents.send('ai-log', {
                event: 'window_switch_attempt',
                severity: 'high',
                confidence: 1.0
            });
        }
    });

    mainWindow.on('focus', () => {
        if (blurInterval) {
            clearInterval(blurInterval);
            blurInterval = null;
        }
    });

    // Prevent minimizing during exam
    mainWindow.on('minimize', (event) => {
        if (examActive) {
            event.preventDefault();
            mainWindow.restore();
            mainWindow.focus();
        }
    });

    // Block new window popups
    mainWindow.webContents.setWindowOpenHandler(() => {
        return { action: 'deny' };
    });

    // Block navigation away from app during exam
    mainWindow.webContents.on('will-navigate', (event, url) => {
        const allowed = url.startsWith('file://') ||
                        url.includes('localhost:5000') ||
                        url.includes('127.0.0.1:5000');
        if (examActive && !allowed) {
            event.preventDefault();
            mainWindow.webContents.send('ai-log', {
                event: 'window_switch_attempt',
                severity: 'high',
                confidence: 1.0
            });
        }
    });

    mainWindow.on('close', (event) => {
        // Block closing during exam
        if (examActive) {
            event.preventDefault();
            mainWindow.webContents.send('ai-log', {
                event: 'window_switch_attempt',
                severity: 'high',
                confidence: 1.0
            });
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function registerExamShortcuts() {
    // Block ALL escape routes during exam
    const blockedShortcuts = [
        'Alt+F4',
        'CommandOrControl+W',
        'CommandOrControl+Q',
        'CommandOrControl+R',
        'CommandOrControl+Shift+R',
        'CommandOrControl+C',
        'CommandOrControl+V',
        'CommandOrControl+A',
        'CommandOrControl+X',
        'CommandOrControl+Z',
        'CommandOrControl+Tab',
        'CommandOrControl+Shift+Tab',
        'Alt+Tab',
        'Super+Tab',
        'Escape',
        'F5',
        'F11',
        'F12',
        'CommandOrControl+Shift+I',    // DevTools
        'CommandOrControl+Shift+J',    // DevTools
        'CommandOrControl+F',          // Find
        'CommandOrControl+G',          // FindNext
    ];

    blockedShortcuts.forEach(shortcut => {
        try {
            globalShortcut.register(shortcut, () => {
                console.log(`[SECURITY] Blocked shortcut: ${shortcut}`);
                if (mainWindow) {
                    mainWindow.webContents.send('ai-log', {
                        event: 'window_switch_attempt',
                        severity: shortcut.includes('Alt') || shortcut.includes('F4') ? 'high' : 'medium',
                        confidence: 1.0
                    });
                }
            });
        } catch (e) {
            // Some shortcuts may not be registerable on all platforms
            console.warn(`Could not register shortcut: ${shortcut}`);
        }
    });
    console.log('✅ Exam security shortcuts registered.');
}

function unregisterExamShortcuts() {
    globalShortcut.unregisterAll();
    console.log('Exam shortcuts unregistered.');
}

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('will-quit', () => {
    unregisterExamShortcuts();
    if (aiProcess) {
        aiProcess.kill();
        aiProcess = null;
    }
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});

// ─── IPC: Start AI Engine (called when candidate starts exam) ────────────
ipcMain.on('start-ai-engine', (event, { mock }) => {
    examActive = true;
    isKioskMode = true;

    if (mainWindow) {
        // Hide, apply kiosk/fullscreen properties, and show to force Windows OS-level style update
        mainWindow.hide();
        mainWindow.setFullScreen(true);
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.setKiosk(true);
        mainWindow.setResizable(false);
        mainWindow.setMovable(false);
        mainWindow.setMinimizable(false);
        mainWindow.setMaximizable(false);
        mainWindow.setClosable(false);
        mainWindow.show();
        mainWindow.focus();
        console.log('🔒 Kiosk mode activated and refreshed. Exam in progress.');
    }

    // Register all security shortcuts
    registerExamShortcuts();

    // Start AI engine
    if (aiProcess) {
        console.log('AI Engine already running.');
        return;
    }

    const scriptPath = path.join(__dirname, 'ai-engine', 'proctor.py');
    // Always use mock mode when explicitly requested
    const runMock = mock || false;

    // Try multiple Python executable names (python3 → python → py)
    // If none work, auto-start in mock mode
    const pythonCandidates = ['python3', 'python', 'py'];

    function trySpawnPython(candidates, isMock) {
        if (candidates.length === 0) {
            // No Python found — auto-start mock mode via a self-contained JS loop
            console.warn('⚠️  Python not found. AI proctoring engine running in MOCK mode.');
            console.warn('   Install Python to enable real face/gaze detection.');
            startMockAiEngine();
            return;
        }

        const executable = candidates[0];
        const remaining = candidates.slice(1);
        const spawnArgs = isMock ? [scriptPath, '--mock'] : [scriptPath];

        const proc = spawn(executable, spawnArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

        proc.on('error', (err) => {
            // This executable not found — try next one
            console.log(`[AI Engine] "${executable}" not available: ${err.message}`);
            trySpawnPython(remaining, isMock);
        });

        proc.stdout.on('data', (data) => {
            const lines = data.toString().split('\n');
            lines.forEach(line => {
                line = line.trim();
                if (line) {
                    try {
                        const parsed = JSON.parse(line);
                        if (mainWindow) mainWindow.webContents.send('ai-log', parsed);
                    } catch (e) {
                        console.log('AI output:', line);
                    }
                }
            });
        });

        proc.stderr.on('data', (data) => {
            const errMsg = data.toString().trim();
            if (!errMsg) return;

            // If Python isn't actually found (Windows gives a specific error), try next
            if (errMsg.includes('was not found') || errMsg.includes('cannot find') || errMsg.includes('No such file')) {
                proc.removeAllListeners();
                trySpawnPython(remaining, isMock);
                return;
            }

            console.error('AI Engine stderr:', errMsg);
            if (mainWindow) {
                if (errMsg.includes('camera') || errMsg.includes('webcam') || errMsg.includes('VideoCapture')) {
                    mainWindow.webContents.send('ai-log', { event: 'camera_error', severity: 'medium', confidence: 1.0 });
                } else if (errMsg.includes('import') || errMsg.includes('ModuleNotFoundError')) {
                    mainWindow.webContents.send('ai-log', { event: 'dependency_error', severity: 'low', confidence: 1.0 });
                }
            }
        });

        proc.on('close', (code) => {
            console.log(`AI Engine process exited with code ${code}`);
            aiProcess = null;
        });

        // Mark as confirmed running
        aiProcess = proc;
        console.log(`🤖 AI Engine started via "${executable}" (mock=${isMock})`);
    }

    // Pure JS mock engine — emits random events, no Python needed
    function startMockAiEngine() {
        const mockEvents = [
            { event: 'system_start', severity: 'low', confidence: 1.0 },
        ];
        if (mainWindow) mainWindow.webContents.send('ai-log', mockEvents[0]);

        const eventPool = [
            { event: 'no_face', severity: 'high', confidence: 0.9 },
            { event: 'multiple_faces', severity: 'high', confidence: 0.95 },
            { event: 'off_screen_gaze', severity: 'medium', confidence: 0.85 },
        ];

        let mockIntervalId = null;
        const scheduleMockEvent = () => {
            const delay = 8000 + Math.random() * 12000; // 8–20 seconds
            mockIntervalId = setTimeout(() => {
                if (!examActive) return;
                const evt = eventPool[Math.floor(Math.random() * eventPool.length)];
                if (mainWindow) mainWindow.webContents.send('ai-log', evt);
                scheduleMockEvent();
            }, delay);
        };

        scheduleMockEvent();

        // Store cleanup reference
        aiProcess = {
            kill: () => { if (mockIntervalId) clearTimeout(mockIntervalId); mockIntervalId = null; }
        };
    }

    trySpawnPython(pythonCandidates, runMock);
});

// ─── IPC: End Interview (called when candidate submits answers) ───────────────
ipcMain.on('end-interview', () => {
    console.log('📋 Interview ended. Releasing kiosk mode.');
    examActive = false;
    isKioskMode = false;

    if (mainWindow) {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setResizable(true);
        mainWindow.setMovable(true);
        mainWindow.setMinimizable(true);
        mainWindow.setMaximizable(true);
        mainWindow.setClosable(true);
    }

    // Unregister security shortcuts
    unregisterExamShortcuts();

    // Stop AI process
    if (aiProcess) {
        aiProcess.kill();
        aiProcess = null;
    }

    // Quit app after brief delay
    setTimeout(() => {
        if (app) app.quit();
    }, 500);
});
