import type { PhaseBand } from '@/lib/plans/types';

/**
 * R2 part 2 - program-shape view for the active plan.
 *
 * Macrocycle: a bar across the whole block, each week coloured by its phase
 * band (base/build/peak/taper), with the current week ringed.
 * Microcycle: a representative week's session pattern (Mon..Sun), one cell
 * per day showing the primary session type.
 */

const BAND_TONE: Record<string, string> = {
  base: 'bg-signal-ok/60',
  build: 'bg-accent/70',
  peak: 'bg-signal-warn/70',
  taper: 'bg-signal-miss/50',
  'off-program': 'bg-ink-line',
};
const BAND_LABEL: Record<string, string> = {
  base: 'Base', build: 'Build', peak: 'Peak', taper: 'Taper', 'off-program': 'Off',
};

const SESSION_TONE: Record<string, string> = {
  easy: 'bg-signal-ok/25 text-signal-ok',
  recovery: 'bg-signal-ok/15 text-signal-ok',
  long: 'bg-accent/25 text-accent',
  tempo: 'bg-signal-warn/25 text-signal-warn',
  interval: 'bg-signal-miss/25 text-signal-miss',
  repetition: 'bg-signal-miss/25 text-signal-miss',
  cross: 'bg-ink-line text-bone-dim',
  strength: 'bg-ink-line text-bone-dim',
  rest: 'bg-ink-shadow text-bone-mute',
};
const SESSION_ABBR: Record<string, string> = {
  easy: 'E', recovery: 'Rec', long: 'L', tempo: 'T', interval: 'I',
  repetition: 'R', cross: 'X', strength: 'S', rest: '·',
};

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function ProgramShapeCard({
  dojoName,
  programWeeks,
  currentWeek,
  bands,
  micro,
}: {
  dojoName: string;
  programWeeks: number;
  currentWeek: number | null;
  bands: PhaseBand[];
  micro: { dow: number; type: string; label: string }[];
}) {
  const legendBands = bands.filter((b, i) => bands.indexOf(b) === i && b !== 'off-program');
  const microByDow = new Map(micro.map((m) => [m.dow, m]));

  return (
    <div className="nn-card p-6 space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          program shape - {dojoName}
        </div>
        {currentWeek && (
          <span className="font-mono text-xs text-bone-dim">week {currentWeek} of {programWeeks}</span>
        )}
      </div>

      {/* Macrocycle phase bar */}
      <div className="space-y-2">
        <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">macrocycle</div>
        <div className="flex gap-px h-6 rounded-md overflow-hidden">
          {bands.map((b, i) => {
            const wk = i + 1;
            const isCurrent = currentWeek === wk;
            return (
              <div
                key={i}
                title={`Week ${wk} - ${BAND_LABEL[b]}`}
                className={`flex-1 ${BAND_TONE[b]} ${isCurrent ? 'ring-2 ring-bone ring-inset' : ''}`}
              />
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {legendBands.map((b) => (
            <span key={b} className="inline-flex items-center gap-1.5 font-mono text-[10px] text-bone-dim">
              <span className={`w-2.5 h-2.5 rounded-sm ${BAND_TONE[b]}`} />
              {BAND_LABEL[b]}
            </span>
          ))}
        </div>
      </div>

      {/* Microcycle preview */}
      <div className="space-y-2">
        <div className="font-mono text-[10px] uppercase tracking-widest text-bone-mute">
          typical week{currentWeek ? ` (week ${currentWeek})` : ''}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, dow) => {
            const m = microByDow.get(dow);
            const type = m?.type ?? 'rest';
            return (
              <div key={dow} className="flex flex-col items-center gap-1">
                <span className="font-mono text-[9px] text-bone-mute uppercase">{DOW_LABELS[dow]}</span>
                <span
                  className={`w-full h-9 rounded-md flex items-center justify-center font-display text-sm ${SESSION_TONE[type] ?? SESSION_TONE.rest}`}
                  title={m?.label ?? 'Rest'}
                >
                  {SESSION_ABBR[type] ?? '·'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
