@echo off
PowerShell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-all.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Script failed. Press any key to close...
    pause >nul
)
