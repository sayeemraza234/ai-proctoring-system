@echo off
setlocal
title ProctorAI - GitHub Auto-Sync
color 0b

:: Change working directory to this script's directory
cd /d "%~dp0"

:: Execute embedded PowerShell logic seamlessly from this single file
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -Command "$lines = [System.IO.File]::ReadAllLines('%~f0'); $idx = [array]::IndexOf($lines, '# BEGIN POWERSHELL'); $code = [string]::Join([Environment]::NewLine, $lines[($idx + 1)..($lines.Length - 1)]); Invoke-Expression $code"
set "SYNC_EXIT=%ERRORLEVEL%"

echo.
echo =========================================================================
echo   Sync process finished. Press any key to close this terminal window...
echo =========================================================================
pause >nul
exit /b %SYNC_EXIT%

# BEGIN POWERSHELL
# ══════════════════════════════════════════════════════════════════════════════
# ProctorAI Standalone GitHub Auto-Sync Script
# ══════════════════════════════════════════════════════════════════════════════

$ErrorActionPreference = "Stop"

function Write-Banner {
    Write-Host ""
    Write-Host ("=" * 64) -ForegroundColor Cyan
    Write-Host "              PROCTORAI - GITHUB AUTO-SYNC TOOL" -ForegroundColor Cyan
    Write-Host ("=" * 64) -ForegroundColor Cyan
    Write-Host ""
}

function Write-Step {
    param([string]$num, [string]$text)
    Write-Host "[$num] $text" -ForegroundColor Yellow
}

function Write-Success {
    param([string]$text)
    Write-Host "  [OK] $text" -ForegroundColor Green
}

function Write-Info {
    param([string]$text)
    Write-Host "  [INFO] $text" -ForegroundColor Gray
}

function Write-Warn {
    param([string]$text)
    Write-Host "  [WARN] $text" -ForegroundColor DarkYellow
}

function Write-Fail {
    param([string]$text)
    Write-Host "  [ERROR] $text" -ForegroundColor Red
}

try {
    Write-Banner

    # 1. Check Git availability
    try {
        $null = git --version
    } catch {
        Write-Fail "Git is not installed or not found in system PATH."
        Write-Host "Please download Git from https://git-scm.com/ and install it." -ForegroundColor Red
        exit 1
    }

    # 2. Check if inside a Git repository
    $isRepo = git rev-parse --is-inside-work-tree 2>$null
    if ($isRepo -ne "true") {
        Write-Fail "This folder is not a valid Git repository."
        exit 1
    }

    # 3. Detect current branch and remote URL
    $currentBranch = (git branch --show-current 2>$null).Trim()
    if (-not $currentBranch) {
        $currentBranch = "main"
    }

    $remoteUrl = (git remote get-url origin 2>$null)
    Write-Info "Active Branch: $currentBranch"
    Write-Info "GitHub Remote: $remoteUrl"
    Write-Host ""

    # =========================================================================
    # STEP 1: Always check for incoming changes on GitHub first
    # =========================================================================
    Write-Step "1/3" "Checking GitHub repository for incoming updates..."
    
    try {
        git fetch origin $currentBranch --quiet
    } catch {
        Write-Warn "Could not reach remote GitHub repository. Check internet connection."
    }

    $behindCount = 0
    try {
        $behindStr = (git rev-list --count "HEAD..origin/$currentBranch" 2>$null).Trim()
        if ($behindStr) { $behindCount = [int]$behindStr }
    } catch {
        $behindCount = 0
    }

    $localDirty = [bool](git status --porcelain)

    if ($behindCount -gt 0) {
        Write-Host "  -> Found $behindCount new incoming commit(s) on GitHub!" -ForegroundColor Green
        Write-Step "1b" "Pulling latest updates from GitHub into local files..."

        if ($localDirty) {
            Write-Info "Stashing local uncommitted edits before pulling..."
            git stash save -u "auto-sync-pre-pull-stash" --quiet
            git pull --rebase origin $currentBranch
            Write-Info "Restoring your local edits..."
            git stash pop --quiet
        } else {
            git pull --rebase origin $currentBranch
        }
        Write-Success "Local files successfully updated with the latest changes from GitHub!"
    } else {
        Write-Success "GitHub repository checked: Local branch is already up to date with remote."
    }

    Write-Host ""

    # =========================================================================
    # STEP 2: Check for local file changes and stage/commit them
    # =========================================================================
    Write-Step "2/3" "Comparing and detecting local file modifications..."

    $localChanges = git status --porcelain
    if ($localChanges) {
        $changeLines = ($localChanges -split "`r?`n") | Where-Object { $_ -ne "" }
        $changeCount = $changeLines.Count
        Write-Host "  -> Detected $changeCount modified/new file(s) locally." -ForegroundColor Yellow

        Write-Step "2b" "Staging and committing local changes..."
        git add -A

        $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
        $commitMsg = "Auto-sync: $timestamp"

        git commit -m $commitMsg
        Write-Success "Local changes committed: '$commitMsg'"
    } else {
        Write-Success "No uncommitted local file modifications found."
    }

    Write-Host ""

    # =========================================================================
    # STEP 3: Push pending local commits to GitHub
    # =========================================================================
    Write-Step "3/3" "Checking outgoing commits and pushing to GitHub..."

    $aheadCount = 0
    try {
        $aheadStr = (git rev-list --count "origin/$currentBranch..HEAD" 2>$null).Trim()
        if ($aheadStr) { $aheadCount = [int]$aheadStr }
    } catch {
        $aheadCount = 0
    }

    if ($aheadCount -gt 0) {
        Write-Host "  -> Local is ahead by $aheadCount commit(s). Pushing to GitHub ($currentBranch)..." -ForegroundColor Cyan
        git push origin $currentBranch
        if ($LASTEXITCODE -eq 0) {
            Write-Success "All local commits successfully pushed to your GitHub repository!"
        } else {
            Write-Fail "Failed to push to GitHub. Check network or repository permissions."
            exit $LASTEXITCODE
        }
    } else {
        Write-Success "GitHub is already up to date with all local commits. Nothing to push."
    }

    Write-Host ""
    Write-Host ("=" * 64) -ForegroundColor Green
    Write-Host "  [COMPLETED] Synchronization finished successfully!" -ForegroundColor Green
    Write-Host "  Repository: $remoteUrl" -ForegroundColor Gray
    Write-Host "  Branch:     $currentBranch" -ForegroundColor Gray
    Write-Host "  Status:     All local files and GitHub are fully in sync!" -ForegroundColor Green
    Write-Host ("=" * 64) -ForegroundColor Green

} catch {
    Write-Host ""
    Write-Fail "Sync failed: $($_.Exception.Message)"
    exit 1
}
