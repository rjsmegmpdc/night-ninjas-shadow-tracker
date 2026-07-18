# PHASES.md — VELOCITY Development Roadmap

## Current state

**Version**: 0.2.0  
**Branch**: feat/cloud (active build; stacked daily-loop → ui-redesign → cloud)  
**Status**: Cloud port shipped (Phase 12): dual-runtime app deployed to Cloudflare Workers via OpenNext at velocity.onlinemyassistant.workers.dev, behind a Cloudflare Access email allowlist. Local mode unchanged. Daily loop (Phases 9–11) and UI redesign both live in the deployed build. Patrol-only "Kiero" visual pass shipped on feat/ui-kiero: kiero-1 (ring-gauge trio, Kiero-mode verdict cards, status-pill session list, stat-tile colour dots, mobile bottom nav, additive `k-*` tokens) and kiero-2 (real shadcn/ui primitives — Button/Card/Badge/Separator — under components/shadcn/*, themed via additive `sh-*` tokens mapped to the Kiero palette; components.json added). Every other route is unchanged — `--nn-accent`, `components/ui/button.tsx`, and `components/ui/card.tsx` were not touched.

---

## App pages (13 routes)

The VELOCITY app comprises the following pages, organized by navigation bucket:

### Dashboard
- **/patrol** — Training load matrix, weekly compliance status, quick health check

### Training
- **/dojo** — Training plan management and selection
- **/calendar** — Week-by-week calendar view
- **/race** — Race planning, taper management, weather forecast, heat advisory
- **/coach-log** — Manual session logging and plan adjustments

### Analytics
- **/strike** — Fitness metrics: VO2max trends, biometric analysis, load distribution
- **/recon** — Deep analysis: weekly history, injury vulnerability, monotony detection, interruption patterns
- **/vo2max** — Dedicated VO2max tracking and insights

### Profile
- **/profile** — Athlete settings, strength preferences, wellness slider, injury ledger
- **/settings** — Strava setup, club share configuration, data export
- **/shoes** — Footwear tracking and mileage management
- **/journal** — Training notes and reflections
- **/help** — In-app user guide

---

## Phase ledger

### Phase 3b — State-aware monotony + interruption detection
**What**: Monotony and sickness/travel trigger detection; multi-week compliance matrix; coach log for manual adjustments.

**Key files**: 
- `lib/plans/state-awareness.ts` — State-aware week calculation
- `lib/plans/state-aware-week.ts` — Week template with state flags
- `lib/analysis/monotony-pure.ts` — Monotony calculation
- `lib/analysis/interruptions-pure.ts` — Sickness/travel detection
- `app/(app)/coach-log/page.tsx` — Manual session logging

**Features**:
- Norwegian Singles dojo (NS-1) — baseline training methodology
- NS personal HR calibration as editable defaults
- Absolute-cap guardrails on adjusted sessions

**Status**: Complete. Core foundation for training analysis.

---

### Phase 4–6 — Time handling, race planning, UI refinement
**What**: Timezone fixes and type cleanup; race-day weather forecast + heat advisory; taper view and post-race protocol; multi-block awareness in plans.

**Key files**:
- `lib/race/taper-pure.ts` — Taper week calculation
- `lib/race/post-race-pure.ts` — Post-race recovery protocol
- `lib/weather/forecast.ts` — Race-day weather forecast
- `lib/weather/heat-adjust-pure.ts` — Heat advisory calculation
- `app/(app)/race/page.tsx` — Race planning UI
- `lib/plans/calendar-blocks.ts` — Multi-block plan support

**Features**:
- Taper countdown and readiness checks
- Weather forecast for goal race date
- Heat advisory for hot conditions
- Post-race recovery guidance (R1–R4 phases)

**Status**: Complete.

---

### Phase 5 — Athlete profile
**What**: `/profile` route with editable athlete preferences and wellness tracking.

**Key files**:
- `app/(app)/profile/page.tsx` — Profile page
- `components/profile/strength-prefs-form.tsx` — Strength preferences editor
- `components/profile/wellness-slider-form.tsx` — Wellness tracking slider
- `components/profile/injury-ledger.tsx` — Injury history ledger
- `lib/actions/profile.ts` — Profile server actions
- `lib/actions/wellness.ts` — Wellness updates

**Features**:
- Strength preferences (speed, endurance, power)
- Wellness slider (subjective daily wellness 1–10)
- Injury ledger with date and notes
- HR calibration settings editable from profile

**Status**: Complete.

---

### Phase 6b — Navigation polish and streak tracking
**What**: Top navigation redesign; streak indicator in nav; avatar dropdown; bounded mobile responsiveness.

**Key files**:
- `components/nav/topnav.tsx` — Horizontal top navigation (4 buckets: Dashboard, Training, Analytics, Profile)
- `components/nav/avatar-menu.tsx` — Avatar dropdown menu
- `lib/analysis/streak.ts` — Streak calculation
- `app/(app)/layout.tsx` — App layout with streak integration

**Features**:
- Sticky top nav with 4-bucket layout (replaces old 9-item sidebar)
- Flame icon + streak count in top-right nav
- Avatar menu for quick access to profile/settings
- Mobile-optimized navigation

**Status**: Complete.

---

### Phase 7 — Race weather integration
**What**: Full race-day weather forecast and heat advisory system.

**Key files**:
- `lib/weather/forecast.ts` — Strava weather API integration
- `lib/weather/heat-adjust-pure.ts` — Heat-based session adjustment
- `lib/race/execution.ts` — Race execution with weather context
- `app/(app)/race/page.tsx` — Race page with forecast display

**Features**:
- 7-day forecast for goal race location
- Heat advisory (red flag if feels-like temp > 28°C)
- Humidity and wind integration
- Session pacing suggestions based on conditions

**Status**: Complete.

---

### Phase 8 — Rest-day recovery prescription
**What**: Additive session matching and recovery prescription engine for rest days.

**Key files**:
- `lib/plans/recovery-prescription-pure.ts` — Recovery session logic
- `lib/plans/recovery-prescription-pure.test.ts` — Recovery tests
- `lib/analysis/session-match-pure.ts` — Session matching to plan slots
- `lib/analysis/session-match-pure.test.ts` — Session matching tests

**Features**:
- Automatic recovery session suggestions for rest days
- Activity classification (run, cross-training, mobility)
- Compliance flagging for optional sessions
- Multi-block recovery planning

**Status**: Complete.

---

### Phase 9 — Daily-loop foundations
**What**: Ambient sync on Patrol open; manual results fallback (P0-7): action, detection, dedup guard, form.

**Key files**: 
- `lib/sync/staleness-pure.ts` — Staleness detection (data freshness logic)
- `lib/actions/manual-activity.ts` — Manual activity creation and validation
- `lib/analysis/unlogged-sessions-pure.ts` — Detection of unlogged prescribed sessions
- `lib/analysis/activity-dedup-pure.ts` — Sync dedup guard + overlap detection
- `components/patrol/ambient-sync.tsx` — Auto-sync banner on Patrol open

**Features**:
- Incremental sync fires auto on Patrol open when data is stale
- Unlogged session detection prompts athlete to log result
- Manual result form (distance, duration, avg HR optional, RPE, notes)
- Dedup guard prevents double-counting if device sync arrives later
- Manual activities flow through identical engine path (compliance, load, assessment)

**Status**: Complete.

---

### Phase 10 — Prompt queue + Journal consolidation
**What**: Context-completeness reader; skippable prompt stack with defaults; wellness sliders write to journal table; interruption log + wellness merged into one surface.

**Key files**: 
- `lib/analysis/prompt-context-pure.ts` — Context-completeness detection
- `components/patrol/prompt-queue.tsx` — Skippable prompt stack with defaults UI
- `lib/actions/journal.ts` — Journal table writer (wellness, interruptions, reflection)
- `components/journal/unified-wellness-form.tsx` — Merged wellness + interruption surface

**Features**:
- Prompt queue assembles missing context (wellness check-in, unlogged session, integration errors)
- Each prompt skippable; skipping applies athlete's configured default
- Wellness slider writes directly to journal table
- Interruption log and wellness tracking in one surface
- System asks once or uses default — never a dead-end empty page mid-flow

**Status**: Complete.

---

### Phase 11 — Daily brief + Connections
**What**: Patrol reordered prompts→coach read→next session→goal line; Connections panel under Profile: Strava live, Garmin wired, COROS/Polar placeholders, no nutrition card.

**Key files**: 
- `components/patrol/patrol-reorder.tsx` — Reordered brief layout (prompts→coach read→next session→goal line)
- `components/profile/connections-panel.tsx` — Adapter connection status and sync history
- `lib/actions/adapter-status.ts` — Read layer for adapter health + last-sync

**Features**:
- Patrol brief reordered by priority: ambient sync banner → prompt queue → coach read → next-session card → goal line
- Connections panel on Profile lists every adapter (Strava, Garmin, COROS, Polar) with status/last-sync
- Defaults for absent sources configured in Connections
- No nutrition card (research parked at P2)
- UI twin of §5's adapter layer in PRD

**Status**: Complete.

---

### Phase 12 — Cloudflare cloud port (dual-runtime)
**What**: Full port to Cloudflare Workers (OpenNext) while keeping local dev byte-identical: SQLite→D1 dual-driver, keytar→encrypted D1 secrets, disk→R2/download-response storage, fire-and-forget sync→durable Cloudflare Workflow, deploy behind Cloudflare Access.

**Key files**:
- `lib/db/index.ts` — runtime-selected getDb(): better-sqlite3 (node) / drizzle-orm/d1 (workerd)
- `lib/store/secrets.ts` + `lib/store/crypto.ts` — dual-runtime secrets: OS keychain (node) / AES-GCM in D1, key from `SECRETS_ENC_KEY` Worker secret (workerd)
- `lib/storage/shoe-photos.ts` — photo storage adapter: disk (node) / R2 `PHOTOS` (workerd)
- `workers/sync-workflow.ts` + `worker-entry.ts` — Strava sync as a Cloudflare Workflow (step per page, durable retries); custom worker entry exporting the OpenNext handler + workflow class
- `lib/db/migrations/0011_athletes.sql`, `0012_secrets.sql` — athletes table + athleteId scoping (multi-user groundwork, single default athlete), encrypted-secrets table
- `wrangler.jsonc`, `open-next.config.ts`, `.github/workflows/deploy.yml` — deploy config (keep `preview_urls: false`; CI gated behind `CLOUDFLARE_DEPLOY_ENABLED`)
- `scripts/d1-export.mjs`, `scripts/d1-import.ps1` — one-time local→D1 data migration

**Features**:
- Same codebase, automatic runtime selection — local dev needs no Cloudflare anything
- ~129 call sites converted to async db access; 437-test suite unchanged and green
- Access gate created before first deploy; unauthenticated requests never reach app code
- Multi-user groundwork: athleteId columns + Access-email→athlete mapping (PRD P0-1)

**Status**: Deployed (behind Access, data imported). Open: CI arming (needs Cloudflare API token in GitHub secrets).

---

## Supported training methodologies

The **Dojo** page supports 13 different training plan methodologies:

1. **Daniels** — Jack Daniels running formula (pace zones)
2. **Pfitzinger** — Pete Pfitzinger marathon plans
3. **Hansons** — Hansons marathon method
4. **Lydiard** — Arthur Lydiard periodization
5. **Higdon** — Hal Higdon base-building plans
6. **Polarised** — Polarised training (80/20 intensity distribution)
7. **Ultra** — Ultramarathon-specific plans
8. **Norwegian Singles** — Norwegian endurance training (NS-1 calibrated)
9. **Custom** — User-defined plans
10. **Base Maintenance** — Fallback when no plan active
11. **Multi-block** — Plans spanning multiple training blocks
12. **Ramp** — Progressive ramp-up templates
13. **Week Context** — Contextual adjustments per weekending

---

## Data sources

- **Strava** — Fully supported. Synced activities power all analysis.
- **Garmin** — Under development. Connection framework in place; sync engine not yet complete.
- **Manual entry** — Coach log allows manual session logging for non-Strava activities.

---

## Key analysis engines

- **Compliance** — Compares actual activities vs. planned sessions (hit/partial/miss)
- **Load** — Weekly training load (CTL, ATL, TSB) calculations
- **Biometrics** — VO2max trending via Daniels-formula estimates
- **Interruptions** — Detects sickness/travel breaks in training
- **Monotony** — Calculates training variety and flagging overuse patterns
- **Injury Vulnerability** — Predicts injury risk based on load/fatigue
- **Intensity Distribution** — Analyzes % easy vs. hard vs. threshold
- **Streak** — Consecutive days with logged activity

---

## Database schema (10 tables)

| Table | Purpose |
|---|---|
| `activities` | Synced Strava activities (primary data source) |
| `planPeriods` | Active training plan + history |
| `journal` | Daily wellness tracking entries |
| `settings` | App key/value configuration |
| `syncLog` | Legacy sync audit trail |
| `syncJobs` | Stateful, resumable Strava sync jobs |
| `races` | Goal races and tune-up events |
| `recurringEvents` | Weekly group runs |
| `calendarEvents` | Holidays, trips, sickness blocks |
| `nzHolidays` | Cached NZ public holidays |

---

## Next phase planning

**Garmin integration** (in planning):
- OAuth setup for Garmin Connect
- Activity sync engine (similar to Strava runner)
- Power meter data ingestion
- Training effect compatibility

**Shoes refinement** (post v0.2):
- Photo import and rotation view
- Mileage alerts (retire at 500–800 km threshold)
- Performance correlation (shoe type vs. injury)

**Export enhancements**:
- PDF training summary
- CSV bulk export
- iCal calendar integration for race dates

---

## Versioning

- **v0.1.0–0.1.x** — Pre-rebrand (Night Ninjas Shadow Tracker)
- **v0.2.0+** — VELOCITY rebrand (current)
- Each point release signals a completed phase

---

## Files to read for deep dives

- **Training analysis**: `lib/analysis/` (load, compliance, trends, VO2max)
- **Plan engines**: `lib/plans/` (all 13+ methodologies)
- **Strava sync**: `lib/sources/strava-sync.ts` (stateful job runner)
- **Race logic**: `lib/race/` (taper, weather, execution)
- **UI components**: `components/` (brand, nav, ui primitives)
- **Page routes**: `app/(app)/`, `app/setup/` (all 13 main pages + setup wizard)
