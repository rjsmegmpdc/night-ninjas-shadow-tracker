import type { Dojo, Level } from '@/lib/plans/types';
import { getEngine } from '@/lib/plans/index';
import { getDojoCardMeta } from '@/lib/plans/dojo-card-meta';
import { cn } from '@/lib/utils';

/**
 * DojoCard - one card in the picker.
 *
 * Visual structure (top to bottom):
 *   - Ribbon (optional, accent-coloured)
 *   - Title (display font, large)
 *   - Tagline (mono, dim)
 *   - Hero stat (display font, very large) + label
 *   - Secondary stat row (program weeks, peak load)
 *   - Feature list (mono, line-by-line)
 *   - CTA button (filled accent if selected, ghost otherwise)
 *
 * Selected state (redesign spec §1.4 - dojo picker's chosen card is the
 * named example of a genuine nn-card-active selection state): accent
 * border + inner glow, same ingredients as `nn-card-active` elsewhere,
 * applied without the rounded corners since this card sits in the
 * hairline picker grid (gap-px bg-ink-line) rather than as a
 * free-standing card.
 *
 * Level prop: drives the hero stat (entryWeeklyLoadKm by level).
 * Custom returns 0 - we render "flexible" instead of a number.
 */
export function DojoCard({
  dojo,
  level,
  selected,
  onSelectFormAction,
}: {
  dojo: Dojo;
  level: Level;
  selected: boolean;
  /** Server action handler for selecting this dojo. Form-action wired. */
  onSelectFormAction: (formData: FormData) => void | Promise<void>;
}) {
  const engine = getEngine(dojo);
  const meta = getDojoCardMeta(dojo);
  const entryKm = engine.entryWeeklyLoadKm(level);

  // Hero stat: weekly load (km) for level, or "flexible" for custom
  const heroValue = entryKm > 0 ? entryKm.toString() : 'flex';
  const heroUnit = entryKm > 0 ? 'km/wk' : '';
  const heroLabel = entryKm > 0 ? `${level} entry load` : 'choose your own';

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-ink-shadow border transition-colors',
        selected ? 'border-accent shadow-accent-inset' : 'border-ink-line'
      )}
    >
      {/* Ribbon - optional, accent for distinguishing dojos.
          Always renders the same height area so cards align. */}
      <div
        className={
          'h-7 flex items-center justify-center font-display tracking-wide-display uppercase text-[10px] ' +
          (meta.ribbon
            ? 'bg-accent text-ink'
            : 'bg-ink-shadow text-bone-mute')
        }
      >
        {meta.ribbon ?? ''}
      </div>

      <div className="flex flex-col flex-1 p-5 space-y-4">
        {/* Title + tagline */}
        <div className="space-y-1">
          <h3 className="font-display tracking-wide-display uppercase text-xl text-bone leading-tight">
            {engine.displayName}
          </h3>
          <p className="font-mono text-[11px] text-bone-mute leading-relaxed">
            {meta.tagline}
          </p>
        </div>

        {/* Hero stat */}
        <div className="space-y-0.5">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-5xl text-bone tabular-nums leading-none">
              {heroValue}
            </span>
            {heroUnit && (
              <span className="font-mono text-sm text-bone-mute">
                {heroUnit}
              </span>
            )}
          </div>
          <div className="font-mono text-[10px] text-bone-mute uppercase tracking-widest">
            {heroLabel}
          </div>
        </div>

        {/* Secondary stat */}
        <div className="font-mono text-xs text-bone-dim border-t border-ink-line pt-3">
          {engine.defaultProgramWeeks} week program
          <span className="text-bone-mute"> · </span>
          long runs to {engine.defaultLongRunCapKm}km
        </div>

        {/* Feature list */}
        <ul className="space-y-1.5 flex-1">
          {meta.features.map((feature, i) => (
            <li key={i} className="font-mono text-[11px] text-bone-dim leading-relaxed">
              {feature}
            </li>
          ))}
        </ul>

        {/* CTA */}
        <form action={onSelectFormAction}>
          <input type="hidden" name="dojo" value={dojo} />
          <button
            type="submit"
            disabled={selected}
            className={
              'w-full py-2.5 border font-display tracking-wide-display uppercase text-xs transition-colors ' +
              (selected
                ? 'bg-accent text-ink border-accent cursor-default'
                : 'border-ink-line text-bone hover:border-accent hover:text-accent cursor-pointer')
            }
          >
            {selected ? 'Selected' : 'Choose this dojo'}
          </button>
        </form>
      </div>
    </div>
  );
}
