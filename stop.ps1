# stop.ps1  -  ProctorAI Enterprise Shutdown Script
# ====================================================================

$Host.UI.RawUI.WindowTitle = "ProctorAI - Shutdown"

function Write-Header($msg) { Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-OK($msg)     { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-WARN($msg)   { Write-Host "  [WARN] $msg" -ForegroundColor Yellow }
function Write-INFO($msg)   { Write-Host "  [INFO] $msg" -ForegroundColor Gray }

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "        ProctorAI Enterprise Platform v2.0       " -ForegroundColor Cyan
Write-Host "                 Shutdown Utility                 " -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# -- Step 1: Stop Port 5000 (Backend API Server) -----------------------
Write-Header "Checking Backend API Server (Port 5000)..."
$backendConn = Get-NetTCPConnection -LocalPort 5000 -ErrorAction SilentlyContinue
if ($backendConn) {
    $pids = $backendConn.OwningProcess | Select-Object -Unique
    foreach ($p in $pids) {
        if ($p -le 4) { continue }
        Write-INFO "Stopping Node Backend Server (PID: $p)..."
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
    Write-OK "Backend API server stopped."
} else {
    Write-INFO "No active processes found on port 5000."
}

# -- Step 2: Stop Port 5173 (Interviewer Dashboard - Vite) -------------
Write-Header "Checking Interviewer Dashboard (Port 5173)..."
$dashboardConn = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($dashboardConn) {
    $pids = $dashboardConn.OwningProcess | Select-Object -Unique
    foreach ($p in $pids) {
        if ($p -le 4) { continue }
        Write-INFO "Stopping Vite Dashboard Server (PID: $p)..."
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
    }
    Write-OK "Interviewer Dashboard server stopped."
} else {
    Write-INFO "No active processes found on port 5173."
}

# -- Step 3: Stop Electron Secure Exam Terminal ------------------------
Write-Header "Checking Secure Exam Terminal Client (Electron)..."
$electronProcesses = Get-Process -Name "electron" -ErrorAction SilentlyContinue
if ($electronProcesses) {
    Write-INFO "Stopping Electron kiosk terminal instance(s)..."
    foreach ($process in $electronProcesses) {
        Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    Write-OK "Electron terminal stopped."
} else {
    Write-INFO "No active Electron terminal instances found."
}

# -- Step 4: Stop Python Proctoring Engine -----------------------------
Write-Header "Checking Python Proctoring Engine (proctor.py)..."
$pythonProcesses = Get-CimInstance -ClassName Win32_Process -Filter "Name = 'python.exe' AND CommandLine LIKE '%proctor.py%'" -ErrorAction SilentlyContinue
if ($pythonProcesses) {
    foreach ($p in $pythonProcesses) {
        Write-INFO "Stopping active Python proctoring engine (PID: $($p.ProcessId))..."
        Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-OK "Python proctoring engine terminated."
} else {
    Write-INFO "No active Python proctoring engine found."
}

# -- Done --------------------------------------------------------------
Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "   All ProctorAI services successfully stopped!   " -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""
