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

while true; do
    clear
    echo "============================================"
    echo "          Wayne Management Menu             "
    echo "============================================"
    echo ""
    echo "Please select an action:"
    echo ""
    echo "  [1] Open Preview App"
    echo "  [2] Upload to GitHub"
    echo "  [3] Update from GitHub"
    echo "  [4] Deploy to Firebase"
    echo "  [5] Exit"
    echo ""
    read -p "Select an option (1-5): " choice

    case "$choice" in
        1)
            echo "Starting Preview App..."
            bash "Preview App.command"
            read -p "Press Enter to return to menu..."
            ;;
        2)
            echo "Starting Upload to GitHub..."
            bash "Upload to GitHub.command"
            read -p "Press Enter to return to menu..."
            ;;
        3)
            echo "Starting Update from GitHub..."
            bash "Update from GitHub.command"
            read -p "Press Enter to return to menu..."
            ;;
        4)
            echo "Starting Deploy to Firebase..."
            bash "Deploy to Firebase.command"
            read -p "Press Enter to return to menu..."
            ;;
        5)
            echo "Exiting..."
            exit 0
            ;;
        *)
            echo "Invalid option, please try again."
            sleep 1
            ;;
    esac
done
