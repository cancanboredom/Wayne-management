import express from "express";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import Database from "better-sqlite3";
import fs from "fs";

dotenv.config();

// Initialize SQLite database
const db = new Database('wayne_duty.db');

// Setup tables
db.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    color TEXT,
    role TEXT,
    subset TEXT,
    unavailableDates TEXT,
    targetTotal INTEGER,
    targetHoliday INTEGER,
    targetWeekday INTEGER,
    "group" TEXT
  );

  CREATE TABLE IF NOT EXISTS shifts (
    date TEXT,
    personId TEXT,
    level TEXT,
    PRIMARY KEY (date, personId, level)
  );

  CREATE TABLE IF NOT EXISTS manual_highlights (
    date TEXT PRIMARY KEY
  );
  
  CREATE TABLE IF NOT EXISTS noon_days (
    date TEXT PRIMARY KEY
  );
  
  CREATE TABLE IF NOT EXISTS versions (
    id TEXT PRIMARY KEY,
    timestamp INTEGER,
    month TEXT,
    shifts TEXT
  );
  
  CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Increase payload limit for base64 images
  app.use(express.json({ limit: '50mb' }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/holidays", async (req, res) => {
    try {
      // Fetch Thai holidays from Google Calendar public ICS feed
      const response = await fetch("https://calendar.google.com/calendar/ical/th.th%23holiday%40group.v.calendar.google.com/public/basic.ics");
      if (!response.ok) {
        throw new Error("Failed to fetch holidays");
      }
      const icsData = await response.text();

      const holidays = [];
      const lines = icsData.split(/\r?\n/);
      let currentEvent = null;

      for (const line of lines) {
        if (line.startsWith("BEGIN:VEVENT")) {
          currentEvent = {};
        } else if (line.startsWith("END:VEVENT")) {
          if (currentEvent && currentEvent.date && currentEvent.name) {
            holidays.push(currentEvent);
          }
          currentEvent = null;
        } else if (currentEvent) {
          if (line.startsWith("DTSTART;VALUE=DATE:")) {
            const dateStr = line.substring("DTSTART;VALUE=DATE:".length);
            if (dateStr.length === 8) {
              currentEvent.date = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
            }
          } else if (line.startsWith("SUMMARY:")) {
            currentEvent.name = line.substring("SUMMARY:".length);
          }
        }
      }

      res.json({ holidays });
    } catch (error) {
      console.error("Error fetching holidays:", error);
      res.status(500).json({ error: "Failed to fetch holidays" });
    }
  });

  app.post("/api/smart-import", async (req, res) => {
    try {
      const { base64Data, mimeType, currentDateStr, people } = req.body;

      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

      const prompt = `
        Analyze this schedule image.
        The current month is ${currentDateStr}.
        Here is the list of available personnel: ${JSON.stringify(people)}.
        Extract the shifts and return a JSON array of objects with this exact structure:
        [
          { "date": "YYYY-MM-DD", "personId": "matched_id_from_list", "level": "1A" | "1B" | "2" | "3" }
        ]
        Map the names in the image to the closest personId. 
        1A is usually "เวรบน" or "1st Call Top".
        1B is usually "เวรล่าง" or "1st Call Bottom".
        2 is "Second Call" or "เวร 2".
        3 is "Third Call" or "เวร 3".
        CRITICAL INSTRUCTION: ONLY return shifts for slots that ACTUALLY HAVE A NAME written in them in the image. DO NOT guess or fill in empty slots. If a slot is empty in the image, DO NOT include it in the JSON array.
        Only return the JSON array. Do not include markdown formatting like json.
      `;

      // The user requested nano banana v.2 API (gemini-3.1-flash-image-preview)
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-image-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: mimeType } },
            { text: prompt }
          ]
        }
      });

      let extractedText = "";
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.text) {
          extractedText += part.text;
        }
      }

      let extractedShifts = [];
      try {
        let text = extractedText || "[]";
        text = text.replace(/```json\n?/gi, '').replace(/```/g, '').trim();
        extractedShifts = JSON.parse(text);
      } catch (e) {
        console.error("Failed to parse JSON:", e);
        // Fallback if the model fails to return valid JSON
        return res.status(500).json({ error: "Failed to parse schedule data from image." });
      }

      res.json({ shifts: extractedShifts });
    } catch (error) {
      console.error("Smart import error:", error);
      res.status(500).json({ error: "Internal server error during smart import." });
    }
  });

  // --- Database API Routes ---

  // Get all state
  app.get("/api/state", (req, res) => {
    try {
      const people = db.prepare("SELECT * FROM people").all().map((p: any) => ({
        ...p,
        unavailableDates: p.unavailableDates ? JSON.parse(p.unavailableDates) : undefined
      }));

      const shifts = db.prepare("SELECT * FROM shifts").all();

      const manualHighlights = db.prepare("SELECT date FROM manual_highlights").all().map((r: any) => r.date);
      const noonDays = db.prepare("SELECT date FROM noon_days").all().map((r: any) => r.date);

      const versionsRaw = db.prepare("SELECT * FROM versions").all();
      const versions = versionsRaw.map((v: any) => ({
        ...v,
        shifts: JSON.parse(v.shifts)
      }));

      res.json({ people, shifts, manualHighlights, noonDays, versions });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to fetch state" });
    }
  });

  // Save people
  app.post("/api/people", (req, res) => {
    try {
      const people = req.body;
      db.prepare("DELETE FROM people").run();

      const insert = db.prepare(`
        INSERT INTO people (id, name, color, role, subset, unavailableDates, targetTotal, targetHoliday, targetWeekday, "group") 
        VALUES (@id, @name, @color, @role, @subset, @unavailableDates, @targetTotal, @targetHoliday, @targetWeekday, @group)
      `);

      const insertMany = db.transaction((items) => {
        for (const item of items) {
          insert.run({
            ...item,
            unavailableDates: item.unavailableDates ? JSON.stringify(item.unavailableDates) : null,
          });
        }
      });

      insertMany(people);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save people" });
    }
  });

  // Save shifts
  app.post("/api/shifts", (req, res) => {
    try {
      const shifts = req.body;
      db.prepare("DELETE FROM shifts").run();

      const insert = db.prepare("INSERT INTO shifts (date, personId, level) VALUES (@date, @personId, @level)");

      const insertMany = db.transaction((items) => {
        for (const item of items) {
          insert.run(item);
        }
      });

      insertMany(shifts);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save shifts" });
    }
  });

  // Save highlights & noon days
  app.post("/api/highlights", (req, res) => {
    try {
      const { manualHighlights, noonDays } = req.body;

      const saveHighlights = db.transaction(() => {
        db.prepare("DELETE FROM manual_highlights").run();
        const insertH = db.prepare("INSERT INTO manual_highlights (date) VALUES (?)");
        for (const date of manualHighlights || []) insertH.run(date);

        db.prepare("DELETE FROM noon_days").run();
        const insertN = db.prepare("INSERT INTO noon_days (date) VALUES (?)");
        for (const date of noonDays || []) insertN.run(date);
      });

      saveHighlights();
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save highlights" });
    }
  });

  // Versions API
  app.post("/api/versions", (req, res) => {
    try {
      const versions = req.body;
      db.prepare("DELETE FROM versions").run();
      const insert = db.prepare("INSERT INTO versions (id, timestamp, month, shifts) VALUES (@id, @timestamp, @month, @shifts)");
      const insertMany = db.transaction((items) => {
        for (const item of items) {
          insert.run({ ...item, shifts: JSON.stringify(item.shifts) });
        }
      });
      insertMany(versions);
      res.json({ success: true });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: "Failed to save versions" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static("dist"));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
