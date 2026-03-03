@echo off
chcp 65001 >nul
title Deploy to Firebase
color 0B

echo ============================================
echo   Duty Management System - Firebase Deploy
echo ============================================
echo.
echo Make sure you have installed Firebase CLI:
echo npm install -g firebase-tools
echo.
echo And logged in:
echo firebase login
echo.
echo Press any key to start the build and deployment...
pause >nul

echo.
echo Building project...
call npm run build
if %errorlevel% neq 0 (
    echo.
    color 0C
    echo [ERROR] Build failed! Check the errors above.
    pause
    exit /b %errorlevel%
)

echo.
echo Deploying to Firebase Hosting...
call firebase deploy --only hosting
if %errorlevel% neq 0 (
    echo.
    color 0C
    echo [ERROR] Deployment failed! Check the errors above.
    echo Did you update your project ID in .firebaserc?
    pause
    exit /b %errorlevel%
)

echo.
color 0A
echo ============================================
echo   Deployed Successfully!
echo ============================================
pause
