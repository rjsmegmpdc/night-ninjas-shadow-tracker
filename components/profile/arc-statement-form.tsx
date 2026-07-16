'use client';

import { useRef, useState, useTransition } from 'react';
import { updateArcStatement, type ArcStatementResult } from '@/lib/actions/arc-statement';

/**
 * G-005 (UI redesign) - arc statement editor (DESIGN-SPEC §2.5, §3.5).
 *
 * A one-line, athlete-authored motivation caption shown as a quiet italic
 * mono caption directly under Patrol's (and Race's) page title - the one
 * piece of text on those screens the athlete wrote themselves rather than
 * the deterministic engine. Nullable; blank clears it and the caption
 * simply stops rendering there (silent-when-empty).
 *
 * `initial`/`maxLength` are read server-side on Profile (getArcStatement +
 * the exported ARC_STATEMENT_MAX_LENGTH) and passed in as props.
 */
const inputClass =
  'w-full bg-ink-shadow border border-ink-line rounded-lg px-3 py-2 font-mono text-bone placeholder:text-bone-mute focus:border-accent focus:outline-none resize-none';

export function ArcStatementForm({
  initial,
  maxLength,
}: {
  initial: string | null;
  maxLength: number;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<ArcStatementResult | null>(null);
  const [value, setValue] = useState(initial ?? '');

  const submit = () => {
    if (!formRef.current) return;
    const fd = new FormData(formRef.current);
    setResult(null);
    startTransition(async () => {
      setResult(await updateArcStatement(fd));
    });
  };

  const remaining = maxLength - value.length;

  return (
    <div className="border border-ink-line rounded-xl p-6 space-y-4">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
        arc statement
      </div>
      <p className="font-mono text-xs text-bone-mute leading-relaxed">
        A one-line reminder of why this race matters to you - shown as a
        quiet caption under Patrol's page title, right where the goal-race
        countdown lives. Optional; leave it blank and nothing shows there.
      </p>

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); submit(); }} className="space-y-2">
        <textarea
          name="arcStatement"
          rows={2}
          maxLength={maxLength}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. first sub-3 after three years of trying"
          className={inputClass}
        />
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] tabular-nums text-bone-mute">
            {remaining} left
          </span>
          <button
            type="submit"
            disabled={isPending}
            className="px-5 py-2 bg-accent text-ink rounded-lg font-display tracking-wide-display uppercase text-sm hover:bg-accent-hover disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>

      {result && (
        <div
          className={
            'rounded-lg p-3 text-sm ' +
            (result.ok
              ? 'bg-signal-ok/10 border border-signal-ok/40 text-signal-ok'
              : 'bg-signal-miss/10 border border-signal-miss/40 text-signal-miss')
          }
        >
          {result.ok ? 'Saved.' : result.error}
        </div>
      )}
    </div>
  );
}
