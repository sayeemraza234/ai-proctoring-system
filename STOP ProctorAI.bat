@echo off
setlocal
title ProctorAI - Stop

echo.
echo Stopping ProctorAI services...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ports=5000,5173,5180; foreach($port in $ports){$c=Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue; if($c){foreach($p in @($c.OwningProcess)){if($p -gt 4){Stop-Process -Id $p -Force -ErrorAction SilentlyContinue}}}}; foreach($p in @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue)){if(($p.Name -in @('electron.exe','python.exe')) -and ($p.CommandLine -match 'ai-proctoring-system' -or $p.CommandLine -match 'proctor.py')){Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue}}"

echo ProctorAI services stopped.
timeout /t 3 /nobreak >nul
exit /b 0
