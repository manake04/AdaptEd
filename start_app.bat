@echo off
title AdaptEd Server
color 0A
cls

echo ==================================================
echo           Starting AdaptEd Accessibility Suite
echo ==================================================
echo.
echo [1/3] Checking environment...
if not exist "node_modules" (
    echo [!] Node modules not found. Installing dependencies...
    call npm install
)

echo [2/3] Starting server...
echo.
echo    Server will run at: http://localhost:3000
echo    Keep this window open while using the app.
echo.
echo ==================================================
echo.

:: Use node directly to avoid PowerShell execution policy issues
node server.js

pause
