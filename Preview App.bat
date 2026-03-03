@echo off
setlocal EnableDelayedExpansion
chcp 65001 >nul
title Duty Management System - Auto Updater
color 0A

echo ============================================
echo   Duty Management System - Auto Updater
echo ============================================
echo.

REM --- Detect Node.js/npm ---
where npm >nul 2>nul
if %errorlevel%==0 (
    set NPM=npm
    set NODE=node
) else if exist "C:\Program Files\nodejs\npm.cmd" (
    echo [INFO] npm not in PATH, using default install location...
    set "PATH=C:\Program Files\nodejs;%PATH%"
    set NPM=npm
    set NODE=node
) else (
    echo [ERROR] Node.js/npm not found!
    echo Download Node.js from: https://nodejs.org
    echo.
    pause
    exit /b 1
)

REM --- Detect Git ---
where git >nul 2>nul
if %errorlevel%==0 (
    set GIT=git
) else if exist "C:\Program Files\Git\cmd\git.exe" (
    set "PATH=C:\Program Files\Git\cmd;%PATH%"
    set GIT=git
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
call %NPM% install
echo.

if %errorlevel% neq 0 (
    echo [WARNING] npm install had issues. Try deleting node_modules and running again.
    echo.
)

echo Starting development server...
echo.
echo ============================================
echo   Open http://localhost:3000 in your browser!
echo ============================================
echo.
call %NPM% run dev
pause
