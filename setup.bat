@echo off
echo ========================================
echo XR18 AI Controller - Setup Script
echo ========================================
echo.

echo [1/4] Installing backend dependencies...
cd backend
python -m venv venv
call venv\Scripts\activate
pip install -r requirements.txt
cd ..
echo Backend dependencies installed!
echo.

echo [2/4] Installing frontend dependencies...
cd frontend
call npm install
cd ..
echo Frontend dependencies installed!
echo.

echo [3/4] Installing Electron dependencies...
call npm install
echo Electron dependencies installed!
echo.

echo [4/4] Creating environment file...
if not exist backend\.env (
    copy backend\.env.example backend\.env
    echo Created backend\.env from template
) else (
    echo backend\.env already exists, skipping
)
echo.

echo ========================================
echo Setup Complete!
echo ========================================
echo.
echo To run the application in development mode:
echo   npm run dev
echo.
echo To build the installer:
echo   npm run build:win
echo.
echo For more information, see CLAUDE.md
echo.
pause
