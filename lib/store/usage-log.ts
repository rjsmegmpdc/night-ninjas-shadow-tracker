import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import { resolveDataDir } from '@/lib/db/data-dir';
import { isWorkerd } from '@/lib/runtime';

/**
 * cloud-3: on workerd (Cloudflare) this whole module is a no-op — decided
 * against a D1 table for usage events (would collide with the schema work
 * landing in parallel; a local-first diagnostic log has little value once
 * the app isn't running on the user's own disk anyway). Every exported
 * function below checks `isWorkerd()` first and returns a safe empty/no-op
 * result before touching `fs`. `node:fs`/`node:path` stay statically
 * imported (unlike lib/db/index.ts's dynamic-import split) because they're
 * never reached at runtime on workerd — only guarded on the node path,
 * which is unaffected. Node keeps the exact disk-log behaviour below.
 *
 * Usage logger — append-only JSON Lines stream of app events.
 *
 * Captured events:
 *   - page_view       : every server-rendered page load
 *   - action          : server action invocations (createRace, syncJob, etc)
 *   - error           : unhandled errors during action execution
 *   - feedback_sent   : when the user composes a feedback email
 *
 * What we DO NOT capture:
 *   - Form input values (race names, target times, free-text notes)
 *   - Personally identifiable details
 *   - Strava activity content
 *   - Anything that would make this log unsafe to email
 *
 * The whole point is that you can attach this to a feedback email without
 * leaking anything you wouldn't have wanted to share. If a field looks
 * sensitive, we don't log it.
 *
 * File: <data dir>/usage-log.jsonl
 * Format: one JSON object per line, terminated by \n
 *
 * Rotation: when the file exceeds 5 MB we rename it to usage-log.1.jsonl
 * and start fresh. Only the most recent log gets attached to feedback;
 * older ones stay in the data dir for the user to inspect manually.
 */

const LOG_FILENAME = 'usage-log.jsonl';
const ROTATE_LOG_FILENAME = 'usage-log.1.jsonl';
const ROTATE_AT_BYTES = 5 * 1024 * 1024;

export type EventType = 'page_view' | 'action' | 'error' | 'feedback_sent';

export interface UsageEvent {
  ts: string; // ISO 8601 with TZ offset
  type: EventType;
  /** Path or action identifier — e.g. '/calendar', 'createRace', 'syncJobs.run' */
  name: string;
  /** Duration in milliseconds for actions / page renders. */
  durationMs?: number;
  /** ok / error — for actions and page views */
  outcome?: 'ok' | 'error';
  /** Short error tag (no stack, no message text — those leak detail) */
  errorTag?: string;
  /** Anonymised metadata — e.g. { rowsAffected: 47 }. NEVER includes user input. */
  meta?: Record<string, string | number | boolean>;
}

function logFilePath(): string {
  return path.join(resolveDataDir(), LOG_FILENAME);
}

function rotateIfNeeded(): void {
  try {
    const filePath = logFilePath();
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (stats.size < ROTATE_AT_BYTES) return;
    const rotated = path.join(resolveDataDir(), ROTATE_LOG_FILENAME);
    // Replace any previous rotation
    if (fs.existsSync(rotated)) fs.unlinkSync(rotated);
    fs.renameSync(filePath, rotated);
  } catch {
    // Rotation failure shouldn't break the app — silently swallow
  }
}

/**
 * Append an event to the usage log. Synchronous + best-effort.
 * Never throws — logging must not break the app.
 */
export function logEvent(event: Omit<UsageEvent, 'ts'>): void {
  if (isWorkerd()) return; // no-op on workerd — see module header
  try {
    rotateIfNeeded();
    const fullEvent: UsageEvent = {
      ts: new Date().toISOString(),
      ...event,
    };
    const line = JSON.stringify(fullEvent) + '\n';
    fs.appendFileSync(logFilePath(), line, { encoding: 'utf8' });
  } catch {
    // Silent — logging failure must not surface to the user
  }
}

/** Read the entire current log as a string. Used to attach to feedback emails. */
export function readLog(): string {
  if (isWorkerd()) return ''; // no-op on workerd — see module header
  try {
    const filePath = logFilePath();
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Get the absolute file path — used by the "Reveal in Explorer" action.
 * Returns '' on workerd (no-op — there is no log file to reveal there).
 */
export function getLogFilePath(): string {
  if (isWorkerd()) return '';
  return logFilePath();
}

/** Get a one-line summary for display in the feedback modal. */
export function summariseLog(): {
  filePath: string;
  exists: boolean;
  sizeBytes: number;
  estimatedEvents: number;
  oldestEvent: string | null;
} {
  if (isWorkerd()) {
    return { filePath: '', exists: false, sizeBytes: 0, estimatedEvents: 0, oldestEvent: null };
  }
  const filePath = logFilePath();
  if (!fs.existsSync(filePath)) {
    return { filePath, exists: false, sizeBytes: 0, estimatedEvents: 0, oldestEvent: null };
  }
  try {
    const contents = fs.readFileSync(filePath, 'utf8');
    const lines = contents.split('\n').filter((l) => l.length > 0);
    const sizeBytes = Buffer.byteLength(contents, 'utf8');

    let oldest: string | null = null;
    if (lines.length > 0) {
      try {
        const first = JSON.parse(lines[0]) as UsageEvent;
        oldest = first.ts;
      } catch {
        // first line is malformed — ignore
      }
    }

    return {
      filePath,
      exists: true,
      sizeBytes,
      estimatedEvents: lines.length,
      oldestEvent: oldest,
    };
  } catch {
    return { filePath, exists: false, sizeBytes: 0, estimatedEvents: 0, oldestEvent: null };
  }
}
