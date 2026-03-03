# ShiftPlan — Backend Logic (`src/lib/`)

ไฟล์ทั้งหมดนี้คือ **business logic ล้วนๆ** ไม่มี React ไม่มี UI
สามารถ import ใน Antigravity ได้เลย

---

## ไฟล์และหน้าที่

```
src/lib/
├── index.js        ← barrel export (import ทุกอย่างจากที่นี่)
├── constants.js    ← roles, weights, holidays, SA params
├── types.js        ← JSDoc type definitions ทั้งหมด
├── dateUtils.js    ← date helpers + Firestore key helpers
├── firebase.js     ← Firebase init (อ่าน env vars)
├── firestore.js    ← read/write Firestore (subscribe + save)
└── solver.js       ← SA Engine v3 (constraint optimizer)
```

---

## วิธีใช้งาน

```js
import { solve, saveSchedule, subscribeAll, ROLES, monthKey } from "@/lib";

// 1. Subscribe ข้อมูลทั้งหมดของเดือน
const unsub = subscribeAll(2025, 2, {       // มีนาคม 2025
  onMembers:  ({ list, nextId }) => { ... },
  onConfig:   (config) => { ... },           // OFF, picks, conf, noon
  onSchedule: (result) => { ... },           // null ถ้ายังไม่มี
  onError:    (err) => console.error(err),
});

// 2. จัดตารางเวร
const result = solve(members, config, 2025, 2);
// result = { schedule, stats, violations, bestC }

// 3. บันทึก
await saveSchedule(2025, 2, result);

// cleanup
return () => unsub();
```

---

## Firestore Collections

| Collection   | Document    | เก็บอะไร |
|-------------|-------------|---------|
| `sp`        | `members`   | รายชื่อทีมทั้งหมด (ทุกเดือนใช้ร่วม) |
| `sp_cfg`    | `2025-03`   | OFF constraints, conf/noon days, R1 self-picks |
| `sp_sched`  | `2025-03`   | ตารางเวร + stats + violations จาก SA |

---

## Solver — Constraint Hierarchy

### 🔴 ABSOLUTE (penalty = 999,999)
| Code | ความหมาย |
|------|---------|
| `OFF` | สมาชิก mark OFF วันนั้น — ห้ามจัดเวรเด็ดขาด |
| `CONSEC` | เวรติดกัน 2 วัน (same slot) |
| `DUP` | คนซ้ำหลาย slot วันเดียวกัน |
| `R1SIR_R1SRY` | R1ศิริ 1st + R1สระ 2nd วันเดียวกัน |
| `R3SIR_TOTAL` | R3ศิริ 2nd+3rd รวมต้องเท่ากับ **5** ต่อเดือน |

### 🟠 THE MUST (penalty สูง)
| Code | ความหมาย | Penalty |
|------|---------|---------|
| `R1SIR_CAP` | R1ศิริ 1st call เกิน 6 ครั้ง/เดือน | 8,000 × excess |
| `BAL_2ND_POOL` | balance 2nd call ใน {r2sry, r3sry, r3sir} | 500 × spread |
| `BAL_23_POOL` | balance 2nd+3rd combined | 200 × spread |

### 🟢 SOFT
| Code | ความหมาย | Penalty |
|------|---------|---------|
| `ALT_DAY` | เวรวันเว้นวัน (d และ d+2) | 15 × count |
| `BAL_INTERN` | balance 1st call ใน intern group | 60 × spread |
| `BAL_R1SIR` | balance 1st call ใน r1sir group | 65 × spread |
| `BAL_R1SRY` | balance 1st call ใน r1sry group | 50 × spread |
| `NOON_BAL` | balance noon report shifts | 60 × spread |
| `CONF_BAL` | balance conference shifts | 50 × spread |
| `R3SIR_PULL` | prefer R3ศิริ 2nd คู่กับ R1ศิริ 1st | 30 × miss |

---

## Slot Definitions

```
1st call  (f1, f2)  = intern หรือ r1sir    → 2 คนต่อวัน
2nd call  (sec)     = r1sry, r2sry, r3sry, r3sir
3rd call  (thi)     = r2sry, r3sry, r3sir  → มีเฉพาะวันที่ sec = r1sry
```

---

## Environment Variables

```bash
# .env.local
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
```

ใน Vercel: Settings → Environment Variables → เพิ่มทั้ง 6 ตัว
