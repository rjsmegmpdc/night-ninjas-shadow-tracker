import type { Vo2InsightReport, InsightTier } from '@/lib/analysis/vo2max-insights';
import { TrendingUp, Lightbulb, AlertTriangle } from 'lucide-react';

/**
 * R2.6 - VO2 max insights, grouped by tier. Tier 1 is factual trend; tier
 * 2 is hedged contextual heuristics ("possible factor"); tier 3 flags
 * statistical outliers for review. Tone drives the accent colour.
 */

const TIER_META: Record<InsightTier, { label: string; icon: typeof TrendingUp; blurb: string }> = {
  trend: { label: 'Trend', icon: TrendingUp, blurb: 'What your readings are doing' },
  context: { label: 'Context', icon: Lightbulb, blurb: 'Possible contributing factors - not causes' },
  outlier: { label: 'Review', icon: AlertTriangle, blurb: 'Readings worth a second look' },
};

const TONE_BORDER: Record<string, string> = {
  positive: 'border-signal-ok/40 bg-signal-ok/5',
  neutral: 'border-ink-line bg-ink-shadow',
  caution: 'border-signal-warn/40 bg-signal-warn/5',
};

const TIER_ORDER: InsightTier[] = ['trend', 'context', 'outlier'];

export function Vo2InsightsCard({ report }: { report: Vo2InsightReport }) {
  if (!report.hasInsights) {
    return (
      <div className="nn-card p-6 space-y-2">
        <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">insights</div>
        <p className="text-bone-dim text-sm leading-relaxed">
          Record at least two VO2 max readings and insights on your trend,
          possible contributing factors, and any outliers will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">insights</div>
      {TIER_ORDER.map((tier) => {
        const items = report.byTier[tier];
        if (items.length === 0) return null;
        const Meta = TIER_META[tier];
        const Icon = Meta.icon;
        return (
          <div key={tier} className="space-y-2">
            <div className="flex items-center gap-2">
              <Icon size={14} strokeWidth={1.5} className="text-bone-mute" />
              <span className="font-display tracking-wide-display uppercase text-xs text-bone">{Meta.label}</span>
              <span className="font-mono text-[10px] text-bone-mute">— {Meta.blurb}</span>
            </div>
            {items.map((insight, i) => (
              <div key={i} className={`rounded-lg border p-4 space-y-1 ${TONE_BORDER[insight.tone]}`}>
                <div className="font-display tracking-wide-display uppercase text-sm text-bone">{insight.title}</div>
                <p className="text-sm text-bone-dim leading-relaxed">{insight.body}</p>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
