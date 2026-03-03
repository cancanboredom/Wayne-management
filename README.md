# 📋 Duty Management System

A web-based duty/shift scheduling application built with React, TypeScript, and Express.

> 💰 **This project runs 100% free!** See [FREE_USAGE_GUIDE.md](./FREE_USAGE_GUIDE.md) for details on free tier limits, how to stay free, and how to deploy to Firebase.  
> 🚀 **Deploy to Vercel + Supabase yourself:** [VERCEL_SUPABASE_DEPLOYMENT_MANUAL.md](./docs/VERCEL_SUPABASE_DEPLOYMENT_MANUAL.md)

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
| [**v5.3.2**](./CHANGELOG.md#v532---2026-03-03) | 2026-03-03 | Oat9898 + Codex | Universal fairness overhaul: hard cohort gap enforcement for Noon/Holiday (<=1), non-overlapping day-class semantics, solver entry modernization, and Rules UI simplification | Branch release |
| [**v5.1**](./CHANGELOG.md#v51---2026-03-02) | 2026-03-02 | Oat9898 + Codex | Premium PDF export release: landscape calendar print stabilization, improved Excel page fit, subset-grouped team summary, and noon metric visibility | Branch release |
| [**v5.0**](./CHANGELOG.md#v50---2026-03-02) | 2026-03-02 | Oat9898 + Codex | Stable monthly locking, retrospective integrity, and history UX overhaul | Branch release |
| [**v4.4**](./CHANGELOG.md#v44---2026-03-02) | 2026-03-02 | Oat9898 + Codex | Masterful UI Polish: personnel search & filter, redesigned custom glassmorphism month picker, and enhanced summary tables | Branch release |
| [**v4.1**](./CHANGELOG.md#v41---2026-03-02-1140) | 2026-03-02 | Oat9898 + Codex | Stability/collaboration update: scheduling core refactor, workflow polish, motion upgrades, and preview-readonly deployment readiness | Branch release |
| [**v4.0.0**](./CHANGELOG.md#v400---2026-03-01-1313) | 2026-03-01 | Antigravity + Claude Code | Duty management refinements, direct calendar highlight, month-based personnel lists, and performance optimization | See changelog |
| [**v3.0.0**](./CHANGELOG.md#v300---2026-03-01-0330) | 2026-03-01 | Antigravity + Claude Code | Architecture migration to modular frontend, Express+SQLite backend, and advanced hybrid solver | See changelog |
| [**v2.2.0**](https://github.com/Oat9898/Wayne-management/tree/v2.2.0) | 2026-02-28 | Oat9898 | Personnel duty highlight, improved changelog UX, and timestamp-based sorting | [📥 Download](https://github.com/Oat9898/Wayne-management/archive/refs/tags/v2.2.0.zip) |
| [`de2f2d6`](https://github.com/Oat9898/Wayne-management/commit/de2f2d6) | 2026-02-28 | cancanboredom | Switch repository to Oat9898/Wayne-management and update documentation links | [📥 Download](https://github.com/Oat9898/Wayne-management/archive/de2f2d6.zip) |
| [`072a115`](https://github.com/Oat9898/Wayne-management/tree/072a115) | 2026-02-28 | cancanboredom | Improved font typography (spacing, line-height, smoothing) | [📥 Download](https://github.com/Oat9898/Wayne-management/archive/072a115.zip) |
| [**Oat v18.33**](./Oat%20version%2018.33/) | 2026-02-28 | Oat9898 | Integrated version with Landing Page and Access Control | [📥 Download](./Oat%20version%2018.33.zip) |
| [**Logic Claude**](./logic%20from%20claude/) | 2026-02-28 | cancanboredom | Core logic, date utils, and Firebase integration from Claude | [📥 Download](./logic%20from%20claude.zip) |
| [`d35793d`](https://github.com/Oat9898/Wayne-management/tree/d35793d) | 2026-02-28 | cancanboredom | Added Interactive Change Review to Upload script | [📥 Download](https://github.com/Oat9898/Wayne-management/archive/d35793d.zip) |
| [`6b1542a`](https://github.com/Oat9898/Wayne-management/tree/6b1542a) | 2026-02-28 | cancanboredom | Added GitHub Codespaces & Gitpod support | [📥 Download](https://github.com/Oat9898/Wayne-management/archive/6b1542a.zip) |
| [`5fd003a`](https://github.com/Oat9898/Wayne-management/tree/5fd003a) | 2026-02-28 | cancanboredom | Initial commit — full app with LINE Seed TH font | [📥 Download](https://github.com/Oat9898/Wayne-management/archive/5fd003a.zip) |

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

### Step 2 — Set Up Environment (Optional)

The Gemini API key is **optional** — it's only needed for the Smart Import feature (AI image reading). The app works fully without it.

```bash
copy .env.example .env.local
```

Then edit `.env.local` and replace `YOUR_GEMINI_API_KEY_HERE` with your actual key (free at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)).

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
| `npm run motion:check` | Enforce GSAP-first animation policy |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |

---

## 🔗 Public Preview URL (Railway)

For new users, the easiest onboarding flow is a single Railway URL that works on desktop and mobile.

- No local setup required
- No `localhost` needed
- Safe demo mode with write-protection

This project now supports **read-only preview mode** using:

- `PREVIEW_READONLY=true`
- Response for blocked writes: `403 { "error": "Preview is read-only", "code": "PREVIEW_READONLY" }`

Quick setup:

1. Connect this GitHub repo to Railway (branch `main`, auto-deploy on).
2. Railway will use [`railway.json`](./railway.json) automatically.
3. Set variables:
   - `NODE_ENV=production`
   - `PREVIEW_READONLY=true`
   - `GEMINI_API_KEY` (optional)
4. Share the Railway URL with new users.

Full guide: [`docs/preview-deploy.md`](./docs/preview-deploy.md)

### How Preview Behaves In UI

When `PREVIEW_READONLY=true`, users will see:

- A persistent **Preview Read only** badge in the app shell
- A dismissible info banner explaining that edit controls are disabled
- Disabled mutation controls (Save/Add/Delete/Generate/Rule updates) with explanation tooltip

So preview users understand read-only mode immediately, before clicking anything.

---

## 🌐 Deploy to Firebase (Free)

This project is configured to deploy as a static site to Firebase Hosting for free.
All data is stored in the browser (`localStorage`), so no cloud database is needed!

1. Install Firebase tools: `npm install -g firebase-tools`
2. Log in: `firebase login`
3. Edit `.firebaserc` and replace `your-firebase-project-id-here` with your real Firebase Project ID
4. Double-click `Deploy to Firebase.bat` or run `npm run deploy`

---

## ▲ Deploy to Vercel + Supabase

Use this step-by-step manual for production self-deployment:

- [`docs/VERCEL_SUPABASE_DEPLOYMENT_MANUAL.md`](./docs/VERCEL_SUPABASE_DEPLOYMENT_MANUAL.md)

---

## 👥 For Contributors

1. Double-click **`Update from GitHub.bat`** to get the latest code
2. Make your changes
3. Run `npm run motion:check` and `npm run lint`
4. Double-click **`Upload to GitHub.bat`** and choose option 1
5. Enter a short description of your changes
6. Done! Everyone else can pull the update with `Update from GitHub.bat`

Animation rules are documented in [`docs/motion-policy.md`](./docs/motion-policy.md).

## 🛠️ Handy Bat Files (Windows)

| File | What it does |
|------|--------------|
| **`Update from GitHub.bat`** | Pull latest code, install deps, optionally start app |
| **`Upload to GitHub.bat`** | Commit & push your changes to GitHub |
| **`Preview App.bat`** | Quick pull + start dev server |
| **`Deploy to Firebase.bat`** | Build and deploy to Firebase Hosting |
