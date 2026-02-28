# 📋 Duty Management System

A web-based duty/shift scheduling application built with React, TypeScript, and Express.

## ✨ Features

- Monthly shift calendar with drag & drop assignment
- 1st / 2nd / 3rd call personnel management
- Holiday & weekend highlighting
- Conflict detection & warnings
- Noon shift support
- Lock/unlock editing mode
- Print-friendly layout
- Persistent data via SQLite database

---

## 🚀 Quick Start (For Everyone)

### Prerequisites

Make sure you have these installed on your computer:

| Tool | Download Link |
|------|--------------|
| **Node.js** (v18+) | [https://nodejs.org](https://nodejs.org) |
| **Git** | [https://git-scm.com](https://git-scm.com) |

### Step 1 — Clone the Repository

Open a terminal or Command Prompt and run:

```bash
git clone https://github.com/Oat9898/Wayne-management.git
cd Wayne-management
```

### Step 2 — Set Up Environment

Copy the example env file and add your Gemini API key:

```bash
copy .env.example .env.local
```

Then edit `.env.local` and replace `MY_GEMINI_API_KEY` with your actual key.

### Step 3 — Run the App

**Option A — Double-click `Preview App.bat`** (Windows only, easiest!)

This will automatically install dependencies, pull the latest updates, and start the app.

**Option B — Run manually:**

```bash
npm install
npm run dev
```

### Step 4 — Open in Browser

Go to **[http://localhost:3000](http://localhost:3000)** in your browser.

---

## 🔄 Staying Up to Date

**Easiest way — Double-click `Update from GitHub.bat`**

This will:
- ✅ Check for unsaved local changes (and safely stash them if needed)
- ✅ Pull the latest code from GitHub
- ✅ Install/update dependencies
- ✅ Show you what changed
- ✅ Optionally start the app

**Or manually:**

```bash
git pull origin main
npm install
npm run dev
```

---

## 📁 Project Structure

```
├── src/
│   ├── App.tsx              # Main application component
│   ├── index.css            # Global styles
│   └── main.tsx             # Entry point
├── server.ts                # Express backend + API
├── package.json             # Dependencies & scripts
├── vite.config.ts           # Vite configuration
├── Preview App.bat          # One-click run (auto-updates)
├── Update from GitHub.bat   # Pull latest + install + run
├── Upload to GitHub.bat     # One-click upload changes
└── .env.example             # Environment variable template
```

## 📜 Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server on port 3000 |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

---

## 👥 For Contributors

1. Double-click **`Update from GitHub.bat`** to get the latest code
2. Make your changes
3. Double-click **`Upload to GitHub.bat`** and choose option 1
4. Enter a short description of your changes
5. Done! Everyone else can pull the update with `Update from GitHub.bat`

## 🛠️ Handy Bat Files (Windows)

| File | What it does |
|------|--------------|
| **`Update from GitHub.bat`** | Pull latest code, install deps, optionally start app |
| **`Upload to GitHub.bat`** | Commit & push your changes to GitHub |
| **`Preview App.bat`** | Quick pull + start dev server |
