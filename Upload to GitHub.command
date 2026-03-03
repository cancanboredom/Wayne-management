#!/usr/bin/env bash

# Load standard user profile
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
echo "   Upload to GitHub - Wayne Management"
echo "============================================"
echo ""

# Detect Git
if ! command -v git &> /dev/null; then
    echo "[ERROR] Git not found! Please install Git (https://git-scm.com)."
    read -p "Press Enter to exit..."
    exit 1
fi

interactive_review() {
    echo ""
    echo "============================================"
    echo "    Interactive Change Review"
    echo "============================================"
    echo "Reviewing files one by one..."
    echo ""

    # Get the list of changed files
    git status --short | while read -r line; do
        status="${line:0:2}"
        file_path="${line:3}"
        
        # Trim leading/trailing whitespace if any
        file_path=$(echo "$file_path" | xargs)

        echo "----------------------------------------"
        echo "File: $file_path"
        echo "Status: $status"
        
        while true; do
            read -p "Action [K]eep, [D]iscard, [V]iew diff, [S]kip? (k/d/v/s): " file_choice
            case "$file_choice" in
                [kK]*)
                    echo "Keeping changes to $file_path."
                    break
                    ;;
                [dD]*)
                    echo "Reverting $file_path..."
                    if [[ "$status" == "??" || "$status" == "A " ]]; then
                        if [ -e "$file_path" ]; then
                            rm -rf "$file_path"
                        fi
                    else
                        git checkout -- "$file_path"
                    fi
                    echo "✅ Reverted."
                    break
                    ;;
                [vV]*)
                    git diff "$file_path"
                    ;;
                [sS]*)
                    echo "Skipping $file_path."
                    break
                    ;;
                *)
                    echo "Invalid choice."
                    ;;
            esac
        done
        echo ""
    done
    echo ""
    echo "✅ Review complete."
}

commit_push() {
    echo ""
    read -p "Would you like to review changes one-by-one first? (y/n): " review_choice
    if [[ "$review_choice" == [yY]* ]]; then
        interactive_review
    fi

    echo ""
    read -p "Enter a version description (e.g. 'Fixed highlight color'): " msg
    if [ -z "$msg" ]; then
        msg="Update $(date)"
    fi
    echo ""
    echo "Adding all changes..."
    git add .
    echo "Committing: $msg"
    git commit -m "$msg"
    echo "Pushing to GitHub..."
    git push origin main
    echo ""
    echo "✅ Done! Your app has been uploaded to GitHub."
    echo "   View it at: https://github.com/Oat9898/Wayne-management"
}

commit_only() {
    echo ""
    read -p "Would you like to review changes one-by-one first? (y/n): " review_choice
    if [[ "$review_choice" == [yY]* ]]; then
        interactive_review
    fi

    echo ""
    read -p "Enter a version description: " msg
    if [ -z "$msg" ]; then
        msg="Update $(date)"
    fi
    echo ""
    git add .
    git commit -m "$msg"
    echo ""
    echo "✅ Changes saved locally. Use option 1 later to upload to GitHub."
}

view_diff() {
    echo ""
    echo "============ Changed Files ============"
    git diff --stat
    echo ""
    echo "============ Detailed Changes ============"
    git diff
    echo ""
    read -p "Press Enter to return to menu..."
}

undo_changes() {
    echo ""
    echo "⚠️  WARNING: This will discard ALL unsaved changes!"
    read -p "Are you sure? (y/n): " confirm
    if [[ "$confirm" == [yY]* ]]; then
        git checkout -- .
        git clean -fd
        echo "✅ All changes have been undone."
    else
        echo "Cancelled."
    fi
}

while true; do
    echo "Current changes:"
    echo "----------------------------------------"
    git status --short
    echo "----------------------------------------"
    echo ""
    echo "Recent versions (last 10):"
    echo "----------------------------------------"
    git log --oneline -n 10
    echo "----------------------------------------"
    echo ""
    echo "What would you like to do?"
    echo ""
    echo "  [1] Upload ALL changes to GitHub (commit + push)"
    echo "  [2] Save changes locally only (commit, no push)"
    echo "  [3] View full change details (diff)"
    echo "  [4] Undo last local changes (restore to last commit)"
    echo "  [5] Exit"
    echo "  [6] Interactive Review (Select what to keep/discard)"
    echo ""
    read -p "Enter your choice (1-6): " choice

    case "$choice" in
        1) commit_push; break ;;
        2) commit_only; break ;;
        3) view_diff ;;
        4) undo_changes; break ;;
        5) exit 0 ;;
        6) interactive_review ;;
        *) echo "Invalid choice!" ;;
    esac
    echo ""
done

echo ""
echo "Done!"
sleep 2
