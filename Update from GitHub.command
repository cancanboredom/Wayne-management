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
echo "  Update from GitHub - Wayne Management"
echo "============================================"
echo ""

# Detect Git
if ! command -v git &> /dev/null; then
    echo "[ERROR] Git not found! Please install Git (https://git-scm.com)."
    read -p "Press Enter to exit..."
    exit 1
fi

# Detect npm
if ! command -v npm &> /dev/null; then
    echo "[ERROR] npm not found! Please install Node.js (https://nodejs.org)."
    read -p "Press Enter to exit..."
    exit 1
fi

# Check for uncommitted local changes
echo "Checking local status..."
IF_CHANGES=$(git status --short)

if [ -n "$IF_CHANGES" ]; then
    echo ""
    echo "[WARNING] You have local changes that haven't been saved!"
    echo "----------------------------------------"
    git status --short
    echo "----------------------------------------"
    echo ""
    echo "What would you like to do?"
    echo "  [1] Stash my changes then update (recommended - keeps your work safe)"
    echo "  [2] Discard my changes and update (WARNING: loses unsaved work)"
    echo "  [3] Cancel - I'll save my changes first"
    echo ""
    read -p "Enter your choice (1-3): " stash_choice

    case "$stash_choice" in
        3) exit 0 ;;
        2)
            echo ""
            echo "Discarding local changes..."
            git checkout -- .
            git clean -fd
            ;;
        *)
            echo ""
            echo "Stashing your local changes..."
            git stash push -m "Auto-stash before update $(date)"
            echo "Your changes are safely stashed. Use 'git stash pop' to restore them later."
            ;;
    esac
    echo ""
fi

# Pull latest from GitHub
echo ""
echo "Pulling latest changes from GitHub..."
echo "----------------------------------------"
git pull origin main
PULL_RESULT=$?
echo "----------------------------------------"
echo ""

if [ $PULL_RESULT -ne 0 ]; then
    echo "[ERROR] Failed to pull from GitHub!"
    echo ""
    echo "Possible causes:"
    echo "  - No internet connection"
    echo "  - Repository access issues"
    echo "  - Merge conflicts"
    echo ""
    echo "Try running 'Upload to GitHub.command' first to push your"
    echo "local changes, then try updating again."
    echo ""
    read -p "Press Enter to exit..."
    exit 1
fi

echo "✅ Code updated successfully!"
echo ""

# Install/update dependencies
echo "Installing/updating dependencies..."
echo "(This may take a moment if packages have changed)"
echo ""
npm install
echo ""

if [ $? -ne 0 ]; then
    echo "[WARNING] npm install had issues. Try deleting node_modules and running again."
    echo ""
fi

# Show what changed
echo ""
echo "============================================"
echo "  Latest Changes"
echo "============================================"
git log --oneline -5
echo "============================================"
echo ""

# Ask if user wants to start the app
echo "What would you like to do now?"
echo "  [1] Start the app (npm run dev)"
echo "  [2] Exit"
echo ""
read -p "Enter your choice (1-2): " run_choice

if [ "$run_choice" = "1" ]; then
    echo ""
    echo "============================================"
    echo "  Open http://localhost:3000 in your browser!"
    echo "============================================"
    echo ""
    npm run dev
fi

echo ""
echo "Done!"
sleep 2
