'use client';

/**
 * 12-week Norwegian Singles discipline trend chart.
 * Shows discipline score, easy-day compliance, and quality volume % per week.
 */

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from 'recharts';
import type { NsWeeklyDataPoint } from '@/lib/analysis/ns-guardrails-read';
import { TrendingUp } from 'lucide-react';

interface Props {
  data: NsWeeklyDataPoint[];
}

const QUALITY_TARGET = 22;
const QUALITY_BAND_LOW = 20;
const QUALITY_BAND_HIGH = 25;

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number | null; color: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-ink-shadow border border-ink-line rounded-lg p-3 space-y-1 text-[11px] font-mono">
      <div className="text-bone-mute uppercase tracking-widest mb-2">{label}</div>
      {payload.map((p) => (
        p.value != null ? (
          <div key={p.name} className="flex items-center justify-between gap-4">
            <span style={{ color: p.color }}>{p.name}</span>
            <span className="text-bone tabular-nums">{p.value}%</span>
          </div>
        ) : null
      ))}
    </div>
  );
}

export function NsDisciplineTrendCard({ data }: Props) {
  const hasData = data.some((d) => d.hasSessions);

  // For the quality % chart, values are on 0-40 scale (% of volume)
  // For discipline score and compliance %, values are on 0-100 scale
  // We normalise quality% to 0-100 for a single axis by multiplying by 2.5
  // But that's confusing. Better to use two Y-axes, or just show the three lines
  // on the same 0-100 scale by treating quality% as-is (it's naturally 0-40 range).
  // We'll annotate the band with a reference area at y=20-25 and let the user
  // understand the scale difference via the tooltip.

  // Chart data: transform for Recharts
  const chartData = data.map((d) => ({
    weekLabel: d.weekLabel,
    score: d.hasSessions ? d.disciplineScore : null,
    easy: d.easyCompliancePct,
    reps: d.repCompliancePct,
    quality: d.qualityPct,
  }));

  return (
    <div className="nn-card p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={18} strokeWidth={1.5} className="text-accent" />
          <div>
            <div className="font-display tracking-wide-display uppercase text-xs text-bone-mute">norwegian singles</div>
            <div className="font-display tracking-wide-display uppercase text-lg text-bone">12-week trend</div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono uppercase tracking-widest">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-accent inline-block" />
            <span className="text-bone-mute">Score</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-signal-ok inline-block" />
            <span className="text-bone-mute">Easy</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-signal-warn inline-block" />
            <span className="text-bone-mute">Reps</span>
          </span>
        </div>
      </div>

      {!hasData ? (
        <div className="h-40 flex items-center justify-center">
          <p className="font-mono text-xs text-bone-mute">No run data yet — sync activities to see the trend.</p>
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="weekLabel"
                tick={{ fontSize: 9, fontFamily: 'monospace', fill: 'rgba(215,204,189,0.5)' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 9, fontFamily: 'monospace', fill: 'rgba(215,204,189,0.5)' }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${v}`}
              />
              {/* Quality band reference at 20-25% (on this 0-100 axis, the values are naturally small) */}
              <ReferenceArea y1={QUALITY_BAND_LOW} y2={QUALITY_BAND_HIGH} fill="rgba(99,102,241,0.08)" />
              <ReferenceLine y={QUALITY_TARGET} stroke="rgba(99,102,241,0.3)" strokeDasharray="4 4" />
              <Tooltip content={<CustomTooltip />} />
              <Line
                type="monotone"
                dataKey="score"
                name="Score"
                stroke="var(--color-accent, #6366f1)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
              />
              <Line
                type="monotone"
                dataKey="easy"
                name="Easy compliance"
                stroke="var(--color-signal-ok, #22c55e)"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
                strokeDasharray="4 2"
              />
              <Line
                type="monotone"
                dataKey="reps"
                name="Rep control"
                stroke="var(--color-signal-warn, #f59e0b)"
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
          <p className="font-mono text-[10px] text-bone-mute leading-relaxed">
            Score 0-100 (higher = more on method). Easy &amp; rep lines = % sessions that stayed in zone.
            Shaded band = quality volume target 20-25% of weekly minutes.
          </p>
        </>
      )}
    </div>
  );
}
