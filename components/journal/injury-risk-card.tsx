import { Shield, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { InjuryRisk, RiskLevel } from '@/lib/analysis/interruptions-pure';

/**
 * Phase 4 - injury-risk read. Combines ACWR with logged injury history. Flags
 * risk; it does not diagnose. Tone follows the level.
 *
 * DESIGN-SPEC §3.4: stays a base card - ActiveInterruptionBanner is Journal's
 * only hero. The level read still comes through clearly via the icon and
 * badge colour; the full tone-tinted border/background this card used to
 * carry is dropped in favour of the plain base shell.
 */

const ICON_TONE: Record<RiskLevel, string> = {
  low: 'text-signal-ok',
  elevated: 'text-signal-warn',
  high: 'text-signal-miss',
};
const ICON = { low: ShieldCheck, elevated: Shield, high: ShieldAlert };
const LABEL: Record<RiskLevel, string> = { low: 'Low', elevated: 'Elevated', high: 'High' };

export function InjuryRiskCard({ risk }: { risk: InjuryRisk }) {
  const Icon = ICON[risk.level];
  return (
    <div className="nn-card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Icon size={18} strokeWidth={1.5} className={ICON_TONE[risk.level]} />
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">
          injury risk
        </div>
        <span className={`font-mono text-[10px] uppercase tracking-widest ml-auto ${ICON_TONE[risk.level]}`}>
          {LABEL[risk.level]}
        </span>
      </div>

      {risk.factors.length > 0 && (
        <ul className="font-mono text-xs text-bone-dim space-y-1">
          {risk.factors.map((f, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-bone-mute shrink-0">·</span>
              {f}
            </li>
          ))}
        </ul>
      )}

      <p className="text-sm text-bone-dim leading-relaxed">{risk.body}</p>
    </div>
  );
}
