# Auto-fill Active Container Details

- [x] Refactor Container Schema (Add unloadDate to Items) <!-- id: 23 -->
- [x] **Debug: Audit Logs** <!-- id: 5 -->
    - [x] Verify `logAction` triggers explicitly (`console.log`) <!-- id: 6 -->
    - [x] Verify persistence with `/api/logs/test` <!-- id: 8 -->
    - [x] Fix Staff Management Logging (`staffRoutes.js`) <!-- id: 9 -->
    - [x] Fix Database Schema Mismatch (UUID vs Integer) <!-- id: 11 -->
- [x] Implement Two-Mode UI (New vs Existing) <!-- id: 28 -->
- [x] Fix System Audit Log Display <!-- id: 29 -->
- [x] Optimize Performance (Limit Containers) <!-- id: 30 -->
- [x] Fix Dashboard 500 Error (SQLite Compat) <!-- id: 31 -->
- [x] Deploy / Push to Git <!-- id: 32 -->

# Debugging & Stability (Live/Local)
- [x] Fix Local Login 401 Error (Environment/Token) <!-- id: 37 -->
- [x] Fix Container Entry 500 Error (Undefined Variables) <!-- id: 38 -->
- [x] Fix React Duplicate Key Warning <!-- id: 39 -->
- [x] Verify Client Data Entry Permissions <!-- id: 40 -->
- [x] Verify Local Run (Frontend/Backend) <!-- id: 41 -->
- [x] Fix Container Summary Data Loss (Merge Logic) <!-- id: 42 -->
- [x] Optimize Container Summary Performance (memoization) <!-- id: 43 -->
- [x] **Fix Item Summary Calculation** (Server-side Aggregation + Date Logic) <!-- id: 55 -->
    - [x] Filter by **Container Date** (User Request)
    - [x] **Dialect Compatibility** (Fixed: SQL Columns Quoted for Postgres v1.5.7) <!-- id: 56 -->

# UI Refinements
- [x] Rename "Start Date" to "Unload Date" in ContainerEntry
- [x] formatting: "Unload Date" should show only date (no time)
