# start-all.ps1  -  ProctorAI Enterprise Startup Script
# ====================================================================

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "ProctorAI - Startup"

function Write-Header($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-OK($msg)     { Write-Host "  [OK] $msg"    -ForegroundColor Green }
function Write-WARN($msg)   { Write-Host "  [WARN] $msg"  -ForegroundColor Yellow }
function Write-ERR($msg)    { Write-Host "  [ERROR] $msg" -ForegroundColor Red }
function Write-INFO($msg)   { Write-Host "  [INFO] $msg"  -ForegroundColor Gray }

Clear-Host
Write-Host ""
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host "          ProctorAI Enterprise Platform  v2.0              " -ForegroundColor Cyan
Write-Host "          AI-Powered Technical Interview System             " -ForegroundColor Cyan
Write-Host "===========================================================" -ForegroundColor Cyan
Write-Host ""

$baseDir = $PSScriptRoot

# -- Step 0: Kill stale processes on ports 5000 and 5173 ---------------
Write-Header "Cleaning up old processes..."
try {
    $conn5000 = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
    if ($conn5000) {
        $conn5000.OwningProcess | Select-Object -Unique | ForEach-Object {
            if ($_ -gt 4) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
        }
        Write-INFO "Cleared stale process on port 5000."
    }
} catch { Write-WARN "Could not inspect port 5000: $($_.Exception.Message)" }

try {
    $conn5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
    if ($conn5173) {
        $conn5173.OwningProcess | Select-Object -Unique | ForEach-Object {
            if ($_ -gt 4) { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
        }
        Write-INFO "Cleared stale process on port 5173."
    }
} catch { Write-WARN "Could not inspect port 5173: $($_.Exception.Message)" }

Start-Sleep -Milliseconds 500

# -- Step 1: Check Node.js ---------------------------------------------
Write-Header "Checking Node.js..."

# Ensure standard Node.js installation paths are in the current session PATH
$standardNodePaths = @("C:\Program Files\nodejs", "C:\Program Files (x86)\nodejs")
foreach ($p in $standardNodePaths) {
    if ((Test-Path $p) -and ($env:PATH -split ';' -notcontains $p)) {
        $env:PATH = "$env:PATH;$p"
    }
}

try {
    $nodeVer = & node --version 2>&1
    Write-OK "Node.js: $nodeVer"
} catch {
    Write-ERR "Node.js not found! Install from https://nodejs.org"
    Read-Host "Press Enter to exit"
    exit 1
}

# -- Step 2: Check Python (optional - for real AI proctoring) ----------
Write-Header "Checking Python (for AI proctoring engine)..."
$pythonCmd = $null
$pythonCandidates = @("python3", "python", "py")

foreach ($cmd in $pythonCandidates) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python") {
            $pythonCmd = $cmd
            Write-OK "Python: $ver (using '$cmd')"
            break
        }
    } catch {}
}

if ($null -eq $pythonCmd) {
    Write-WARN "Python not found. AI proctoring will run in MOCK mode (simulated alerts)."
    Write-INFO "  To enable real face/gaze detection, install Python from https://python.org"
    Write-INFO "  Then run: pip install opencv-python mediapipe"
} else {
    # Check if AI packages are installed
    try {
        $cvCheck = & $pythonCmd -c "import cv2, mediapipe; print('ok')" 2>&1
        if ($cvCheck -match "ok") {
            Write-OK "AI packages (opencv-python, mediapipe) ready. Real proctoring enabled."
        } else {
            Write-WARN "AI packages not installed. Proctoring will use MOCK mode."
            Write-INFO "  Run: pip install opencv-python mediapipe"
        }
    } catch {
        Write-WARN "Could not verify AI packages. Proctoring may use MOCK mode."
    }
}

# -- Step 3: Check dependencies ----------------------------------------
Write-Header "Checking dependencies..."

$components = @(
    @{ Name = "Backend";              Path = "$baseDir\backend" },
    @{ Name = "Interviewer Dashboard";Path = "$baseDir\interviewer-dashboard" },
    @{ Name = "Electron Client";      Path = "$baseDir\electron-client" }
)

foreach ($comp in $components) {
    $nmPath = "$($comp.Path)\node_modules"
    if (-not (Test-Path $nmPath)) {
        Write-WARN "$($comp.Name) - node_modules missing. Installing..."
        try {
            Push-Location $comp.Path
            & npm.cmd install --no-audit --no-fund
            Pop-Location
            Write-OK "$($comp.Name) - installed"
        } catch {
            Write-ERR "Failed: $_"
            try { Pop-Location } catch {}
            exit 1
        }
    } else {
        Write-OK "$($comp.Name) - OK"
    }
}

# -- Step 4: Start Backend ---------------------------------------------
Write-Header "Starting Backend (Port 5000)..."
Start-Process -FilePath "cmd.exe" `
    -ArgumentList '/c "set PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs && npm start"' `
    -WorkingDirectory "$baseDir\backend" `
    -WindowStyle Normal

Write-INFO "Waiting for backend to be ready..."
$maxAttempts = 35
$attempt = 0
$backendReady = $false
while ($attempt -lt $maxAttempts) {
    Start-Sleep -Seconds 1
    $attempt++
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:5000/" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($r.StatusCode -eq 200) { $backendReady = $true; break }
    } catch {}
    if ($attempt % 5 -eq 0) { Write-INFO "  Still waiting... ($attempt/$maxAttempts)" }
}

if ($backendReady) {
    Write-OK "Backend ready at http://localhost:5000"
} else {
    Write-ERR "Backend failed to start on port 5000."
    Write-INFO "  Check the backend window for the startup error."
    exit 1
}

# -- Step 5: Start Interviewer Dashboard --------------------------------
Write-Header "Starting Interviewer Dashboard (Port 5173)..."
Start-Process -FilePath "cmd.exe" `
    -ArgumentList '/c "set PATH=%PATH%;C:\Program Files\nodejs;C:\Program Files (x86)\nodejs && npm run dev -- --host 127.0.0.1"' `
    -WorkingDirectory "$baseDir\interviewer-dashboard" `
    -WindowStyle Normal

$dashboardReady = $false
for ($i = 1; $i -le 30; $i++) {
    Start-Sleep -Seconds 1
    try {
        $dashboard = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -TimeoutSec 2 -UseBasicParsing -ErrorAction Stop
        if ($dashboard.StatusCode -eq 200) {
            $dashboardReady = $true
            break
        }
    } catch {}
    if ($i % 5 -eq 0) { Write-INFO "  Still waiting... ($i/30)" }
}

if ($dashboardReady) {
    Write-OK "Dashboard ready at http://localhost:5173"
} else {
    Write-ERR "Dashboard failed to start on port 5173."
    Write-INFO "  Check the dashboard window for the startup error."
    exit 1
}

# Try to open browser automatically
try {
    Start-Process "http://localhost:5173"
    Write-OK "Dashboard started at http://localhost:5173 (opening in browser)"
} catch {
    Write-OK "Dashboard started at http://localhost:5173"
}

# -- Done --------------------------------------------------------------
Write-Host ""
Write-Host "===========================================================" -ForegroundColor Green
Write-Host "   ProctorAI Platform Services Ready!                     " -ForegroundColor Green
Write-Host "                                                            " -ForegroundColor Green
Write-Host "   Web Platform Portal   : http://localhost:5173            " -ForegroundColor Green
Write-Host "   Backend API           : http://localhost:5000            " -ForegroundColor Green
Write-Host "   Secure Exam Terminal  : Launches on candidate check-in   " -ForegroundColor Green
Write-Host "                                                            " -ForegroundColor Green
Write-Host "   Access Details:                                          " -ForegroundColor Green
Write-Host "     Interviewer Portal  : Sign in / Register at portal     " -ForegroundColor Green
Write-Host "     Candidate Portal    : Sign in / Register at portal     " -ForegroundColor Green
Write-Host "                                                            " -ForegroundColor Green
Write-Host "   To stop all services  : double-click STOP ProctorAI.bat   " -ForegroundColor Green
Write-Host "===========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to close this window..." -ForegroundColor Gray
try {
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
} catch {
    Read-Host "Press Enter to exit"
}
