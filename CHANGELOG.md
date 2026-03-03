# Update Log

All notable changes to the **Duty Management System** are documented here.  
Each entry includes: **what changed**, **who did it**, **version (commit)**, and **what it was based on**.

> **Want to revert?** Click the **Download ZIP** link next to any version to download that exact version of the project.

---
---

## [v5.3.2] - 2026-03-03
**Author:** Oat9898 + Codex
**Based on:** v5.3.1

### Evolution: Universal Solver Fairness Overhaul + Cohort Gap Hardening

#### 1) Universal Fairness Enforcement for Noon/Holiday
- Standardized fairness evaluation to use exclusive day classes:
  - `Noon` counts only noon-marked days
  - `Holiday` excludes noon days (no overlap double-counting)
- Added strict cohort-level hard rule for fairness:
  - `Holiday gap <= 1`
  - `Noon gap <= 1`
- When impossible due to locks/OFF constraints, solver now reports explicit infeasibility reasons instead of silently drifting.

#### 2) Solver Entry Path Modernization
- Removed greedy-first warm-start from the main optimization entry path.
- Replaced with multi-start stochastic initialization + SA + LNS refinement loop for better robustness on fairness-heavy months.

#### 3) Universal Routing as Primary API Path
- Simplified solve flow to use universal solver routing as the primary path.
- Removed runtime primary/shadow switching complexity in solve response path.
- Preserved output compatibility while extending metadata with cohort-gap violation details.

#### 4) Rules UX Simplification (Human-Friendly)
- Reworded fairness cohort UI copy to be easier for non-technical users.
- Added live cohort preview lines:
  - `Holiday gap = X (ผ่าน/เกิน)`
  - `Noon gap = X (ผ่าน/เกิน)`
- Hid technical fields behind Advanced mode and enforced fairness cap semantics in save/validation flow.

#### 5) Data + Deployment Readiness
- Included updated SQLite database snapshot (`wayne_duty.db`) in release preparation as requested.
- Verified build and lint success for deployment readiness.

#### 6) Why This Release Matters
- Prevents unfair cohort distributions such as `3 vs 0` in Noon/Holiday allocations.
- Makes solver outcomes more predictable by removing overlapping day-class accounting.
- Improves operator trust with clearer infeasibility reasons and simpler fairness controls in UI.

---

## [v5.3.1] - 2026-03-03
**Author:** Oat9898 + Codex
**Based on:** v5.3

### Evolution: Calendar/Spreadsheet Stability and Month-Switch Crash Fixes

#### 1) React Hook Safety in View Rendering
- Fixed invalid hook usage in `CalendarDashboard` where UI-store hooks were called inside render loops.
- Moved view-density and highlight settings reads to component-level hook usage to preserve React hook order.
- Result: switching between **Calendar** and **Spreadsheet** no longer triggers hook-order runtime crashes.

#### 2) Settings Hook Safety and Value Validation
- Fixed invalid hook usage in `AppSettings` where UI-store hooks were called inside mapped render branches and inline closures.
- Added strict parsing for imported/loaded `defaultView` and `animationLevel` to reject malformed values and fall back safely.
- Result: settings-state hydration/import can no longer destabilize navigation/render flows.

#### 3) Defensive Data Guards for Month/View Transitions
- Added shift-shape sanitization in the schedule store to filter malformed rows before render/indexing.
- Hardened off-day (`unavailableDates`) rendering paths to ignore non-string/invalid date items before parsing day numbers.
- Result: month changes and cross-view transitions remain stable even when legacy or malformed local data exists.

#### 4) Why This Release Matters
- Eliminates reproducible crashes during high-frequency workflow actions: **change month**, **switch view**, and **return from other tabs**.
- Improves resilience against corrupted local state and inconsistent imported settings.
- Provides a safer baseline for subsequent UI and scheduling improvements on top of v5.3.

---

## [v5.3] - 2026-03-03
**Author:** Oat9898 + Codex
**Based on:** v5.2.1

### Evolution: Settings Separation, Theme Recovery, Data Restoration Integrity, Spreadsheet Clarity, and PDF Output Modernization

#### 1) Sidebar and Settings IA Split (Rules & Tags vs App Settings)
- Restored **Rules & Tags** to its own dedicated route and navigation section.
- Added a separate **Settings** tab above **Disconnect** so global app preferences and rule configuration are no longer mixed.
- Introduced dedicated `/app-settings` route while preserving existing `/settings` behavior for rules management.
- Standardized the "Settings" navigation link text styling to match the muted appearance of footer buttons.

#### 2) App Settings Expansion and Theme Controls
- Expanded Settings page into a full app-preferences surface (theme picker, behavior toggles, utility actions).
- Preserved local preference model in browser storage while keeping operational data in DB-backed APIs.
- Standardized reset behavior so app settings and theme defaults are consistent and predictable.

#### 3) Theme System Recovery from v5.1 and Default Theme Change
- Recovered the original v5.1 visual identity as a new theme option: **Classic 5.1** (updated to a lighter, clean `#fdfdfc` off-white).
- Added Classic 5.1 to centralized theme registry (`useThemeStore`) and theme picker UI.
- Set **Classic 5.1** as the new default theme for first-load and hydration fallback.
- Added corresponding CSS token surface (`[data-theme="classic-5-1"]`) including shell/sidebar/hover tuning to match the legacy feel.
- Added consistent active state styling (`--ui-nav-active-bg`, `--ui-nav-active-text`) with a colored left border highlight for active sidebar tabs.

#### 4) Spreadsheet View Color Readability Upgrade (Live Editing)
- Introduced pastel color rendering tied to each person’s own `person.color` in spreadsheet assignment cells.
- Applied the same person-color pastel mapping to dropdown option rows for direct visual recognition.
- Removed conflicting semantic overlays from selected dropdown cells so chosen-person color remains deterministic.
- Reduced intensity of 2nd/3rd column tint backgrounds for better legibility.
- Softened green holiday/weekend row intensity to reduce visual collision with assignment colors, and applied the highlight across the full row.

#### 5) UI Polish and Component Enhancements
- Fixed mixed-color artifacts where selected-cell background previously contaminated dropdown option tint perception.
- Switched option/cell pastel rendering to stable lightened solid tones for consistent color output.
- Enforced white backgrounds on empty `<select>` dropdowns across all light themes for a cleaner look.
- **Auto-Generate Redesign**: Upgraded the standard generator buttons into a premium popover with glassmorphism, visual descriptions, and fluid hover animations.
- **Changelog Styling**: Added decorative green gradient background blobs and scroll animations.

#### 6) Violation Panel UX Enhancement
- Added drag-to-resize functionality to the bottom **Violation Panel**.
- Users can now drag the top border of the table to seamlessly adjust its height when not collapsed, allowing for customized workspace layouts during dense editing sessions.

#### 7) PDF Export Visual Refresh and Layout Policy Updates
- Completely overhauled PDF styling to be **Theme-Aware**. Each of the 5 themes now maps to a unique, modern color palette for PDF generation.
- **Page 1 (Calendar View):** removed aged gradient look in favor of cleaner flat visual treatment with modern theme palettes.
- **Page 2 (Excel View):**
  - Removed box/chip framing around names for a more modern tabular report look.
  - Tuned density/typography to improve fit behavior.
  - Applied requested orientation change to **A4 portrait** for Excel page output.
- Preserved multi-page report flow while modernizing appearance and improving print ergonomics.

#### 8) Stability and UX Safeguards
- Maintained month-lock logic compatibility while evolving migration integrity rules.
- Kept preview/read-only protection behavior in mutation paths.
- Preserved route and layout compatibility with existing dashboard modules.

#### 9) Why This Release Matters
- Separates configuration concerns cleanly, reducing navigation friction and future UI coupling.
- Restores trusted v5.1 look-and-feel while keeping newer theme infrastructure.
- Provides total workspace flexibility with the resizable violation panel and premium dropdown redesigns.
- Improves spreadsheet usability for high-density scheduling through clearer color semantics.
- Delivers cleaner, more professional, and highly aesthetic PDF outputs aligned with practical reporting workflows.

---

## [v5.2.1] - 2026-03-03
**Author:** Antigravity + Codex
**Based on:** v5.1

### Evolution: V5.2.1 Maintenance & Delivery
- Prepared and published `V5.2.1` branch to GitHub.
- Synchronized latest codebase version and ensured recent updates from development are preserved.
- Updated version metadata across the repository to ensure changelog alignment.

---

## [v5.1] - 2026-03-02
**Author:** Oat9898 + Codex
**Based on:** v5.0

### Evolution: Multi-Page PDF Export Completion and Print Layout Hardening

#### 1) New PDF Export Entry Point in Calendar
- Added Export PDF action directly in Calendar toolbar.
- Replaced the unused CSV export path for monthly reporting workflows.
- Export now generates a presentation-ready monthly report instead of raw rows only.

#### 2) End-to-End PDF Rendering Pipeline (Client-Side)
- Implemented HTML/CSS-based print document generation from live schedule data.
- Structured output into three report surfaces:
  - **Page 1:** Calendar board for the selected month
  - **Page 2:** Excel-style daily assignment matrix
  - **Page 3:** Team summary table
- Added HTML escaping for rendered names/labels to prevent malformed print output.

#### 3) Blank Export Fix and Print Reliability
- Replaced popup-window print flow with hidden iframe print flow.
- Triggered print only after document load completion (onload + delayed print).
- Added post-print iframe cleanup to avoid stale frame accumulation.

#### 4) Calendar Page-1 Visual Specification (v5.1)
- Implemented Page 1 as **landscape A4** by design in this release.
- Added branded calendar styling: weekday bars, holiday pills, level color coding, and card-based days.
- Kept names single-line with truncation to improve readability in dense assignment days.

#### 5) Calendar Size Consistency Regardless of Assignment Count
- Locked Page-1 calendar layout to fixed dimensions so output size is stable month-to-month.
- Added fixed-height/flex grid controls so sparse and dense months render in the same page footprint.
- Applied overflow clipping inside day cells so content does not push Calendar into an extra page.
- Removed visual placeholders for empty assignments to keep the page clean while preserving geometry.

#### 6) Excel Page Refinement for Readability and Coverage
- Added green row highlight for holidays/weekends across the full row.
- Rebalanced table typography, spacing, and column widths to use page area more effectively.
- Tuned print density so the matrix remains readable while filling the page more naturally.

#### 7) Team Summary Intelligence Upgrade
- Changed grouping model from call-role buckets to **subset/group** buckets (for example Intern, R1 Saraburi-style groups).
- Preserved deterministic group ordering using configured subset definitions.
- Added **Noon** metric column and aligned grouped header spans with the expanded table.

#### 8) Release Metadata Alignment
- Set latest release line to `v5.1` in changelog/README-facing release surfaces.
- Updated UI fallback latest-version labels to `v5.1` to keep badges/popups consistent when parsing fails.

#### 9) Push-Time Changelog Enforcement
- Added `scripts/enforce-changelog-on-push.mjs` to block push when `CHANGELOG.md` is not updated.
- If changelog is unchanged, the script estimates update size and suggests version bump strategy:
  - large update -> `major` bump (for example `5.1 -> 6.0`)
  - small update -> `minor` bump (for example `5.1 -> 5.2`)
- If changelog is updated, it runs layout validation and allows push only when format matches policy.

#### 10) Encoding Hardening and Mojibake Cleanup
- Fixed corrupted characters in changelog/UI text (for example Thai mojibake sequences like `à¸...`).
- Added `.editorconfig` with UTF-8 defaults and line-ending normalization.
- Added `.gitattributes` encoding rules to keep markdown/code files in UTF-8 and reduce future text corruption.
- Fixed frontend violation text literals that were previously rendered as mojibake (e.g. `!5@'#'1@'I'1`), restoring readable Thai messages in the Violation Panel.
- Added `scripts/check-text-corruption.mjs` and integrated it into `npm run lint` to block known corruption signatures before merge/push.

#### 11) Why This Release Matters
- Converts export from a utility action into a usable monthly report workflow.
- Makes PDF output dependable in real browser print environments.
- Delivers cleaner and more operationally useful summaries (subset grouping + noon visibility) with stable page geometry.
- Adds release-process safety so important updates cannot be pushed without proper changelog/versioning discipline.
- Reduces recurring encoding issues that create unreadable text in UI/docs.
---

## [v5.0] - 2026-03-02
**Author:** Oat9898 + Codex
**Based on:** v4.4

### Evolution: Stable Monthly Locking, Retrospective Integrity, and History UX Overhaul

#### 1) Major Retrospective Model Upgrade: Month Lock as the Source of Truth
- Introduced a month-level lock workflow that pins one selected history version directly to Calendar view.
- A locked month now keeps historical duty assignments visible even if current personnel pools later change (rename, role changes, or deletion).
- Implemented single-lock-per-month behavior to prevent ambiguity and guarantee deterministic retrospective viewing.

#### 2) Version-People Snapshot Persistence (Server + Local Fallback)
- Added persistent `version_people_snapshots` storage to preserve the people identity map used by each locked version.
- Locking now reuses cached version snapshots when available, preventing accidental name drift after unlock/relock cycles.
- Added local fallback snapshot persistence for compatibility when lock endpoints are unavailable, preserving behavior in degraded environments.

#### 3) Calendar and Excel Locked-Month Consistency
- Unified locked-month data loading so both Calendar and Excel views read from the locked source when a month is locked.
- Fixed prior inconsistency where Calendar could still show pinned names while Excel cells appeared empty.
- Result: retrospective review is now consistent across views for the same locked month.

#### 4) Lock/Unlock API Hardening and 404 Reliability
- Added and stabilized month-lock API routes for load, lock, and unlock.
- Fixed route-collision bug that produced `monthKey must be YYYY-MM` on unlock attempts.
- Reordered unlock routing and updated client request priority to use `/api/month-lock/:monthKey/unlock` first.
- Improved client fallback handling for missing endpoints (`404`) to avoid broken user flows.

#### 5) Unlock Security Flow with In-App UX
- Standardized unlock protection for locked months.
- Replaced native browser prompt flow with an in-app unlock interface in History modal.
- Added cleaner UX copy and removed noisy helper text per product direction.

#### 6) History Management Expansion: Named Versions + Rename
- Extended schedule version schema with optional `name` support.
- Added DB migration and persistence handling so saved version names survive reloads.
- Added per-item rename controls in History modal to support clearer milestone snapshots (for example: "Final after handoff edits").

#### 7) Lock-State Guardrails for Safer Operations
- Disabled restore actions while month lock is active to prevent accidental overwrite of pinned retrospective data.
- Added both UI-level and logic-level guards, with clear feedback when users attempt restricted actions during lock state.
- Kept unlock explicit and intentional before mutating month state.

#### 8) Snapshot Feature Consolidation
- Removed separate month snapshot flow that overlapped with lock behavior.
- Consolidated retrospective strategy around lock + version snapshot persistence to reduce duplicate paths and failure modes.
- Eliminated snapshot parse/load errors caused by stale JSON/HTML responses in old flow.

#### 9) Data Integrity and Validation Continuity
- Preserved strict normalization and conflict cleanup before save to avoid duplicate date/person or date/level collisions.
- Continued server-side orphan person-ID defenses to prevent deleted identities from re-entering shift payloads.
- Maintained more transparent API error surfacing so the UI can show actionable backend reasons.

#### 10) Text/Encoding and UX Polish Fixes
- Removed mojibake and corrupted text artifacts in key scheduling messages and preview labels.
- Replaced problematic non-ASCII artifacts in UI labels that previously caused visual noise.
- Continued Excel visual refinement with softer assignment-color treatment for improved readability during dense editing.

#### 11) Why This Release Matters
- Delivers a stable, production-ready retrospective workflow for completed months.
- Ensures historical schedules remain trustworthy even as active personnel records evolve over time.
- Reduces operational risk by combining stronger lock semantics, clearer history controls, and hardened backend behavior.

---

## [v4.4] - 2026-03-02
**Author:** Oat9898 + Codex
**Based on:** v4.3

### Evolution: Masterful UI Polish and Filtering Enhancements

#### 1) Advanced Personnel Search & Filter
- Added real-time text search and subset filtering to the personnel list.
- Makes it significantly easier to find and manage specific team members in large rosters.

#### 2) Personnel Summary Table Enhancements
- **Total Shifts Column**: Added a dedicated column computing Weekday + Holiday shifts.
- **English Translations**: Translated Thai headers ("วันเว้นวัน", "วันติดกัน") to "Alt Days" and "Consecutive" for a unified interface.
- **Visual Clarity**: Redesigned the data grid with alternating column background colors (`bg-slate-50/70`) and high-contrast bold black text (`text-gray-900`). This drastically improves readability of complex shift distributions.

#### 3) Custom Glassmorphism Month Picker
- Eliminated the clunky native browser month input across the Monthly Roster interface.
- Built a visually stunning, fully custom dropdown picker with a 12-month grid, year toggles, animated transitions, and slick hover states.

#### 4) Calendar Polish
- **Current Day Highlighting**: Replaced the solid green background with a subtle, premium dark green border (`ring-emerald-600`) to perfectly distinguish today's date from green holiday blocks.
- **Clear Month Modal**: Removed the jarring native `confirm()` dialog. Replaced it with a beautifully integrated, animated, in-app warning modal to protect against accidental data loss.

---

## [v4.3] - 2026-03-02
**Author:** Oat9898 + Codex
**Based on:** v4.2

### Evolution: Changelog UX, Parsing Automation, and Release Policy Guardrails

#### 1) Full Release Notes Visual Redesign
- Reworked **Changelog > Full Release Notes** into a cleaner card-based layout with one-column readability.
- Kept the existing visual language while improving spacing, hierarchy, and scanability.
- Styled subsection headings (`#### ...`) with stronger emphasis so release topic titles stand out clearly.

#### 2) Markdown-Driven Rendering Improvements
- Continued using `CHANGELOG.md` as the single source of truth for release content.
- Added structured parsing so each release block is rendered consistently across summary and full-detail sections.
- Removed displayed `Author` and `Based on` lines from UI rendering while preserving them in source markdown.

#### 3) Home "What's New" Popup Now Auto-Syncs With Latest Release
- Updated Home popup badge and title to read the latest version directly from `CHANGELOG.md`.
- Updated popup summary bullets to auto-pull from the latest release headings/bullets.
- Result: next updates only require editing changelog content; popup content stays aligned automatically.

#### 4) Shared Parser Refactor for Maintainability
- Added shared release-note parser module used by both **AppLayout** and **Changelog** pages.
- Eliminated duplicated parsing logic to reduce future drift and version mismatch risks.

#### 5) Automated Changelog Format Policy Check
- Added `scripts/check-changelog-format.mjs` and wired it into `npm run lint`.
- New check validates latest release block structure to stay close to the v4.2 style (`Evolution`, numbered sections, and `Why This Release Matters`).
- This creates a practical guardrail so future updates from AI/tools/programs are less likely to skip release-note quality.

#### 6) Why This Release Matters
- Makes release communication more reliable and easier to maintain.
- Reduces manual version-sync work across UI surfaces.
- Establishes a repeatable changelog quality gate for future updates.

---

## [v4.2] - 2026-03-02
**Author:** Oat9898 + Codex
**Based on:** v4.1

### Evolution: Data Integrity, Roster Navigation, and Reliability Fixes

#### 1) Monthly Roster Navigation and Cross-Page Month Context
- Added a month selector in **Personnel > Monthly Roster** so users can explicitly open and edit any month.
- Added URL month context support (`/team?month=YYYY-MM`) so the page state is shareable and deterministic.
- Updated the **Calendar Personnel panel "Manage"** button to open Personnel for the exact month currently shown in the calendar.

#### 2) Shift Persistence and Autosave Stabilization
- Implemented centralized shift autosave helpers to reduce state drift when switching tabs/pages.
- Added unmount flush behavior so pending autosave changes are persisted before navigation completes.
- Updated **Excel View edits** to use the unified autosave path.
- Updated **Restore from History** and generator apply/save flows to persist shifts through the same reliable save path.

#### 3) History Management Improvements
- Added full **Version History management**:
  - Save to DB
  - Restore from DB-backed versions
  - Delete saved versions from UI and DB
- Added explicit UI controls and confirmation strips for restore/delete actions.
- Added missing store actions for replacing and removing versions safely.

#### 4) Clear Month Reliability
- Added backend route for month-scoped clear operations (`POST /api/shifts/clear-month`) to avoid unrelated-month conflict failures.
- Added frontend backward-compatible fallback when older running servers do not expose the new endpoint (404 fallback).
- Result: Clear Month no longer fails just because older/stale shifts elsewhere violate constraints.

#### 5) Duplicate Assignment and Validation Handling
- Prevented invalid same-person multi-level assignment on the same day in Excel interactions.
- Added normalization before save to remove duplicate date/person and date/level conflicts from client payloads.
- Improved API error surfacing so UI shows meaningful failure reasons (including backend `details`) instead of generic messages.

#### 6) Orphan/Legacy Person-ID Cleanup and Future Protection
- Found and cleaned orphan person IDs that existed in shifts/rosters but not in active personnel records.
- Cleaned:
  - `workspace_shifts` and `shifts` orphan rows
  - `month_rosters.includedPersonIds`
  - `month_rosters.overrides`
- Added server-side guard to drop unknown `personId` entries on `/api/shifts` save requests, preventing future reintroduction of deleted users.

#### 7) Violation Table UX
- Added **Collapse / Expand** control for the bottom violation table for better focus during schedule editing.

#### 8) Why This Release Matters
- Eliminates the recurring "data reverted after tab switch" workflow issue.
- Prevents stale/deleted IDs from silently contaminating scheduling state.
- Improves operational confidence by making validation feedback actionable and persistence behavior predictable.

---

## [v4.1] - 2026-03-02 11:40
**Author:** Oat9898 + Codex
**Based on:** v4.0.0

### Evolution: Stability and Collaboration Update
- **Scheduling Core Refactor**: Added shared scheduling/roster utility layers to improve maintainability and solver data flow.
- **Workflow and UI Improvements**: Improved calendar, personnel, and violation workflows with cleaner shared feature modules.
- **Motion System Upgrade**: Added new GSAP presence/motion primitives and refined animation components for better consistency.
- **Preview Deployment Readiness**: Added preview deployment configuration and read-only mode safeguards for safer public demos.
- **Documentation Sync**: Updated project docs and update-tracking sections to match the current architecture and release flow.

---

## [v4.0.0] - 2026-03-01 13:13
**Author:** Antigravity + Claude Code
**Based on:** v3.0.0

### Evolution: Duty Management Refinements
- **Direct Calendar Highlights**: Clicking on a person's name directly highlights their shifts within the main calendar view.
- **Per-Month Personnel Lists**: Create distinct personnel lists for each month with an option to preserve previous lists.
- **Performance Optimizations**: Optimized functions and analytics to run smoothly on the Firebase free plan.

---

## [v3.0.0] - 2026-03-01 03:30
**Author:** Antigravity + Claude Code
**Based on:** v2.2.0

### Evolution: Architecture Migration
- **Modular Component Redesign**: Split the 2,400+ line monolithic `App.tsx` into a maintainable, scalable modular architecture.
- **Zustand State Management**: Introduced a robust frontend state management layer (`useScheduleStore`, `useConfigStore`, `useUIStore`).
- **RESTful API Integration**: Shifted data persistence to a proper Express + SQLite backend.
- **Advanced 4-Phase Solver**: Integrated the hybrid Simulated Annealing + LNS solver engine for optimized shift planning.
- **Legacy Feature Index**: Added a comprehensive reference guide in `LEGACY/FEATURES.md` for ongoing feature porting.
- **GSAP Preservation**: Restored and modularized premium GSAP animations.

## [v2.2.0] - 2026-02-28 22:17 &nbsp; [Download ZIP](https://github.com/Oat9898/Wayne-management/archive/refs/tags/v2.2.0.zip)
**Author:** Oat9898
**Based on:** v2.1.0

### Added/Changed
- **Personnel Duty Highlight**: Click any person's name in the sidebar to highlight their duty days directly on the calendar.
- **Improved Changelog Experience**: Added downloadable ZIP links for each version in the Changelog modal.
- **Enhanced Sorting**: Entries are now sorted by creation timestamp (newest first).

---

## [v2.1.0] - 2026-02-28 21:55
### Added/Changed
- **GSAP Loading Animation**: A premium multi-block bouncing and flipping animation replacing the basic spinning calendar during automatic shift planning.
- **Advanced Auto-Solver Violation Alerts**: The solver now explicitly presents any mathematical constraints it broke (e.g. Day-to-Day consecutive violations) to the user and requires them to manually `Confirm` accepting the imperfect schedule, preventing unwanted auto-completions.
- **Multi-Tool Synergy Finalization**: Verified the exact compilation order in `main.tsx` guaranteeing Tailwind classes style the MUI components perfectly without regression.

---

## [v2.0.0] - 2026-02-28 21:00
**Author:** cancanboredom
**Based on:** Oat Version 21.12 + Local Features

### Merged Features
- **Firebase Realtime Database**: Integrated collaborative scheduling sync.
- **GSAP Motion framework**: Restored all premium animations and scroll effects.
- **Advanced Shiftplan Auto-Solver**: Re-integrated the Simulated Annealing solver engine.
- **AI Upgrade**: Updated Gemini Smart Import to use `gemini-3.1-flash-image-preview`.

---

## [Oat Version 21.12] - 2026-02-28 20:00
**Author:** Oat9898
**Based on:** de2f2d6

### Original Changes
- Complete rebuild  fresh upload replacing all previous GitHub history.
- Integrated typography improvements (LINE Seed TH font-smoothing, letter-spacing, line-height).
- Added Changelog button on landing page with version badge and modal.
- Per-month personnel management with copy from previous month.
- Calendar navigation with month/year picker.
- Guest mode restrictions and Editor password authentication.
- Subset management with dropdown selection.

---

## [de2f2d6](https://github.com/Oat9898/Wayne-management/commit/de2f2d6)  2026-02-28 &nbsp; [Download ZIP](https://github.com/Oat9898/Wayne-management/archive/de2f2d6.zip)
**Author:** cancanboredom  
**Based on:** [072a115](https://github.com/Oat9898/Wayne-management/tree/072a115)  

### Changes
- Switched repository ownership to `Oat9898/Wayne-management`
- Updated all hardcoded documentation links
- Resolved merge conflicts with the new origin branch

---

## [072a115](https://github.com/Oat9898/Wayne-management/tree/072a115)  2026-02-28 &nbsp; [Download ZIP](https://github.com/Oat9898/Wayne-management/archive/072a115.zip)
**Author:** cancanboredom  
**Based on:** [Oat v18.33](./Oat%20version%2018.33/)  

### Changes
- Integrated core logic and components from Oat version 18.33
- Improved LINE Seed TH font typography: added letter-spacing, line-height, word-spacing, and font smoothing
- Tuned heading and small-text spacing separately

---

## [Oat v18.33](./Oat%20version%2018.33/)  2026-02-28 &nbsp; [Download ZIP](./Oat%20version%2018.33.zip)
**Author:** Oat9898  
**Based on:** [Logic Claude](./logic%20from%20claude/)  

### Changes
- Integrated Landing Page and Access Control from Oat's original version
- Preserved existing backend functionality and styling
- Optimized animation library usage

---

## [Logic Claude](./logic%20from%20claude/)  2026-02-28 &nbsp; [Download ZIP](./logic%20from%20claude.zip)
**Author:** cancanboredom  
**Based on:** [d35793d](https://github.com/Oat9898/Wayne-management/tree/d35793d)  

### Changes
- Core shift management logic provided by Claude
- Date utilities and shift solver functions
- Firebase integration foundation

---

## [d35793d](https://github.com/Oat9898/Wayne-management/tree/d35793d)  2026-02-28 &nbsp; [Download ZIP](https://github.com/Oat9898/Wayne-management/archive/d35793d.zip)
**Author:** cancanboredom  
**Based on:** [6b1542a](https://github.com/Oat9898/Wayne-management/tree/6b1542a)  

### Changes
- Added Interactive Change Review feature to `Upload to GitHub.bat` (review files one by one before uploading)

---

## [6b1542a](https://github.com/Oat9898/Wayne-management/tree/6b1542a)  2026-02-28 &nbsp; [Download ZIP](https://github.com/Oat9898/Wayne-management/archive/6b1542a.zip)
**Author:** cancanboredom  
**Based on:** [5fd003a](https://github.com/Oat9898/Wayne-management/tree/5fd003a)  

### Changes
- Added one-click collaborative setup (GitHub Codespaces and Gitpod badges)
- Updated README with quick-start instructions

---

## [5fd003a](https://github.com/Oat9898/Wayne-management/tree/5fd003a)  2026-02-28 &nbsp; [Download ZIP](https://github.com/Oat9898/Wayne-management/archive/5fd003a.zip)
**Author:** cancanboredom  
**Based on:** (Initial)

### Changes
- Initial commit: full Duty Management System with React + TypeScript + Express
- LINE Seed TH font integration with all weight variants
- Monthly shift calendar, personnel management, holiday support
- Preview App / Update / Upload batch scripts for Windows
- SQLite database for persistent storage
