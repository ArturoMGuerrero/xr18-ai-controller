#!/bin/bash

echo "========================================"
echo "XR18 AI Controller - Setup Script"
echo "========================================"
echo ""

echo "[1/4] Installing backend dependencies..."
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd ..
echo "Backend dependencies installed!"
echo ""

echo "[2/4] Installing frontend dependencies..."
cd frontend
npm install
cd ..
echo "Frontend dependencies installed!"
echo ""

echo "[3/4] Installing Electron dependencies..."
npm install
echo "Electron dependencies installed!"
echo ""

echo "[4/4] Creating environment file..."
if [ ! -f backend/.env ]; then
    cp backend/.env.example backend/.env
    echo "Created backend/.env from template"
else
    echo "backend/.env already exists, skipping"
fi
echo ""

echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "To run the application in development mode:"
echo "  npm run dev"
echo ""
echo "To build the installer:"
echo "  npm run build        (current platform)"
echo "  npm run build:mac    (macOS)"
echo "  npm run build:linux  (Linux)"
echo ""
echo "For more information, see CLAUDE.md"
echo ""
