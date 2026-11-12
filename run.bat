@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title SmartQueue - Launch

echo.
echo  ==========================================
echo       SmartQueue - Banking Queue System
echo  ==========================================
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python was not found. Install Python 3.10 or newer and enable Add Python to PATH.
  pause
  exit /b 1
)
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Install Node.js 18 or newer, then run this file again.
  pause
  exit /b 1
)
where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Reinstall Node.js 18 or newer.
  pause
  exit /b 1
)

if not exist ".env" (
  if exist ".env.example" (
    copy /y ".env.example" ".env" >nul
    echo [INFO] Created .env from the example. Local app defaults are used; edit .env for custom deployment settings.
  )
)

echo [1/3] Checking Python dependencies...
python -c "import fastapi, uvicorn, sqlalchemy, jwt, sympy" >nul 2>nul
if errorlevel 1 (
  python -m pip install -r requirements.txt
  if errorlevel 1 goto :failed
)

echo [2/3] Checking frontend dependencies...
if not exist "frontend\node_modules\vite\bin\vite.js" (
  pushd frontend
  call npm install
  if errorlevel 1 (popd & goto :failed)
  popd
)

echo [3/3] Starting SmartQueue...
start "SmartQueue Backend - Port 8000" cmd /k "cd /d ""%~dp0"" && python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000"
start "SmartQueue Frontend - Port 5173" cmd /k "cd /d ""%~dp0frontend"" && npm run dev -- --host 127.0.0.1"
timeout /t 4 /nobreak >nul
start "" "http://localhost:5173"
echo.
echo SmartQueue is starting in your browser.
echo Keep both terminal windows open while using the application.
echo.
echo If this is a fresh installation and no administrator exists, run:
echo   python -m backend.reset_admin
echo from the SmartQueue project folder to create/reset the admin login.
echo.
exit /b 0

:failed
echo.
echo [ERROR] Setup failed. Read the error above, check your internet connection, and run run.bat again.
pause
exit /b 1
