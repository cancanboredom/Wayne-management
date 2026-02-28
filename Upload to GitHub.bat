@echo off
chcp 65001 >nul
title Upload to GitHub - Wayne Management
color 0A

echo ============================================
echo    Upload to GitHub - Wayne Management
echo ============================================
echo.

REM Set git path
set GIT="C:\Program Files\Git\cmd\git.exe"

REM Show current status
echo Current changes:
echo ----------------------------------------
%GIT% status --short
echo ----------------------------------------
echo.

REM Show recent commits
echo Recent versions (last 10):
echo ----------------------------------------
%GIT% log --oneline -n 10
echo ----------------------------------------
echo.

REM Ask user what to do
echo What would you like to do?
echo.
echo   [1] Upload ALL changes to GitHub (commit + push)
echo   [2] Save changes locally only (commit, no push)
echo   [3] View full change details (diff)
echo   [4] Undo last local changes (restore to last commit)
echo   [5] Exit
echo.
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" goto COMMIT_PUSH
if "%choice%"=="2" goto COMMIT_ONLY
if "%choice%"=="3" goto VIEW_DIFF
if "%choice%"=="4" goto UNDO
if "%choice%"=="5" goto END
echo Invalid choice!
goto END

:COMMIT_PUSH
echo.
set /p msg="Enter a version description (e.g. 'Fixed highlight color'): "
if "%msg%"=="" set msg=Update %date% %time%
echo.
echo Adding all changes...
%GIT% add .
echo Committing: %msg%
%GIT% commit -m "%msg%"
echo Pushing to GitHub...
%GIT% push origin main
echo.
echo ✅ Done! Your app has been uploaded to GitHub.
echo    View it at: https://github.com/Oat9898/Wayne-management
goto END

:COMMIT_ONLY
echo.
set /p msg="Enter a version description: "
if "%msg%"=="" set msg=Update %date% %time%
echo.
%GIT% add .
%GIT% commit -m "%msg%"
echo.
echo ✅ Changes saved locally. Use option 1 later to upload to GitHub.
goto END

:VIEW_DIFF
echo.
echo ============ Changed Files ============
%GIT% diff --stat
echo.
echo ============ Detailed Changes ============
%GIT% diff
echo.
pause
goto END

:UNDO
echo.
echo ⚠️  WARNING: This will discard ALL unsaved changes!
set /p confirm="Are you sure? (y/n): "
if /i "%confirm%"=="y" (
    %GIT% checkout -- .
    echo ✅ All changes have been undone.
) else (
    echo Cancelled.
)
goto END

:END
echo.
pause
