# VELOCITY — AI Coach ("Sensei")
### Product Requirements Document

| | |
|---|---|
| **Product** | VELOCITY (repo: `night-ninjas-shadow-tracker`) |
| **Module** | AI Coach — working name **Sensei** |
| **Author** | Matt Harkness |
| **Date** | 15/07/2026 |
| **Status** | Draft for build |
| **Audience** | Closed group — Night Ninjas, ≤10 known athletes |

---

## 1. WHY

Runners chasing a hard goal don't fail on effort. They fail on *judgement between sessions* — running the easy day too hard, ignoring a bad night's sleep, holding a plan that stopped fitting three weeks ago. A good coach closes that gap: reads what actually happened, weighs it against life, and adjusts the next run so the plan bends without breaking.

**Sensei is that coach for a small, trusted group.** Each athlete connects their own accounts. The system analyses every run against a chosen training framework, folds in wellness and life context, and prescribes the next run — always aligned to the race goal, the tune-up races, the weeks remaining, and the framework. Feedback is upbeat in stance but unflinchingly honest about the work.

**The central design bet:** the AI does not own the training science. A deterministic engine owns the truth — frameworks, load, guardrails. Haiku owns the *language and the bounded judgement call* on top of it. That split is what makes the coach consistent, safe, and cheap.

---

## 2. Problem Statement

Self-coached runners have data (Strava, watch wellness metrics) but no one turning it into a *decision* about tomorrow. Generic plans ignore last night's sleep, a work trip, or a session that blew past target. LLM-only "AI coaches" drift — they invent paces, contradict last week, and can prescribe something that spikes an athlete into injury. Neither serves a runner with a fixed race date and a real life around it.

For the Night Ninjas group specifically: a shared, private coach that treats each athlete's own data, adapts to their framework and goal, and never exposes one runner's data to another.

---

## 3. Goals

1. **Consistent framework analysis.** Every completed run is scored against the athlete's chosen framework (Hansons, Lydiard, Norwegian Singles, +) with identical logic run-to-run — same inputs, same assessment.
2. **Context-aware next run.** The prescribed next session reflects compliance, coach assessment, HR/HRV, rest, sleep, nutrition, load, fatigue, injury, sickness, and life events — reconciled against goal, tune-ups, weeks-left, and framework.
3. **Feedback that changes behaviour.** Daily and weekly feedback is upbeat but candid — names the gap, gives the fix, holds the standard. Target: athletes act on it.
4. **Safe by construction.** No prescribed session ever breaches HR caps or load-ramp limits. Injury/sickness biases conservative. Plan changes are surfaced, not silently applied.
5. **Runs for the group at near-zero cost.** ≤10 athletes, self-serve Strava tier, cheap Haiku inference, CAPEX-friendly hosting.

---

## 4. Non-Goals (v1)

- **Not a public product.** Scope is capped at 10 athletes — the self-serve Standard Tier ceiling. Going beyond triggers Strava's Developer Program review, where AI use of activity data is explicitly scrutinised. Out of scope by design.
- **Not multi-tenant SaaS.** No open sign-up, no billing, no marketplace. A shared club instance (or per-athlete local installs).
- **The LLM does not generate plans from scratch.** Haiku selects and narrates within the deterministic engine's envelope. It never authors paces, zones, or sessions freehand.
- **Not medical advice.** Injury/sickness inputs inform load and tone only. No diagnosis, no return-to-run clearance.
- **Apple Health not in v1.** Under investigation — HealthKit is on-device only and needs a companion app; deferred.
- **No replication of Strava's look and feel.** Own design language (dark industrial: Syne / Space Mono / DM Sans, cyan accent).

---

## 5. Architecture — the split that matters

```
  DATA SOURCES                NORMALISATION            DECISION                 SURFACE
  ┌──────────────┐            ┌──────────────┐         ┌──────────────────┐     ┌──────────────┐
  │ Strava       │──adapter──▶│              │         │ DETERMINISTIC     │     │ Daily feed   │
  │ Garmin sidecar│──adapter──▶│ Normalised   │────────▶│ COACHING ENGINE  │────▶│ Weekly recon │
  │ COROS API    │──adapter──▶│ schema       │  facts  │ • frameworks     │     │ Next run     │
  │ Polar API    │──adapter──▶│ (source-      │         │ • load / fatigue │     │ card         │
  │ Apple (TBD)  │──adapter──▶│  agnostic)   │         │ • readiness      │     └──────▲───────┘
  │ Manual journal│──────────▶│              │         │ • guardrails     │            │
  └──────────────┘            └──────────────┘         └───────┬──────────┘            │
                                                               │ facts + envelope       │ narrative +
                                                               ▼                        │ bounded pick
                                                        ┌──────────────────┐            │
                                                        │ AI COACH (Haiku)  │───────────┘
                                                        │ narrate + choose  │
                                                        │ within envelope   │
                                                        └──────────────────┘
```

### 5.1 Deterministic Coaching Engine — owns the truth
Plain TypeScript, no LLM. Same inputs → same outputs, always. Responsibilities:
- **Frameworks as data + logic:** each framework (Hansons first) encoded as zones, weekly structure, progression rules, and taper logic. Not prose — rules.
- **Computed metrics:** compliance vs prescribed session, training load (rolling acute:chronic), fatigue trend, readiness score from wellness inputs.
- **Guardrails:** absolute HR caps (easy ≤128 bpm, sub-threshold ≤141 bpm, max HR 166); weekly load-ramp ceiling; conservative bias flag when injury/sickness present.
- **Next-run envelope:** produces the *permitted* set of next sessions (type, pace band, HR band, duration) given plan position + adjustments. This is the box Haiku must stay inside.

### 5.2 AI Coach layer (Haiku) — owns language + bounded judgement
`claude-haiku-4-5`. Consumes the engine's computed facts and the athlete context object. Produces:
- **Narrative feedback** — daily and weekly, in the Sensei voice (§8).
- **A bounded next-run pick** — selects and annotates *from within* the engine's envelope, with a one-line rationale tied to the actual context.

Haiku never emits raw paces/HR from its own head. Every numeric it surfaces originates in the engine. Output is validated against the envelope before display — anything out of range is rejected and re-prompted or clamped.

### 5.3 Human-in-the-loop
Plan-altering changes (shifting a workout, cutting a week, moving the taper) are *surfaced with rationale* and confirmed by the athlete. The coach recommends; the human commits. Consistent with VELOCITY's locked rule that logged injuries inform, never auto-adjust.

---

## 6. Data Sources & Integration

All sources sit behind **replaceable per-vendor adapters (MCP-style isolation)** feeding one **normalised wellness/activity schema**. Swapping or losing a source degrades gracefully; nothing downstream knows which vendor a metric came from.

| Source | Method | Data | Auth | v1? | Notes |
|---|---|---|---|---|---|
| **Strava** | Official API (OAuth2) | Activity: pace, HR stream, distance, power, elevation, cadence, GAP | Per-athlete OAuth, tokens in Drizzle/SQLite (encrypted) | ✅ | ≤10 athletes self-serve. Each sees only own data — compliant. New base URL live 04/01/2027 → keep base URL configurable. |
| **Garmin** | **3rd-party sidecar, athlete's own login** | HRV, sleep, resting HR, body battery, stress | Per-athlete Garmin credentials, encrypted, local | ✅ (self first) | Unofficial-login path — fragile to Garmin changes. Isolate hard behind adapter; treat as best-effort. |
| **COROS** | Official developer API | Activity + wellness | OAuth2 | ✅ | Cleanest official wellness route. |
| **Polar** | Official developer API (AccessLink) | Activity + wellness (sleep, recovery) | OAuth2 | ✅ | Official, stable. |
| **Apple** | Under investigation | HealthKit (HRV, sleep, RHR) | Companion iOS app export | ⛔ v1 | No cloud API; on-device only. Deferred. |
| **Manual journal** | In-app | Nutrition, subjective sleep/stress, sickness, injury flags, life events (birthdays, holidays, work travel) | n/a | ✅ | Already in VELOCITY. Fills gaps no device provides. |
| **Nutrition** | Under investigation | macros, fuelling | n/a | ⛔ | MyFitnessPal API effectively closed to small apps; Cronometer et al. unverified. Eventual v1 path is a manual macros field in the daily check-in; importer research parked at P2. |

**Design rule:** wellness metrics are optional inputs. A run is fully coachable on manual entry + journal alone; device wellness *sharpens* readiness but is never required.

---

## 7. The Context Set → Next Run

Everything below flows into the engine's readiness/adjustment logic, then into the coach's bounded pick. Each input's role is defined so nothing is hand-wavy:

| Input | Source | Effect on next run |
|---|---|---|
| Compliance to prescribed session | Engine (Strava vs plan) | Under-compliance → reinforce; over-reach → pull back intensity |
| Coach assessment of completed run | Engine + Haiku | Quality/execution read feeds the following prescription |
| HR / HRV | Device wellness | Suppressed HRV / elevated RHR → readiness down → easier or shorter |
| Rest / sleep | Device + journal | Poor sleep → conservative bias |
| Nutrition | Journal | Under-fuelling flag → cap intensity, note it |
| Load / fatigue | Engine (ACWR) | High acute load → forced easy/recovery; ramp ceiling enforced |
| Injury / sickness | Journal | Conservative bias + surfaced plan-change prompt (human confirms) |
| Life events | Journal + calendar | Travel/holiday/birthday → reshuffle, protect key sessions, absorb missed ones |

**Always reconciled against:** race goal (Auckland Marathon, 01/11/2026, sub-3:00), tune-up races (e.g. Devonport Half, 04/10/2026), weeks remaining, and chosen framework. The coach never optimises today in isolation — it optimises the path to race day.

---

## 8. Voice — the Sensei feedback spec

Upbeat stance, honest content. **Encouraging about the athlete, candid about the work.** Names the gap, never the person. Challenges without belittling. No hollow praise — praise is earned and specific.

- ✅ "Solid week — you nailed the tempo. But three easy runs drifted into 5:10s. That's stealing from Sunday's long run. Rein it in."
- ❌ "You're lazy / you failed / you're behind." (never demeaning)
- ❌ "Amazing job, superstar!!" on a missed session. (never false)

Tone is test-enforced (like VELOCITY's existing "possible factor" wording guards). Two cadences:
- **Daily:** short, reactive — one read on today, one pointer to tomorrow.
- **Weekly (Recon):** the honest debrief — compliance, load trend, what held, what slipped, the week ahead.

---

## 8.5 Daily flow — how the athlete experiences a day

The app is organised around three loops: **DAILY** (every open → Patrol: the daily brief), **WEEKLY** (Sundays → Recon: the honest debrief, per §8), **RARE** (setup/config → Profile: connections, calibration, plan, defaults).

The daily brief composes on Patrol in priority order:

| Loop | Component | What happens |
|---|---|---|
| DAILY (open) | Ambient sync | Incremental sync auto-fires on open when data is stale; progress in a banner, never a button-first chore |
| | Prompt queue | One context-completeness check assembles what the coach is missing today: wellness check-in, unlogged session → P0-7 form, integration errors. Each prompt skippable; skipping applies the athlete's configured default |
| | Coach read | Assessment of the most recent run (deterministic now, Sensei narrative when the Haiku layer lands) |
| | Next-session card | The prescription with rationale, flagged with life events from the calendar |
| | Goal line | Race countdown + on-track read |
| WEEKLY (Sunday) | Recon | Honest debrief — compliance, load trend, what held, what slipped, the week ahead |
| RARE (Profile) | Connections | One surface listing every adapter (Strava, Garmin, COROS, Polar) with status/last-sync; defaults for absent sources configured there |

**Design rule:** the prompt-queue/defaults pattern is the standard for ALL missing data. The system asks once on open or uses the configured default — never a dead-end empty page mid-flow.

---

## 9. User Stories

**As an athlete, I want to** connect my Strava so my runs analyse automatically — **so that** I don't log anything manually.
**As an athlete, I want to** connect my watch's wellness data — **so that** the coach knows when I'm cooked before I do.
**As an athlete, I want to** pick my framework and race goal once — **so that** every session traces back to it.
**As an athlete, I want** a daily read and a weekly debrief that's honest — **so that** I actually correct course.
**As an athlete, I want** the next run to change when life does (travel, bad sleep, a cold) — **so that** the plan survives contact with reality.
**As an athlete, I want to** log nutrition, sickness, and life events — **so that** the coach has the context a device can't see.
**As an athlete, I want** plan changes surfaced for my okay, not applied behind my back — **so that** I stay in control.
**As the group owner, I want** each athlete to see only their own data — **so that** we stay compliant and private.

---

## 10. Requirements

### P0 — Must have (v1 not viable without)
- **P0-1 Multi-user Strava OAuth (≤10).** Per-athlete authorise, encrypted token storage, refresh helper, rate-limit aware.
  - *Given* an athlete opens their auth link, *when* they approve on Strava, *then* their tokens are stored encrypted and their history backfills.
  - [ ] Each athlete's data is isolated; no cross-athlete visibility.
  - [ ] Refresh handled before expiry; failures logged, surfaced, non-fatal.
- **P0-2 Normalised schema + adapter layer.** One source-agnostic model; Strava + manual journal adapters.
- **P0-3 Deterministic engine — Hansons.** Framework encoded; compliance, load (ACWR), fatigue, readiness computed; guardrails enforced.
  - [ ] Identical inputs produce identical assessment + next-run envelope (determinism test).
  - [ ] No envelope session breaches HR caps or ramp ceiling — ever (property test).
- **P0-4 Haiku feedback + bounded next-run.** Daily + weekly narrative; next-run pick from envelope with rationale.
  - *Given* engine facts + context, *when* Haiku responds, *then* every numeric traces to the engine and output validates inside the envelope.
  - [ ] Out-of-envelope output is rejected/clamped, never shown.
- **P0-5 Journal inputs.** Nutrition, sleep quality, stress, sickness, injury, life events — feeding context.
- **P0-6 Human-in-the-loop plan changes.** Adjustments surfaced with rationale; athlete confirms.
- **P0-7 Manual results fallback.** When no activity data arrives for a prescribed session (no sync, no device, source outage), the athlete is prompted with a results form — distance, duration, avg HR (optional), RPE, notes. Saved as a first-class activity (`source: 'manual'`), it flows through the identical engine path: compliance, load (ACWR), assessment, and the coach's next-run prescription against the race goal.
  - *Given* a prescribed session's date has passed with no matching activity, *when* the athlete opens the app, *then* a "log your result" prompt surfaces and the submitted result is scored like any synced run.
  - [ ] Manual results are indistinguishable to the engine; the coach narrative acknowledges self-reported data (no HR stream → compliance judged on distance/duration/RPE).
  - [ ] If a device sync later delivers the same run, the overlap is surfaced for merge/supersede — never double-counted into load.

### P1 — Should have (fast follow)
- **P1-1 Garmin sidecar** (self first, then group) — HRV/sleep/RHR into readiness.
- **P1-2 COROS + Polar adapters.**
- **P1-3 Additional frameworks** — Lydiard, Norwegian Singles.
- **P1-4 Tune-up + taper logic** — races as anchors; auto-taper into goal race.
- **P1-5 Feedback usefulness signal** — thumbs on each coach message.

### P2 — Future / architectural insurance
- Apple Health companion export.
- Strava webhooks (vs poll-first — see §12).
- Richer load models (power-based, HRV-guided periodisation).
- Calendar connector for automatic life-event ingestion.
- Nutrition importer research spike (vendor APIs, export formats).

---

## 11. Success Metrics

**Leading (weeks)**
- Connection: all active club athletes connected within 14 days of invite.
- Compliance: prescribed-session compliance rate per athlete, trending up.
- Engagement: next-run recommendation acceptance rate.
- Consistency: engine determinism check passes 100% (same input → same assessment).
- Feedback action: % of daily/weekly messages marked useful.

**Lagging (block/season)**
- Load safety: zero weeks breaching the ramp ceiling; injury incidence flat or down.
- Progression: tune-up race times tracking the sub-3:00 curve (Devonport 04/10/2026 as checkpoint).
- Outcome: Auckland Marathon 01/11/2026 result vs goal.

---

## 12. Open Questions

- **Session / identity handling** (eng) — *blocking.* How athletes are identified across a shared instance vs per-athlete local installs. Leaning: lightweight per-athlete profile keyed to their Strava athlete ID; no passwords if local.
- **Webhooks vs poll-first** (eng) — *non-blocking.* At ≤10 athletes, polling is trivially within rate limits and far simpler. Recommendation: **poll-first in v1**, webhooks as P2 only if latency matters.
- **Garmin sidecar durability** (eng/legal) — how much to invest given the unofficial-login fragility. Isolate behind the adapter so a break degrades to journal-only readiness.
- **Hosting shape** (arch) — single small club instance vs per-athlete local. Decides §12.1 and the CAPEX profile.
- **Readiness formula weighting** (data) — how HRV/sleep/load combine into one readiness score; needs calibration against real data before it drives prescriptions.
- **Nutrition import** (research) — *non-blocking, parked.* Which vendors expose usable APIs/exports; revisit after v1.

---

## 13. Phasing

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Foundations** | Multi-user Strava OAuth (in progress), normalised schema, engine skeleton + Hansons, guardrails | Athlete connects; runs score deterministically; no unsafe envelope |
| **1 — The coach** | Haiku daily/weekly feedback, bounded next-run, journal, human-in-the-loop | Full loop for one athlete on Strava + journal |
| **2 — Wellness** | Garmin sidecar (self→group), COROS, Polar adapters; readiness live | HRV/sleep measurably shifting prescriptions |
| **3 — Frameworks & race logic** | Lydiard, Norwegian Singles; tune-up anchors + taper; goal-path reconciliation | Framework switch works; taper auto-builds to 01/11/2026 |
| **4 — Future** | Apple export, webhooks, richer load models, calendar | As prioritised post-race |

---

## 14. Constraints & Risks

- **Strava AI clause (residual).** The terms prohibit using API data in AI applications. At ≤10 self-serve athletes there's no review gate to fail, and enforcement against a private friends-and-family group analysing their own data is negligible — but it's a residual, not a zero. Stay in the lane; don't scale into review.
- **Strava base URL change 04/01/2027.** Configurable base URL in the OAuth/refresh layer now.
- **Garmin sidecar fragility.** Unofficial login can break on Garmin's side without notice. Adapter isolation + graceful degradation to journal-only.
- **Determinism vs LLM.** The whole safety case rests on Haiku staying inside the engine envelope. Envelope validation is not optional — it's the seatbelt.
- **Health data duties.** Even privately, this is other people's health data. Encrypt at rest, per-athlete isolation, explicit consent on connect.

---

## Tech Stack (confirmed)
Next.js 15 · React 19 · TypeScript · Tailwind 3 · Drizzle + better-sqlite3 · Vitest · keytar (token encryption) · Anthropic `claude-haiku-4-5` · per-vendor MCP-style adapters.
