# 💰 Free Usage Guide

> **This project is designed to run 100% free.** This guide helps everyone know what has limits.

---

## Quick Overview

| Service | Free Limit | What Happens When Exceeded |
|---------|-----------|---------------------------|
| **Gemini API** (Smart Import) | 250 req/day | Upload button disabled, resets next day |
| **Firebase Hosting** (Web deployment) | 10 GB storage, 360 MB/day transfer | Site unavailable until next cycle |
| GitHub (repo, hosting code) | ♾️ Unlimited | — |
| SQLite Database / LocalStorage | ♾️ Unlimited | — |
| All npm packages | ♾️ Open source | — |

---

## 🤖 Gemini API (Smart Import Feature)

**What it does:** AI reads schedule images and auto-fills shifts.

**Free tier:** ~250 requests/day per API key (no billing needed).

**How to stay free:**
1. Get a free key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey)
2. **Do NOT enable billing** — just create the key and use it
3. The app **tracks your usage** and shows warnings:
   - 🟢 Green: Normal usage
   - 🟡 Yellow (80%+ used): "Approaching limit" warning
   - 🔴 Red (100%): Upload disabled until tomorrow

**Is it optional?** Yes! The app works completely without it. All manual scheduling, calendar, personnel management, etc. work without an API key.

---

## 🔥 Firebase Hosting (Web Deployment)

**What it does:** Hosts the static files for the website so anyone on your team can access it via a public URL.

**Free tier (Spark Plan):**
- 10 GB of total storage
- 360 MB/day data transfer (bandwidth)

**How to stay free:**
- Create a project at [console.firebase.google.com](https://console.firebase.google.com)
- Stay on the **Spark Plan** (do not upgrade to pay-as-you-go Blaze)
- The app stores all data in the browser (`localStorage`), so it doesn't need Firebase Database or Firestore (which have stricter limits).

---

## 💻 Local Development (Always Free)

- **GitHub** — Public repos are free, unlimited
- **SQLite** — Local database file, completely free
- **npm packages** — All open source, no fees
- **Thai holiday data** — Public Google Calendar feed, free
- **Fonts** — Bundled locally (LINE Seed TH), no CDN costs
- **Local development** — `npm run dev` on your machine, free forever

---

## ⚠️ What Could Cost Money (If You're Not Careful)

1. **Enabling billing on Gemini API** — Don't do this unless you intentionally want to pay
2. **Upgrading Firebase to Blaze Plan** — Stay on the free Spark plan
3. **Adding GitHub Actions** — Public repos get 2,000 free minutes/month, stay within that

---

*Last updated: February 2026*
