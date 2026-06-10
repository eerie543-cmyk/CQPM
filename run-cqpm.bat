@echo off
title CQPM - Continuous Quality Process Monitoring
cd /d "C:\Users\sutap\Desktop\Personal\Source Codes\CQPM"

echo [1/3] Clearing Vite cache...
if exist "node_modules\.vite" rmdir /s /q "node_modules\.vite" 2>nul

echo [2/3] Freeing port 5174 if occupied...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr ":5174 "') do (
  taskkill /PID %%a /F >nul 2>nul
)

echo [3/3] Launching CQPM...
echo.
npm run dev
pause
