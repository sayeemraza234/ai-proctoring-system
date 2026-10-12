@echo off
setlocal
title ProctorAI - Sync with GitHub
set "ROOT=%~dp0"

echo.
echo ===================================================
echo   Syncing ProctorAI with GitHub...
echo ===================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%sync.ps1" %*

echo.
pause
