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
echo "  Duty Management System - Firebase Deploy  "
echo "============================================"
echo ""
echo "Make sure you have installed Firebase CLI:"
echo "npm install -g firebase-tools"
echo ""
echo "And logged in:"
echo "firebase login"
echo ""
read -n 1 -s -r -p "Press any key to start the build and deployment..."
echo ""
echo ""

# Check for npm
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm not found! Please install Node.js (https://nodejs.org)."
    read -p "Press Enter to exit..."
    exit 1
fi

echo "Building project..."
npm run build
if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] Build failed! Check the errors above."
    read -p "Press Enter to exit..."
    exit 1
fi

echo ""
echo "Deploying to Firebase Hosting..."
npx firebase deploy --only hosting
if [ $? -ne 0 ]; then
    echo ""
    echo "[ERROR] Deployment failed! Check the errors above."
    echo "Did you update your project ID in .firebaserc?"
    read -p "Press Enter to exit..."
    exit 1
fi

echo ""
echo "============================================"
echo "  Deployed Successfully!"
echo "============================================"
read -p "Press Enter to exit..."
