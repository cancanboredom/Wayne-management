@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Update from GitHub - Wayne Management
color 0B

echo ============================================
echo   Update from GitHub - Wayne Management
echo ============================================
echo.

REM --- Detect Git ---
where git >nul 2>nul
if %errorlevel%==0 (
    set GIT=git
) else if exist "C:\Program Files\Git\cmd\git.exe" (
    set GIT="C:\Program Files\Git\cmd\git.exe"
) else (
    echo [ERROR] Git not found!
    echo Download Git from: https://git-scm.com
    echo.
    pause
    exit /b 1
)

REM --- Check for uncommitted local changes ---
echo Checking local status...
%GIT% status --short > "%TEMP%\git_status_tmp.txt" 2>nul
set HAS_CHANGES=0
for %%A in ("%TEMP%\git_status_tmp.txt") do if %%~zA gtr 0 set HAS_CHANGES=1
del "%TEMP%\git_status_tmp.txt" 2>nul

if %HAS_CHANGES%==1 (
    echo.
    echo [WARNING] You have local changes that haven't been saved!
    echo ----------------------------------------
    %GIT% status --short
    echo ----------------------------------------
    echo.
    echo What would you like to do?
    echo   [1] Stash my changes then update (recommended - keeps your work safe^)
    echo   [2] Discard my changes and update (WARNING: loses unsaved work^)
    echo   [3] Cancel - I'll save my changes first
    echo.
    set /p stash_choice="Enter your choice (1-3): "

    if "!stash_choice!"=="3" goto END
    if "!stash_choice!"=="2" (
        echo.
        echo Discarding local changes...
        %GIT% checkout -- .
        %GIT% clean -fd
    ) else (
        echo.
        echo Stashing your local changes...
        %GIT% stash push -m "Auto-stash before update %date% %time%"
        echo Your changes are safely stashed. Use 'git stash pop' to restore them later.
    )
    echo.
)

REM --- Pull latest from GitHub ---
echo.
echo Pulling latest changes from GitHub...
echo ----------------------------------------
%GIT% pull origin main
set PULL_RESULT=%errorlevel%
echo ----------------------------------------
echo.

if %PULL_RESULT% neq 0 (
    echo [ERROR] Failed to pull from GitHub!
    echo.
    echo Possible causes:
    echo   - No internet connection
    echo   - Repository access issues
    echo   - Merge conflicts
    echo.
    echo Try running 'Upload to GitHub.bat' first to push your
    echo local changes, then try updating again.
    echo.
    pause
    exit /b 1
)

echo ✅ Code updated successfully!
echo.

REM --- Install/update dependencies ---
echo Installing/updating dependencies...
echo (This may take a moment if packages have changed)
echo.
call npm install
echo.

if %errorlevel% neq 0 (
    echo [WARNING] npm install had issues. Try deleting node_modules and running again.
    echo.
)

REM --- Show what changed ---
echo.
echo ============================================
echo   Latest Changes
echo ============================================
%GIT% log --oneline -5
echo ============================================
echo.

REM --- Ask if user wants to start the app ---
echo What would you like to do now?
echo   [1] Start the app (npm run dev)
echo   [2] Exit
echo.
set /p run_choice="Enter your choice (1-2): "

if "%run_choice%"=="1" (
    echo.
    echo ============================================
    echo   Open http://localhost:3000 in your browser!
    echo ============================================
    echo.
    call npm run dev
)

:END
echo.
echo Done!
pause
