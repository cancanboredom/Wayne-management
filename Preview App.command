#!/usr/bin/env bash

# Load standard user profile to get node/npm if installed via nvm/n/brew
if [ -f "$HOME/.bash_profile" ]; then
    source "$HOME/.bash_profile"
elif [ -f "$HOME/.zprofile" ]; then
    source "$HOME/.zprofile"
fi
if [ -f "$HOME/.bashrc" ]; then
    source "$HOME/.bashrc"
elif [ -f "$HOME/.zshrc" ]; then
    source "$HOME/.zshrc"
fi

# Change to the directory where the script is located
cd "$(dirname "$0")"

echo "============================================"
echo "  Duty Management System - Auto Updater    "
echo "============================================"
echo ""

# Check for npm and git
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm not found! Please install Node.js (https://nodejs.org)."
    read -p "Press Enter to exit..."
    exit 1
fi

if command -v git &> /dev/null; then
    echo "Checking for updates from GitHub..."
    git pull origin main
    echo ""
else
    echo "[WARNING] Git not found! Skipping update check."
    echo ""
fi

echo "Installing/updating dependencies..."
npm install
echo ""

if [ $? -ne 0 ]; then
    echo "[WARNING] npm install had issues. Try deleting node_modules and running again."
    echo ""
fi

echo "Starting development server..."
echo ""
echo "============================================"
echo "  Open http://localhost:3000 in your browser!"
echo "============================================"
echo ""

npm run dev
