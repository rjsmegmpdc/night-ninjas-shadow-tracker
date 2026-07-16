## Daily loop — Stages 0–5 ✅ SHIPPED (2026-07-16, feat/daily-loop stages 0–6)

The next build restructures VELOCITY around "the daily loop" — three UI layers organized by cadence (DAILY: Patrol, WEEKLY: Recon, RARE: Profile) with three consecutive phases landing the full flow.

- **Phase 9 (Foundations)** — Ambient sync on Patrol open; manual results fallback when device outage occurs (P0-7: form, detection, dedup guard). Activity flows through identical engine path.
- **Phase 10 (Prompts + Journal)** — Context-completeness reader assembles missing data; skippable prompt queue uses configured defaults; wellness slider writes to journal; one unified surface for wellness + interruptions.
- **Phase 11 (Brief + Connections)** — Patrol brief reordered by priority (sync→prompts→coach read→next session→goal line); Connections panel on Profile lists adapter status/last-sync for Strava, Garmin, COROS, Polar.

---

## NS personal HR calibration ✅ SHIPPED

Matt's worked-out NS calibration is now seeded as EDITABLE defaults the
first time Norwegian Singles is active (idempotent, never clobbers edits):
max HR 166 (was defaulting to 220-age = 175, which the NS analysis showed
put ~47% of an easy run in Z3), easy HR cap 128, sub-threshold HR cap 141
(~0.85 x 166). Confidence starts 'estimated' so the UI keeps prompting for
a hill-sprint max re-test; flips to 'measured' when the athlete confirms.

The guardrails now honour ABSOLUTE HR caps when set (avgHr vs the 128/141
cap) in preference to the generic reserve fractions - a hand-calibrated
cap is more faithful than back-computing from a max-HR percentage; they
fall back to reserve math when a run lacks avg HR. New editable NS HR-caps
card on the VO2 Max page (alongside the athlete profile). 6 new tests for
the absolute-cap path (22 in the NS guard suite).

## NS HR-readiness callout ✅ SHIPPED

Surfaced at dojo-selection time (both the setup wizard and the Methodology
page), shown only when Norwegian Singles is chosen. Because NS depends on
accurate HR zoning more than any other method, the callout:
- states the dependency up front (measured max HR, not 220-age);
- shows the athlete's LIVE HR-data status from Strava - coverage across
  recent runs + whether a measured max is set + their highest observed
  HR as a starting figure - via a new hr-availability reader;
- calls out missing HR data (no monitor) or a missing measured max,
  with severity tone;
- describes the two known max-HR test protocols (hill reps; flat
  max-effort) as athlete-driven steps, pointing to the VO2 Max profile to
  record the result.
All user-driven - the app highlights what to do and why; the athlete does
the testing. Reinforces the runtime NS-2/NS-3 guardrails with up-front
guidance.

## NS-2 / NS-3 - Norwegian Singles guardrails ✅ SHIPPED

Four discipline guards on the dashboard (shown only when NS is the active
method), pure engine with 16 tests:
- EASY-DAY DISCIPLINE: flags easy/long/recovery runs above the easy HR
  ceiling (Karvonen reserve >= 0.70) - the slow leak that erodes NS.
- REP-TOO-HOT: flags sub-threshold sessions reaching threshold/VO2 effort
  (reserve >= 0.88) - the defining NS mistake.
- QUALITY-CAP METER: accumulated quality time vs the 20-25% band (engine
  pins 22%), drawn as a meter with the target zone marked.
- MAX-HR VALIDITY GUARD: flags zones built on the 220-age estimate rather
  than a measured max (the unreliable-220-age issue), AND flags when an
  observed activity max HR exceeds the configured max (proving config too
  low). Unblocked by the R2.5 athlete-profile work.
Intent is inferred by matching each run to its plan-template day; HR
reserve reuses the load engine's Karvonen basis. Server read layer
assembles samples; analysis stays pure.

## Phase R2.6 - VO2 max insights ✅ SHIPPED

Three-tier insights engine on the /vo2max page (pure, 11 tests):
Tier 1 TREND (factual direction + recent micro-trend), Tier 2 CONTEXT
(hedged "possible factor" heuristics correlating VO2 movement with
training volume, sleep, and resting HR - never causal language; the
sleep/HRV correlation is unblocked by Phase 12 biometrics), Tier 3
OUTLIER (flags readings >2.5 robust-sigma from the median - uses
median+MAD not mean+stdev to avoid the masking problem where a lone wild
reading inflates the stdev and hides itself). Insights card groups by
tier with tone-coded styling. Context assembled server-side from monthly
volume + biometric summary; analysis stays pure.

## Phase R2.5 - VO2 max page ✅ SHIPPED

Dedicated /vo2max page (Analytics nav bucket; linked from Athlete State).
Four observation sources resolved by priority lab > Cooper > Rockport >
device: Cooper 12-min ((d-504.9)/44.73), Rockport 1-mile walk regression,
manual lab entry, and Garmin device estimates (read from
daily_health_metrics). Stored in new vo2max_observations table
(migration 0008), full history kept. Capture UI (tabbed Cooper / Rockport
/ lab forms, profile prefill), cross-source trend chart, fitness band
label. New athlete profile in settings (age/weight/sex/maxHr/restingHr) -
also the calibration source that turns estimated HR zones into calibrated
ones. OBSERVED-ONLY: VO2 does not change paces in v1. 11 pure formula
tests. Source priority verified (lab outranks a newer Cooper).

# Roadmap

> Persistent record of what this product becomes at maturity, and the order
> we build toward it. Supersedes any "agreed but not built" lists in
> session transcripts. When we land work, we tick it here and update the
> "current focus" line so it's obvious where we are.

---

## Product vision

VELOCITY is an intelligent marathon training console for serious distance
runners. Local-first. Owns its data. Built around a real coach's mental
model - not a logging tool, not a social feed, not a one-shot plan
generator.

> **Rebrand note:** the product was originally *Night Ninjas Shadow
> Tracker*. As of bundle 8074e01+, the user-facing brand is **VELOCITY**.
> The codebase folder, `package.json` name, GitHub repo, and `%APPDATA%`
> data path retain the original name. All UI surfaces show VELOCITY.
> See `BRAND.md` and `DESIGN.md` for the new specs.

The product answers, every day, four questions:

1. **What am I doing today, and why?** - plan + context
2. **How am I tracking against the plan?** - compliance + execution
3. **How is my body, and what's that mean for what I should do next?** - freshness + state
4. **What's coming, and how do I prepare for it?** - countdown + race-execution

Everything we build serves one of those four questions. If a feature
doesn't, it doesn't ship.

---

## Current focus

**Phase 5 (rest) + R1 polish + Phase 8 - SHIPPED.** `/profile` route (strength
prefs, daily wellness slider writing the journal table, injury & illness ledger
with per-area vulnerability); R1 polish (real streak count in the nav, avatar
dropdown + theme toggle, bounded mobile/responsive pass); Phase 8 (rest-day
recovery prescription tuned to prior-day load + additive session matching -
shifted-session + extras annotations layered over compliance). tsc clean (only
garmin-connect), 337 tests. With Phases 4-7 + 3b, the v1 plan/exec/state surface
is largely complete. **Next candidates:** Phase 9 (coach voice + Sunday journal
prompt + block-end debrief - the journal write layer now exists); Phase 11 (shoe-
for-session recommender); Phase 13 (race-fueling depth); Phase 10 (BYOK AI).
Deferred/blocked: Phase 6 course-profile + Phase 7 stored-weather (per-activity
data not fetched); first live Garmin sync (garmin-connect not installed - the
lone tsc error). Block context: the Hansons 18-week block starts ~28/06/2026
(sub-3:00 Auckland Marathon 01/11/2026).

**Recently shipped** (see the SHIPPED markers in this file): R1 visual
rebrand, R1.5 club export, R2 part 1 (Trends) + part 2 (adherence chip +
program-shape card), R2.5 VO2 max page, R2.6 VO2 insights, Phase 12
biometric surfacing, the Norwegian Singles dojo (NS-1) + NS-2/NS-3
guardrails + HR-readiness callout + personal HR calibration, Phase 3b core,
**Phase 4 (interruptions + injury risk), the Phase 5 editable start date,
Phase 6 v1 (race execution), and Phase 7 (weather forecast + heat
advisory)**, plus the timezone-hardening pass.

**Queued next:** the rest of Phase 5 (the `/profile` route - strength
preferences, injury ledger, wellness slider); R1 polish (active nav state,
streak->flame, avatar dropdown, mobile pass). Deferred/blocked: Phase 6
course-profile pacing (per-activity elevation) and Phase 7 past-activity
temp + compliance heat-adjust (stored per-activity weather). Post-v1 items
(Phases 8-10/13/14, Apple Health/Whoop/Coros adapters, first live Garmin
sync, club PR consumer) follow.

The deferred Category C work (AI Coach, etc.) remains on the v2 horizon,
not in scope for the marathon build.

---

## Done

These are landed. Listed here as ground-truth for what the product
already does, not as celebration.

- 9-dojo plan engine (Lydiard, Hansons, Norwegian Singles, Daniels,
  Pfitzinger, Higdon, Polarised, Ultra, Custom) with calendar-aware week
  rendering
- Goal race + tune-ups, on-demand editable, with target time validation
- Plan-period history (`plan_periods`): each row in the matrix uses the
  dojo and goal that were active at that time, not the currently selected one
- Patrol page hero matrix: 3-week strip (last/this/next) with lazy past
  and forward expansion (8 weeks per page)
- Per-day compliance signals (`hit` / `soft` / `miss` / `planned`) on
  past, current, and future weeks
- Per-week compliance chip with hover-card breakdown
- Streak counter (any-exercise default, run-only opt-in via Settings)
- Race countdown — single line, weeks-emphasis, proximity-aware
- Cross-period dojo-boundary marker on past expansion
- Sync button with auto-refresh on completion
- Activities pull from Strava (incremental + full history); cross-sport
  recognised; gear inventory mirrored
- Multi-activity per day rendering: AM+PM doubles and warmup/workout
  splits show as stacked pills in the cell
- Filter swatches as click-to-toggle filters with CSS-only dimming
- Shoes redesign: table layout, urgency sort, retire-only model
- Theme system (System / Light / Dark) with no-flash pre-hydration
- Calendar holidays (NZ public, personal-day add, individual hide)
- Build infrastructure: idempotent migration runner, comprehensive
  `check.ps1`, externalised JS scripts (no embedded JS in PowerShell)
- **Phase 1: Base-maintenance generator** — engine-agnostic
  `lib/plans/base-maintenance.ts`. Forward-expand populates beyond the
  active program window. Pre-program weeks ramp down from week-1 ×0.85;
  post-program weeks use 4-week chronic load. Floors at 25 km/wk,
  ceilings at chronic × 1.1. Synthesised weeks render with `—  (base)`
  in the W-number column so they're visibly distinct from coached weeks.

---

## Phase R1 - VELOCITY visual rebrand 🟢 SUBSTANTIALLY DONE

The visual rebrand has landed. The product is now VELOCITY in name, top-nav,
wordmark, card system, button system, and palette. Page H1 labels match
the new IA (Dashboard / Methodology / Athlete State / Schedule / Trends /
Equipment / Wellness / Settings / Reference).

**Landed in foundations bundle (73fa351):**
- `DESIGN.md` rewritten for VELOCITY visual system
- `BRAND.md` created with identity, voice, locale defaults
- `README.md` updated with rebrand callout
- `ROADMAP.md` (this file) updated
- Tailwind tokens extended (rounded-xl/lg/2xl, accent-glow, signal-ok teal,
  ink-line-bold, shadow-card variants)
- Top horizontal nav (`components/nav/topnav.tsx`) replaces left sidebar
- VELOCITY wordmark replaces Night Ninjas wordmark

**Landed in restyle bundle (next):**
- Card primitive supports active variant with accent border + inner glow
- `nn-card`/`nn-card-elevated`/`nn-card-active` utilities use rounded-xl + shadow-card
- Button primitive uses rounded-lg, refined variants (primary now accent-fill,
  critical now signal-miss-tinted, outline sits on ink-shadow)
- All page eyebrows updated to new IA labels
- All page H1 titles use new display labels per BRAND.md
- Sidebar component deleted (was unreferenced after layout switch)

**Plumbing landed for R1.5 + 3b:**
- Settings keys: `prefs.coachMode`, `club.parkrun_id`, `club.terms_accepted_at`,
  `club.window_default`, `club.last_share_generated_at`
- TypeScript helpers: `getCoachMode`/`setCoachMode`, club share getters/setters
- Schema: `plan_adjustments` table with `proposed_at`, `applied_at`,
  `dismissed_at`, `trigger`, `rationale`, before/after state, mode, week
- Migration 0006: `plan_adjustments` table created with proposed_at + trigger
  indices

**R1 polish ✅ SHIPPED:**
- Active-bucket underline on the top nav (was already in place)
- Streak chip on the top nav showing the REAL count - the layout fetches
  `getStreakState` (server) and passes it into the client `TopNav`; flame goes
  accent when a streak is live
- Avatar dropdown menu (`components/nav/avatar-menu.tsx`) - Profile / Settings /
  Help links + the reused `ThemeToggle`; closes on outside-click / Escape
- Bounded mobile pass: responsive page padding (`px-4 -> sm:px-8 -> lg:px-12`)
  across the app pages, responsive top-nav spacing, and the program matrix
  stacks its legend below the grid on narrow screens
- Deferred: exhaustive per-component card-padding audit; a deeper matrix
  mobile redesign (horizontal-scroll day grid).

---

## Phase R1.5 - Club schedule export ✅ DONE (VELOCITY side)

Athlete-mediated, manual-step export of upcoming training schedule for
club app consumption. Per athlete's choice (parkrun ID + terms acceptance
+ generate button), VELOCITY produces a JSON file the athlete uploads
manually to the club app. No live API, no webhooks, no scheduled push.

Settings keys + types are already plumbed in. R1.5 builds:
- `lib/club-share/generator.ts` pure function
- `lib/club-share/generator.test.ts` vitest coverage
- `lib/actions/generate-club-share.ts` server action
- `components/club-share/terms-modal.tsx` privacy disclosure
- `components/club-share/generate-button.tsx` action UI
- `app/(app)/settings/club-share-section.tsx` Settings card

Default window: this week + next week (2 weeks). Stripped: completed
sessions (compliance hit or partial), pace targets, HR zones. Window
override at generate-time: 1w / 2w / 4w / next-race / program-end.
Stale warning when last-generated >5 days ago, OR window >50% elapsed,
OR substantive schedule change since last publish.

---

## Phase R2 - Surface existing data 🟢 PARTS 1 + 2 SHIPPED

**Shipped (Trends page):** monthly volume bars with month-over-month delta
(6 months); 5-zone HR intensity distribution over 28 days (E/M/T/I/R
stacked bar + legend, reusing computeActivityLoad so zone logic is
single-sourced, with honest confidence labelling when max HR isn't
calibrated); load-vs-recovery chart (CTL/ATL/TSB over 8 weeks via the
same EWMA the athlete-state card uses). Pure aggregation in trends-pure
(9 tests). Cards render from raw activity data, so they appear even
before the 4-week compliance-trend gate.

**R2 part 2 ✅ SHIPPED:** 7-bar weekly adherence chip on Patrol
(`components/patrol/week-adherence-chip.tsx`) + program-shape card on the
dojo surface (`components/dojo/program-shape-card.tsx`) covering the
macro/micro program shape.

## Phase R2 (original scope) — superseded

> Superseded by **Phase R2 — Surface existing data** above. Shipped in part
> 1: HR-zone distribution, load-vs-recovery, monthly volume + delta. Tracked
> as deferred part 2: macrocycle phase bar, microcycle preview, 7-bar
> adherence chip. Original Category-B brief in git history.

---

## Phase R3+ - Resume original roadmap

After R1 (rebrand) and R2 (surface existing data), resume the originally
planned phases starting from Phase 3b (engine state-awareness clamping).
The original numbering below stays the same; R-phases sit above them.

---

## Phase 1 — Forward-week workouts ✅ DONE

**Why this matters now:** the matrix expands forward to race day but goes
empty past the active program window. A 26-week-out goal race with an
18-week program leaves 8 weeks blank. Athletes need to see *something*
for those weeks — and once we have a base-maintenance generator, it's
the foundation for freshness clamping in phase 2.

**Build:**

- `lib/plans/base-maintenance.ts` — engine-agnostic week generator producing
  a sensible default (Mon/Wed/Fri easy, Sun long, Tue/Thu rest with optional
  strength) using current chronic-load floor or a defensible default
- Matrix's row builder uses base-maintenance whenever no period-week applies
- Visual distinction: base-maintenance weeks render with a subtle marker
  ("base") so the runner knows this isn't a coached prescription
- Forward-expand "to race day" populates correctly across the full window

**Deferred from this phase:** none. Crisp scope.

---

## Phase 2 — Athlete state model + intensity diagnostics

**Session A (data layer) ✅ DONE:**

- ✅ Load model — `lib/analysis/load.ts`. Duration × sport baseline ×
  intensity factor → Daniels points. Two-tier resolution: calibrated
  (HR + measured max, OR pace + threshold pace), estimated
  (age-predicted max, or default-easy fallback). Confidence reported
  per activity (`'calibrated' | 'pace-only' | 'estimated'`).
- ✅ Sport-type classifier — `lib/analysis/sport-classifier.ts`.
  Distinguishes Pilates (recognised from activity name when sport_type
  is generic), Yoga, Strength variants, Crossfit, MTB, Trail running.
- ✅ Athlete state model — `lib/analysis/athlete-state.ts`.
  Banister PMC math (CTL τ=42, ATL τ=7, 8-week input window) on the
  load point-stream. Form classification (fresh/on-form/maintained/
  loaded/overreached) using standard PMC TSB thresholds.
- ✅ Intensity distribution — `lib/analysis/intensity-distribution.ts`.
  Seiler 80/20 polarised check, running-only.
- ✅ Mileage progression flags — `lib/analysis/progression.ts`.
  Week-over-week + 4-week mean checks; severity: ok/caution/risk.
- ✅ Long-run proportion flags — same file. % of weekly total + growth
  rate checks.
- ✅ Vitest infra + 33 unit tests covering load math, EWMA convergence,
  form classification, confidence rollup.

**Session B (surfaces) — current focus:**
  - Patrol header: small freshness chip (`fresh` / `on form` / `loaded` /
    `overreached`) next to streak + compliance
  - Patrol body: intensity distribution sparkline below stats row
  - Strike page rebuild: full CTL/ATL/TSB chart, intensity distribution
    history, progression flags, long-run trajectory

**Coach review additions integrated:** intensity distribution (#1),
mileage progression (#2), long-run proportion (#11)

---

## Norwegian Singles dojo ✅ SHIPPED (NS-1 engine; NS-3 guardrails pending)

Ninth engine, per the locked spec: three sub-threshold (LT1) sessions
weekly mapped to the tempo slot, quality pinned at 22% of volume,
strict-easy remainder, modest easy long run, 3-week session rotation
(10x3min / 6x5min / 3x10min), race-specific touches in the final three
weeks, taper via calendar layer. Sub-T pace bands derived off MP
(short reps ~MP-14s, long reps ~MP-8s/km - lands 4:02-4:08/km for a
sub-3:00 marathoner, matching the spec's worked example). State profile:
fatigue-averse floors, sub-T sessions protected, easy volume is the
buffer. Listed as a PRIMARY dojo in the picker. Status: scaffold until
dogfooded.

**NS-2/NS-3 still pending (needs HR-stream analysis):** easy-day HR flag,
rep-too-hot flag, quality-cap meter, max-HR validity guard (the 220-age
detection), field-test module (Cooper/Rockport/VDOT-from-race resolver).
Note: rename the existing "Rockford" test to Rockport and confirm the
formula when that module commences.

## Phase 3b - Engine state-awareness ✅ SHIPPED (core + part 2)

**Shipped:** philosophy-as-data profiles on all 8 engines (tsbFloor per
phase band, protected session types, intensity-vs-volume preference);
pure interpretState/applyAdjustment with ACWR hard rail (>= 1.5, cuts
protected sessions too, re-raises after dismissal until ratio drops) and
caution band (>= 1.3); distance-based ACWR loader; mode-aware pipeline
writing every proposal to plan_adjustments; Patrol coach card with
Apply/Dismiss (rail dismissal needs explicit confirmation); Coach Mode
section in Settings; adjusted template feeds Patrol compliance + volume
cells when applied/automatic.

**Part 2 ✅ SHIPPED:** matrix multi-week integration (hybrid overlay -
`lib/plans/matrix-adjustments.ts`); proposal-history view at `/coach-log`
(`lib/plans/adjustment-history.ts` + `components/patrol/proposal-history.tsx`);
the **monotony** trigger (Foster mean/SD of daily load, `lib/analysis/monotony-pure.ts`);
and **sickness/travel-window** triggers (`windowsOverlapping` over Phase 4
interruptions). New triggers gated by `evaluateNowState` so future weeks only
reflect week-anchored windows; life-context proposals never auto-apply.

## Phase 3b (original scope) — superseded

> Superseded by **Phase 3b — Engine state-awareness** above (core shipped;
> part 2 pending). The full original spec — three coach modes, the two
> safety rails (ACWR >1.5 hard cut; athlete-logged injuries never
> auto-adjust), and per-dojo interpretState/applyAdjustment — is
> implemented; original brief in git history.
> **Still v2:** override-frequency personalisation (read `plan_adjustments`
> to loosen thresholds for an athlete who repeatedly dismisses cuts without
> injury).
> **Caveat:** the "injuries never auto-adjust" rail is design intent but is
> NOT yet enforced — the `hasActiveInjuryOrIllness` gate is Phase 4
> remaining work (see Current focus).
> **Pre-work note:** the engine-snapshot net actually pins all 9 engines
> (incl. custom) × 3 levels = 45 tests, not the 8×3=24/40 the original entry
> stated.

---

## Phase 3 — Engine consumes athlete state (LEGACY ENTRY) — superseded

> Original pre-3b entry, fully superseded by **Phase 3b** above (which added
> the three-mode coach architecture). Pointer only; original bullets in git
> history.

---

## Phase 4 — Interruption tracking + injury risk ✅ SHIPPED

**Shipped:** migration 0009 + `interruptions` table; pure
`interruptions-pure.ts` (status/duration, graded 3-phase return-to-training,
ACWR + history injury-risk read, `hasActiveInjuryOrIllness` gate) with tests;
server read layer + log/resolve/delete actions (`lib/actions/interruptions.ts`);
the 3b automatic-mode injury-suppression gate; Journal/Wellness UI
(interruption log form + active-interruption banner); and the Patrol
active-interruption indicator. Injury-risk-chip inputs scale as later phases
add data sources.

**Why this matters:** training plans break against life. Right now
calendar holds work/family commitments but nothing else. Injuries are
invisible to the engine.

**Build:**

- New event types in `calendar_events`: `injury` / `illness` / `travel`
  (extends existing `commitment` model)
- Quick-add modal on Patrol matrix (Session B work from prior plan):
  - Single-day click → mark current/upcoming day with type
  - Date range form → multi-day interruption (taper-killing flu, etc.)
- Engine respects: interruption days don't count toward compliance
  failure; freshness calc treats them as zero load
- Matrix visual: interruption days render with a distinct cell pattern
  (diagonal hatching or muted-with-icon) so they're spatially obvious
- **Injury risk chip on Patrol** — composite signal from:
  - ACWR > 1.5 (acute spiking)
  - Cadence drop trend (fatigue indicator already in Strava data)
  - Compliance pattern (athletes often skip Tuesday tempos before
    admitting injury)
  - HRV trend (when phase 6 lands)
  - Self-reported wellness slider (when phase 5 lands)

**Coach review additions integrated:** injury risk modelling (#10), with
the input signals scaling as later phases add data sources

---

## Phase 5 — Athlete profile (calibration + preferences + injury ledger) ✅ SHIPPED

**Shipped:** the editable program start date (`lib/actions/plan-start-date.ts`);
body & calibration (R2.5 athlete profile + NS HR caps); and now a dedicated
**`/profile`** route (Profile nav bucket) aggregating those plus three new
pieces: **strength-modality preferences** (`getStrengthPreferences`/`setStrengthPreferences`
in settings, `lib/actions/profile.ts`, `StrengthPrefsForm`); a daily **wellness
slider** writing the journal table (`lib/actions/wellness.ts` - the first
app-side writer of `journal`, no-clobber upsert by date; `WellnessSliderForm`);
and an **injury & illness ledger** with a per-body-area vulnerability score
(`lib/analysis/injury-vulnerability-pure.ts` + tests, a pure read over the
Phase 4 interruptions; `InjuryLedger`). The `/profile` page uses responsive
padding (first of the R1 mobile pass). **Deferred:** running-economy proxy
(cadence/stride) calibration sharpening.

**Why this matters:** the engine and freshness model are running on
generic assumptions. The profile is where the athlete tells the system
*who they actually are* — so generic gives way to personal.

**Build:**

- `/profile` route with three subsections:
  - **Body & calibration**
    - Age, weight, height
    - Max HR (measured if known, age-predicted otherwise — clearly labelled)
    - Threshold pace (manual entry or "let me run a 30-min test" CTA)
    - VDOT (computed from race times, displayed as derived)
    - HR zones (auto-derived from max HR, manually overridable)
    - Pace zones (auto-derived from threshold, manually overridable)
  - **Auxiliary work preferences**
    - Strength modality preference: Traditional weights / Pilates / Yoga /
      Mixed / None
    - Per-modality target frequency (1-3 sessions/week)
    - Plan respects: when prescribing a Strength day, label and
      structure it according to preference
    - Distinguish auxiliary types in prescription content:
      "Strength: posterior chain", "Mobility: 20min flow",
      "Plyo: short box jumps + bounding"
  - **Injury & illness history**
    - Ledger: date, type (running-related vs general), description,
      status (resolved / managed / acute), affected area
    - Active issues bias the engine toward conservative prescription
    - Past issues feed a vulnerability score per area (calf, knee, achilles,
      hip, lower back, foot) used by phase 4's risk chip
  - **Daily wellness slider** (optional, lightweight)
    - One-tap morning RPE / sleep quality / energy
    - Surfaces in Strike as recovery proxy
    - Most predictive single metric a runner can self-report

**Coach review additions integrated:**
- Strength modality split (#9) — first-class in this profile
- Running-specific calibration sharpening (#4) — cadence baseline,
  stride-length proxy = `speed / cadence`, running-economy proxy
  (HR at marathon pace)

---

## Phase 6 — Race execution 🟢 SHIPPED (v1 + part 2; course-profile deferred)

**v1 shipped:** pacing-strategy generator (even/negative/progressive,
per-5km targets), fueling protocol, and pre-race carb-loading protocol -
`lib/race/execution.ts` (+ pure engine & tests) rendered on the `/race`
page (pace-plan / fueling / carb-load cards). Heat/humidity overlay added by
Phase 7.

**Part 2 ✅ SHIPPED:** taper view + arrive-fresh checklist + honest confidence
cues (`lib/race/taper-pure.ts`, `TaperCard`, auto-surfaces in taper/race week);
post-race recovery protocol + debrief form writing to a new `race_results`
table (migration 0010; `lib/race/post-race-pure.ts`, `PostRaceCard` +
`race-debrief-form`); multi-block macrocycle awareness + year-over-year
self-comparison (`lib/race/macrocycle*.ts`, `MacrocycleCard`). All on `/race`,
conditional on program phase.
**Deferred:** course-profile (elevation-aware) pacing - BLOCKED on per-activity
elevation (Strava elevation streams not fetched). Revisit when that data lands;
nothing else depends on it.

**Why this matters:** the race is the entire point. The current product
helps you train *for* it then goes silent on race day and after. As a
coach this is the single biggest gap — the product undersells what it's
already done by abandoning the athlete at the moment of truth.

**Build:**

- **Pacing strategy generator** from goal time + course profile
  (course profile: optional manual elevation entry, or pull from Strava
  course/segment data when available)
  - Even / negative / progressive split options
  - Per-5km targets with tolerances
  - Heat / humidity adjustment overlaid (when phase 7 weather is in)
- **Fueling protocol** — calculated from athlete weight, race duration,
  predicted conditions: carbs/hour (g), hydration ml/hour, electrolyte
  targets, gel/drink timing
- **Pre-race carb-loading protocol** — 3-day plan with calorie / gram
  targets keyed off weight + duration
- **Taper view** — automatic surface when within 21 days of goal race:
  - Countdown calendar
  - Daily checklist (sleep, hydration, carbs, last hard session,
    race-pace strides)
  - Confidence-building cues from training history ("your tempo paces
    have improved 12s/km across this block")
- **Post-race protocol** — triggers when goal race date passes:
  - Recovery prescription (no running 5-7d, walking, optional cross,
    then easy reintroduction over 2 weeks)
  - Race debrief input form (time achieved, conditions, RPE, lessons)
  - Lessons logged to journal
  - Prompt to set next goal once recovery period completes
- **Multi-block macrocycle awareness**
  - "This is your 3rd marathon block this year" context on Dojo page
  - Year-over-year self-comparison: "this week last year you ran X km
    averaging Y/km; this week you're at A km averaging B/km"

**Coach review additions integrated:** post-race / multi-block (#5),
race execution (#6), taper view (#8), self-comparison (#16)

---

## Phase 7 — Environmental context 🟢 FORECAST SHIPPED (heat-adjust deferred)

**Shipped:** keyless Open-Meteo daily forecast reader (`lib/weather/`),
Auckland default, degrades to null; a pure heat/humidity → pace-adjust
advisory (Daniels-inspired, capped 10%, observed/advisory-only); both
surfaced as a race-day `ForecastCard` on `/race`.

**Deferred / BLOCKED:** the past-activity + compliance-heat-adjust items
below need *stored per-activity weather*, which we do NOT capture today (see
the corrected bullet). They need per-activity lat-lon (Strava streams, not
fetched) + a historical-weather backfill. The next-week cell temp glyph is
buildable on the live forecast but is deferred.

**Why this matters:** a tempo run prescribed at 4:15/km in 28°C humid
conditions is a 4:30/km run in adjusted-pace terms — and the athlete
needs to know that. Without environmental context, compliance scoring
is blind to legitimate reasons sessions look "off."

**Build:**

- **Past activities:** surface temperature/humidity for past runs. ⚠️
  CORRECTION: contrary to an earlier assumption, Strava activity summaries do
  NOT carry weather - nothing is captured today. BLOCKED on a per-activity
  weather backfill (needs per-activity lat-lon + historical-weather lookup).
- **Compliance heat-adjustment:** when an activity occurred in conditions
  warranting adjustment, the compliance evaluator uses adjusted-pace targets
  (Daniels' tables for heat/humidity → equivalent sea-level pace). BLOCKED on
  the same stored-weather dependency.
- **Pre-session forecast:** ✅ done - keyless Open-Meteo reader (`lib/weather/`).
- **Forecast on next-week cells:** small temperature glyph on cells where the
  forecast suggests a pace adjustment. Deferred (buildable on the live forecast).
- **Race day forecast:** ✅ done on `/race` (ForecastCard). Auto-adjusting the
  pacing strategy by forecast is still deferred.

**Note on local-first:** Open-Meteo doesn't require accounts or keys.
Each forecast is a simple HTTPS GET. Doesn't break the local-first
posture meaningfully — same model as Strava (we already make outbound
HTTPS calls).

**Coach review additions integrated:** heat/humidity adjustment (#7)

---

## Phase 8 — Recovery prescription + session matching 🟢 SHIPPED (additive scope)

**Shipped:**
- **Recovery prescription** - `lib/plans/recovery-prescription-pure.ts` (+22
  tests) maps the prior day's actual load to a rest-day prescription
  (full-rest / light / active, with sleep + mobility targets). Surfaced as an
  ℞ glyph + hover on the current week's rest cells (tuned to yesterday's load,
  so current-week only where actual prior load is known).
- **Session matching (additive)** - `lib/analysis/session-match-pure.ts` (+9
  tests) layers over the day-of-week compliance engine WITHOUT rewriting it:
  detects sessions done a day off-schedule (+/-1, same kind) and activities
  that match no planned session ("extras"). Surfaced as a compact ⇄ annotation
  (with hover detail) on the matrix week row; the per-day compliance dots are
  unchanged.

**Deferred:** rewriting compliance scoring from the match (full cross-week
rematch); explicit voluntary-swap markup; recovery prescriptions on future
weeks (no actual prior-day load) and injury-aware tuning.

**Why this matters:** rest ≠ recovery, and "planned vs actual on
assigned days" doesn't survive contact with how athletes actually train.

**Build:**

- **Recovery prescription** — rest days in the matrix gain content:
  *"Recovery: 25min Z1 / mobility focus / 8h sleep target"*. Auto-tuned
  to load — heavier days mean stricter recovery prescription on the
  following day.
- **Session matching** — when an actual activity *fulfils a different
  planned slot* than its date suggests, recognise it and adapt:
  *"your Wednesday tempo activity satisfied your Tuesday tempo
  prescription. Wednesday's easy is now satisfied. You're effectively
  a day shifted."*
- **Voluntary swap detection** — athlete-initiated reshuffles within
  a week shouldn't ding compliance
- **Untargeted activities** — categorise activities not matching any
  planned session as "extra" rather than miscounting them as compliance

**Coach review additions integrated:** recovery prescription (#3),
session matching for messy reality (#12)

---

## Phase 9 — Coach voice + reflection

**Why this matters:** information without narrative is just data.
Athletes who reflect on training stay in their plan longer. Pre-canned
coach voice and structured reflection both improve adherence — these
aren't AI features, just behavioural design.

**Build:**

- **Scheduled coach voice** — pre-written messages that fire on
  specific plan-position triggers:
  - First taper week: "Volume drops 20% this week. This feels wrong.
    Trust it."
  - Mid-block fatigue point (typical week 8-10 of marathon block):
    "This is when most blocks feel hardest. Hold the line."
  - Post-missed-Tuesday-tempo pattern: "You missed Tuesday's session —
    here's how to think about that without spiralling."
- **Sunday-night journal prompt** — wire up the existing `journal` table:
  - 3 questions: how did you feel / what worked / what are you uncertain
    about for next week
  - Surfaces in Strike as a longitudinal reflection log
  - Prompts visible on Patrol Sunday afternoon onwards
- **Block-end debrief** — at end of each plan period, structured
  reflection captured to journal, used as context for the next block's
  goal-setting

**Coach review additions integrated:** coach voice (#14), accountability
journaling (#15)

---

## Phase 10 — AI integration (BYOK Anthropic)

**Why this matters:** AI without state is a parlour trick. By this point
we have athlete state, plan-of-record history, freshness, injury ledger,
calibration, race execution context, environmental data. *Now* AI has
something to reason about.

**Architecture:**

- BYOK (bring-your-own-key). User's Anthropic API key, stored in OS
  keychain via `keytar` (same path as Strava credentials)
- Setup flow under `/settings#ai`: key input, validation against a
  small cheap test call, model selection (default Claude Sonnet)
- Privacy posture: every AI request scoped to a single specific question.
  No background uploading. User can see exactly what data was sent for
  each request.
- Cost transparency: each AI feature shows estimated tokens / cost
  before the call

**Build:**

- **Daily briefing** — generated each morning (or on-demand):
  *"Today is your Pilates day. Given yesterday's tempo (RPE 8, HR
  drift suggested under-recovery) and your current freshness (TSB -8,
  loaded), here's a 30-minute flow focusing on hip mobility and
  nervous-system downregulation rather than strength work…"*
- **Plan adjustment recommendations** — when freshness or risk signals
  suggest deviation, AI proposes a specific swap with reasoning
- **Session content generation** — for auxiliary work, generate
  specific session content (Pilates flows, yoga sequences, strength
  routines) tailored to current state and athlete preferences
- **Cell drill-down explanation** — click any cell, get a
  coach-voice explanation of what happened or what's planned and why
- **Race week briefings** — daily AI-generated briefings during taper
  and pre-race, drawing on training history + forecast + state
- **Post-race debrief co-pilot** — AI helps unpack what happened,
  drawing on the training block's data alongside the race-day data

**Why specifically Anthropic for v1:** Matt has Max, the simplest BYOK
path. Plus the API itself supports tool calling, which lets the AI
*ask the app for data* rather than us pre-stuffing context — better for
both cost and relevance. Can add OpenAI / others later via the same
abstraction.

**Coach review additions integrated:** the AI layer is what makes
several earlier coach review items genuinely useful — the coach voice
in #14 graduates from pre-canned to context-aware once this lands.

---

## Phase 11 — Shoe intelligence

**Why this matters:** shoes are tracked but the system doesn't help
the athlete decide *which shoe for which session*. As a coach this is
basic guidance: long runs in cushioned shoes, intervals in racers,
recovery in max-cushion. The data is all there — we just don't apply it.

**Build:**

- **Rule-based shoe-for-session recommender:**
  - Long run → highest-cushion shoe with most life remaining
  - Tempo / interval → daily trainer or racer with sufficient life
  - Recovery → max-cushion / oldest still-safe shoe
  - Race → reserved race-day shoe
  - Trail session → trail-specific shoe
  - Wet/cold conditions → grip-appropriate shoe
- **Recommendations on Patrol:** today's planned cell shows
  *"recommended: Saucony Endorphin Speed (47/180 km left)"*
- **Rotation health:** Strike page surfaces whether the athlete is
  rotating effectively (uses 2-3+ shoes vs single-shoe risk)
- **AI-augmented recommendations** (depends on phase 10): adjust
  recommendations based on injury history per shoe, recent niggles,
  weather forecast

**Coach review additions integrated:** shoe-for-session (#3 from your
original brief; #15 here mostly), with AI escalation in phase 10

---

## Phase 12 — External data sources 🟡 SURFACED (sync still needs live test)

**Surfacing landed:** biometric read layer (`biometrics.ts` + pure
`biometrics-pure.ts`) resolves daily_health_metrics per-field by source
priority (manual-lab > garmin > whoop > apple-health > coros > manual);
`BiometricsCard` on Athlete State shows RHR / HRV / sleep / body battery /
stress / weight as stat tiles with 14-day sparklines and metric-specific
direction tone (lower-better RHR/stress, higher-better HRV/sleep/battery).
Pre-sync empty state guides the user to connect Garmin. 10 pure tests.

**Still pending:** Matt's first live Garmin connect+sync (cards render
empty until then); RHR/HRV correlation insights (R2.6 tier).

## Phase 12 (earlier notes) — superseded

> Superseded by **Phase 12 — External data sources** above (surfacing
> shipped; first live Garmin sync still pending).
> **Route decision resolved:** the unofficial `garmin-connect` library was
> chosen over the official Garmin Health API — works immediately, local-first
> aligned, supports plain + MFA login. Foundations landed: `daily_health_metrics`
> table, migration 0007, source priority manual-lab > garmin > whoop >
> apple-health > coros > manual.
> **Deferred:** Apple Health / Whoop / Coros adapters follow the same shape,
> untestable until a user with those devices exists. Original cloud-OAuth
> brief in git history.

---

## Phase 13 — Race fueling specifically (not full nutrition)

**Why this matters:** full nutrition logging is hugely expensive and
modestly useful. But race fueling is a *calculation*, not a log, and it
materially affects race outcomes. Worth surfacing as a focused capability.

**Build:**

- **Long-run fueling protocol** — calculated from weight + duration:
  carbs/hour, hydration ml/hour, electrolyte targets
- **Race-week carb-load protocol** — 3-day plan, gram targets
- **Race-day fueling plan** — gel/drink timing, calculated for race
  duration with conditions overlay
- Lives in Patrol's race-execution surface (phase 6) and gets enriched
  by AI (phase 10) for personalised tweaks

**Explicitly out of scope:** food diary, daily macro tracking, meal
logging. Those belong in a nutrition app, not a training app.

**Coach review additions integrated:** race fueling (#13)

---

## Phase 14 — Dojo maintenance + customisation

**Why this matters:** static dojos drift from the latest research. As
the product matures, this becomes a real strategic question.

**Build (when the time comes):**

- Dojo-tuning interface: athlete can adjust mileage caps, long-run
  caps, intensity distribution within a dojo's framework
- Versioned dojo files with update mechanism
- "Dojo authoring" mode for coaches to define custom dojos
- Optional: subscription tier for community-maintained dojo updates

**Coach review additions integrated:** dojo maintenance question (#17)

---

## What's explicitly out of scope (for now)

These have been considered and deliberately not put on the roadmap.

- **Social features.** The product is local-first by design. Cloud
  social features fundamentally break that.
- **Live activity recording.** Strava (and Garmin and Coros) do this
  better than we ever will. We consume their output.
- **Daily nutrition logging.** Race fueling yes (phase 13). Tracking
  every meal: no.
- **Live coaching marketplace.** The dojos are methodology; we don't
  intend to broker human coaches.
- **Marketing-style content.** The voice we've developed (Sinek-influenced,
  punchy, defensible metrics) doesn't extend into "10 tips to crush
  your next race." That's a content business, not a product.

---

## Done definition for "v1"

A serious distance runner can:

- Set a goal race + tune-ups, pick a dojo, get a plan that respects
  their current state (✓ now / ⏳ phase 3)
- See where they are against the plan, including environmental + life
  context (phase 4 ✓; phase 7 forecast ✓, heat-adjust ⏳; phase 2 ⏳)
- Get tactical race-execution support (pacing, fueling, taper, post-race
  recovery) (phase 6 v1 ✓ pacing/fueling/carb-load; part 2 ⏳ taper/post-race)
- Have an AI coach available for context-aware questions and daily
  briefings, paid via their own API key (⏳ phase 10)

Phases 1-7 + 10 are the v1 commit. Phases 8-9 + 11-13 are the v1.1
commit. Phase 14 is post-v1.

---

## Update protocol

When a phase lands:
1. Move its bullets to the Done section above
2. Update "Current focus" line at the top
3. Tick off any phase entries it completes; if a phase wasn't fully
   landed, list what's still pending under the next-current-focus phase
4. Note any roadmap revisions discovered while building (real builds
   teach the roadmap things)
