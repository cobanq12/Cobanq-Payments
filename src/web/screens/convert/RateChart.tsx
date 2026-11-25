import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { RatePoint } from '@core/api/types';
import { formatDate, formatDayShort } from '@core/lib/dates';
import { formatRate } from '@core/lib/money';
import { Skeleton } from '../../components/Primitives';

const W = 560;
const H = 180;
const PAD = { top: 12, right: 12, bottom: 22, left: 12 };

/** 30-day rate chart with a hover / arrow-key tooltip. */
export function RateChart({ points, pair, loading }: { points: RatePoint[]; pair: string; loading: boolean }) {
  const [active, setActive] = useState<number | null>(null);

  const geo = useMemo(() => {
    if (points.length < 2) return null;
    const rates = points.map((p) => p.rate);
    const min = Math.min(...rates);
    const max = Math.max(...rates);
    const span = max - min || max * 0.01;
    const x = (i: number): number => PAD.left + (i / (points.length - 1)) * (W - PAD.left - PAD.right);
    const y = (r: number): number => PAD.top + (1 - (r - min) / span) * (H - PAD.top - PAD.bottom);
    const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.rate).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points.length - 1).toFixed(1)},${H - PAD.bottom} L${x(0).toFixed(1)},${H - PAD.bottom} Z`;
    return { x, y, line, area, min, max };
  }, [points]);

  if (loading || !geo) return <Skeleton className="h-[180px] w-full" />;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  const change = ((last.rate - first.rate) / first.rate) * 100;
  const shown = active !== null ? points[active]! : last;

  const onMove = (e: PointerEvent<SVGSVGElement>): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1));
    setActive(Math.max(0, Math.min(points.length - 1, i)));
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    setActive((a) => {
      const cur = a ?? points.length - 1;
      return Math.max(0, Math.min(points.length - 1, cur + (e.key === 'ArrowRight' ? 1 : -1)));
    });
  };

  return (
    <div>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div aria-live="polite">
          <p className="text-2xl font-semibold text-ink num">{formatRate(shown.rate)}</p>
          <p className="text-xs text-muted num">{active !== null ? formatDate(shown.date) : 'Today'} · {pair}</p>
        </div>
        <p className="text-sm font-medium num text-muted">
          <span className={change >= 0 ? 'text-success' : 'text-danger'}>{change >= 0 ? '▲' : '▼'} {Math.abs(change).toFixed(2)}%</span> in 30 days
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full touch-none rounded-md"
        role="img"
        tabIndex={0}
        aria-label={`${pair} rate over the last 30 days, from ${formatRate(first.rate)} to ${formatRate(last.rate)}. Use the arrow keys to read each day.`}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
      >
        <path d={geo.area} className="fill-accent/10" />
        <path d={geo.line} fill="none" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" className="stroke-accent" />
        <text x={PAD.left} y={H - 6} className="fill-muted text-[10px]">{formatDayShort(first.date)}</text>
        <text x={W - PAD.right} y={H - 6} textAnchor="end" className="fill-muted text-[10px]">{formatDayShort(last.date)}</text>
        {active !== null && (
          <g>
            <line x1={geo.x(active)} x2={geo.x(active)} y1={PAD.top} y2={H - PAD.bottom} strokeWidth="1" strokeDasharray="3 3" className="stroke-strong" />
            <circle cx={geo.x(active)} cy={geo.y(points[active]!.rate)} r="4.5" strokeWidth="2" className="fill-surface stroke-accent" />
          </g>
        )}
      </svg>
      <p className="mt-1 text-xs text-muted">Indicative mid-market rate. Your quote shows the exact rate and fee.</p>
    </div>
  );
}
