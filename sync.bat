@echo off
setlocal enabledelayedexpansion

:: ─────────────────────────────────────────────────────────────────────────────
:: ProctorAI - GitHub Automatic Synchronizer
:: 
:: When double-clicked, this batch script opens the Windows Command Prompt,
:: checks GitHub remote for updates first, pulls any incoming changes,
:: inspects local files for modifications, commits them, and pushes to GitHub.
:: ─────────────────────────────────────────────────────────────────────────────

title ProctorAI - GitHub Auto-Sync
color 0b

:: Always change directory to the repository folder where this script lives
cd /d "%~dp0"

echo.
echo =========================================================================
echo               PROCTORAI - GITHUB SYNCHRONIZATION TOOL
echo =========================================================================
echo.

:: Check if git command exists in PATH
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    color 0c
    echo [ERROR] Git was not found in your system PATH!
    echo Please install Git for Windows from: https://git-scm.com/
    echo.
    echo Press any key to exit...
    pause >nul
    exit /b 1
)

:: Run PowerShell sync script with bypass policy
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync.ps1" %*
set "SYNC_EXIT_CODE=%ERRORLEVEL%"

if %SYNC_EXIT_CODE% neq 0 (
    echo.
    echo -------------------------------------------------------------------------
    echo [NOTICE] PowerShell execution returned code %SYNC_EXIT_CODE%.
    echo Running native Command Prompt Git sync fallback...
    echo -------------------------------------------------------------------------
    echo.

    echo [1/3] Fetching remote branch...
    git fetch origin main

    echo [2/3] Checking for local changes and staging...
    git add -A
    git diff --cached --quiet
    if %ERRORLEVEL% neq 0 (
        for /f "tokens=1-3 delims=/ " %%a in ('date /t') do set "CURR_DATE=%%c-%%a-%%b"
        for /f "tokens=1-2 delims=: " %%a in ('time /t') do set "CURR_TIME=%%a:%%b"
        git commit -m "Auto-sync: !CURR_DATE! !CURR_TIME!"
    )

    echo [3/3] Pulling and rebasing with remote...
    git pull --rebase origin main

    echo Pushing to GitHub repository...
    git push origin main

    if %ERRORLEVEL% equ 0 (
        echo.
        echo [SUCCESS] Git sync completed via native fallback!
    ) else (
        echo.
        echo [ERROR] Failed to push to GitHub. Please check your internet connection or GitHub credentials.
    )
)

echo.
echo =========================================================================
echo   Sync process finished. Press any key to close this terminal window...
echo =========================================================================
pause >nul
