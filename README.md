# 📋 Duty Management System

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Oat9898/Wayne-management)
[![Open in Gitpod](https://gitpod.io/button/open-in-gitpod.svg)](https://gitpod.io/#https://github.com/Oat9898/Wayne-management)

A web-based duty/shift scheduling application built with React, TypeScript, and Express.

---

## 🇹🇭 สรุปสั้นๆ (TLDR)

> **แอปนี้คืออะไร?**  
> แอปจัดเวรออนไลน์ — ใช้จัดตารางเวร 1st / 2nd / 3rd call ให้ทุกคนในทีมได้ง่ายๆ ผ่านเว็บ

**วิธีใช้งาน (3 ขั้นตอน):**

1. 📥 **โหลดโปรเจกต์** — กด Clone หรือ Download ZIP จาก GitHub
2. 🖱️ **เปิดแอป** — ดับเบิลคลิก `Preview App.bat` (Windows) หรือรัน `npm run dev`
3. 🌐 **เปิดเบราว์เซอร์** — ไปที่ [http://localhost:3000](http://localhost:3000)

**ฟีเจอร์หลัก:**
- 📅 ปฏิทินรายเดือน — ลากวางจัดเวรได้เลย
- 👥 จัดการคน — แบ่ง 1st / 2nd / 3rd call
- 🎌 วันหยุด — ไฮไลท์วันหยุดราชการไทยอัตโนมัติ
- 🔒 ล็อค/ปลดล็อค — ป้องกันแก้ไขโดยไม่ตั้งใจ
- 🖨️ พิมพ์ได้ — เลย์เอาท์พร้อมพิมพ์

**อยากอัปเดตเวอร์ชันใหม่?**  
ดับเบิลคลิก `Update from GitHub.bat` แค่นั้น!

**อยากอัปโหลดงานที่แก้ไข?**  
ดับเบิลคลิก `Upload to GitHub.bat` แล้วเลือก option 1

---


## 📝 Recent Updates

> See the full update log in [**CHANGELOG.md**](./CHANGELOG.md) — includes what changed, who did it, which version, and what it was based on.  
> 💡 Click on a version to browse the code, or **📥 Download** to get that version as a ZIP.

| Version | Date | Author | Summary | Revert |
|---------|------|--------|---------|--------|
| [`072a115`](https://github.com/cancanboredom/Wayne-management/tree/072a115) | 2026-02-28 | cancanboredom | Improved font typography (spacing, line-height, smoothing) | [📥 Download](https://github.com/cancanboredom/Wayne-management/archive/072a115.zip) |
| [`d35793d`](https://github.com/cancanboredom/Wayne-management/tree/d35793d) | 2026-02-28 | cancanboredom | Added Interactive Change Review to Upload script | [📥 Download](https://github.com/cancanboredom/Wayne-management/archive/d35793d.zip) |
| [`6b1542a`](https://github.com/cancanboredom/Wayne-management/tree/6b1542a) | 2026-02-28 | cancanboredom | Added GitHub Codespaces & Gitpod support | [📥 Download](https://github.com/cancanboredom/Wayne-management/archive/6b1542a.zip) |
| [`5fd003a`](https://github.com/cancanboredom/Wayne-management/tree/5fd003a) | 2026-02-28 | cancanboredom | Initial commit — full app with LINE Seed TH font | [📥 Download](https://github.com/cancanboredom/Wayne-management/archive/5fd003a.zip) |

---


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
