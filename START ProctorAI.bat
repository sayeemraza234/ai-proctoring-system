@echo off
setlocal
title ProctorAI - Start
set "ROOT=%~dp0"

echo.
echo Starting ProctorAI...

rem Clear only the two ports owned by this project.
for %%P in (5000 5180) do (
  powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$c=Get-NetTCPConnection -LocalPort %%P -State Listen -ErrorAction SilentlyContinue; if($c){foreach($p in @($c.OwningProcess)){if($p -gt 4){Stop-Process -Id $p -Force -ErrorAction SilentlyContinue}}}"
)

if not exist "%ROOT%backend\node_modules" (
  echo Installing backend dependencies...
  pushd "%ROOT%backend"
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 goto :failed
  popd
)
if not exist "%ROOT%interviewer-dashboard\node_modules" (
  echo Installing dashboard dependencies...
  pushd "%ROOT%interviewer-dashboard"
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 goto :failed
  popd
)

start "ProctorAI Backend" /D "%ROOT%backend" cmd.exe /d /k "npm.cmd start"
start "ProctorAI Dashboard" /D "%ROOT%interviewer-dashboard" cmd.exe /d /k "npm.cmd run dev -- --host 127.0.0.1"

echo Waiting for services...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 40;$i++){try{$a=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5000/ -TimeoutSec 2; $b=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5180/ -TimeoutSec 2; if($a.StatusCode -eq 200 -and $b.StatusCode -eq 200){$ok=$true;break}}catch{}; Start-Sleep -Milliseconds 500}; if(-not $ok){exit 1}"
if errorlevel 1 (
  echo.
  echo [ERROR] ProctorAI did not start correctly. Check the two service windows.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:5180"
echo.
echo ProctorAI is running.
echo Dashboard: http://127.0.0.1:5180
echo Backend:   http://127.0.0.1:5000
echo Use STOP ProctorAI.bat to stop all project services.
timeout /t 5 /nobreak >nul
exit /b 0

:failed
popd 2>nul
echo.
echo [ERROR] Dependency installation failed.
pause
exit /b 1
