@echo off
chcp 65001 >nul
title Duty Management System - Auto Updater
color 0A

echo ============================================
echo   Duty Management System - Auto Updater
echo ============================================
echo.

REM Try git from PATH first, then fallback to default install location
where git >nul 2>nul
if %errorlevel%==0 (
    set GIT=git
) else if exist "C:\Program Files\Git\cmd\git.exe" (
    set GIT="C:\Program Files\Git\cmd\git.exe"
) else (
    echo [WARNING] Git not found! Skipping update check.
    echo Download Git from: https://git-scm.com
    echo.
    goto INSTALL
)

echo Checking for updates from GitHub...
%GIT% pull origin main
echo.

:INSTALL
echo Installing/updating dependencies...
call npm install
echo.
echo Starting development server...
echo.
echo ============================================
echo   Open http://localhost:3000 in your browser!
echo ============================================
echo.
call npm run dev
pause
