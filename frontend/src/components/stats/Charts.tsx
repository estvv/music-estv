import { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardPeriod, DayPoints } from '../../types';

// Single-series charts in the game's colour: one hue, no legend (the title
// names the series), text in neutral inks, a tooltip on every mark.

const TOOLTIP = 'pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md bg-neutral-900 px-2 py-1 text-xs text-white shadow-lg whitespace-nowrap';

// --- attempts distribution (Songless) ----------------------------------------------

// Wordle-style: one bar per attempt count (1 to 7), then the misses. Bars grow
// from the left baseline with a rounded end; the count sits after the bar.
export function DistributionBars({ distribution, lost, color, highlight }: {
  distribution: number[];
  lost: number;
  color: string;
  highlight?: number | null;
}) {
  const rows = [
    ...distribution.map((n, i) => ({ label: String(i + 1), n, tip: `Trouvé en ${i + 1} essai${i ? 's' : ''}`, miss: false })),
    { label: '✗', n: lost, tip: 'Pas trouvé', miss: true },
  ];
  const max = Math.max(1, ...rows.map((r) => r.n));
  const [hover, setHover] = useState<number | null>(null);

  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div
          key={r.label}
          className="relative flex items-center gap-2 py-0.5"
          onPointerEnter={() => setHover(i)}
          onPointerLeave={() => setHover(null)}
          tabIndex={0}
          onFocus={() => setHover(i)}
          onBlur={() => setHover(null)}
          aria-label={`${r.tip} : ${r.n} partie${r.n > 1 ? 's' : ''}`}
        >
          <span className="w-4 text-xs text-neutral-500 text-right tabular-nums">{r.label}</span>
          <div className="flex-1 flex items-center gap-2 min-w-0">
            <div
              className={`h-4 rounded-r-[4px] transition-opacity ${hover !== null && hover !== i ? 'opacity-60' : ''}`}
              style={{
                width: r.n ? `${Math.max(3, (r.n / max) * 100)}%` : '2px',
                background: r.miss ? '#d4d4d4' : color,
                outline: highlight === i ? `2px solid ${color}` : undefined,
                outlineOffset: 2,
              }}
            />
            <span className="text-xs text-neutral-700 tabular-nums">{r.n}</span>
          </div>
          {hover === i && (
            <span className={TOOLTIP} style={{ left: '50%', top: 0 }}>
              <strong className="font-semibold">{r.n}</strong> <span className="text-neutral-300">{r.tip.toLowerCase()}</span>
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// --- cumulative points over time --------------------------------------------------

const DAY = 86_400_000;

function toDay(d: Date) {
  return d.toISOString().slice(0, 10);
}

// Every day of the period, with the day's points and the running total. "all"
// starts at the first day played.
function fillDays(data: DayPoints[], period: BoardPeriod) {
  const byDay = new Map(data.map((d) => [String(d.day).slice(0, 10), d.points]));
  const today = new Date();
  const length = period === 'week' ? 7 : period === 'month' ? 30 : null;
  const first = length
    ? new Date(today.getTime() - (length - 1) * DAY)
    : data.length ? new Date(`${String(data[0].day).slice(0, 10)}T12:00:00Z`) : today;
  const out: { day: string; points: number; total: number }[] = [];
  let total = 0;
  for (let t = first.getTime(); toDay(new Date(t)) <= toDay(today); t += DAY) {
    const day = toDay(new Date(t));
    const points = byDay.get(day) ?? 0;
    total += points;
    out.push({ day, points, total });
  }
  return out;
}

const formatDay = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

// Running total as a 2px line over a light area, recessive grid, and a
// crosshair that snaps to the nearest day.
export function ProgressChart({ data, period, color, height = 140 }: {
  data: DayPoints[];
  period: BoardPeriod;
  color: string;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const days = useMemo(() => fillDays(data, period), [data, period]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pad = { left: 36, right: 8, top: 10, bottom: 22 };
  const innerW = Math.max(0, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const max = Math.max(1, ...days.map((d) => d.total));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const x = (i: number) => pad.left + (days.length > 1 ? (i / (days.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => pad.top + innerH - (v / top) * innerH;

  const line = days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.total).toFixed(1)}`).join('');
  const area = days.length ? `${line}L${x(days.length - 1).toFixed(1)},${y(0)}L${x(0).toFixed(1)},${y(0)}Z` : '';
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(days.length / 6));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left - pad.left;
    const i = days.length > 1 ? Math.round((px / innerW) * (days.length - 1)) : 0;
    setHover(Math.min(days.length - 1, Math.max(0, i)));
  };

  const h = hover !== null ? days[hover] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img"
          aria-label={`Total de points : ${days.at(-1)?.total ?? 0} en fin de période`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} stroke="#f0f0f0" strokeWidth={1} />
              <text x={pad.left - 6} y={y(t)} dy="0.32em" textAnchor="end" className="fill-neutral-400 text-[10px] tabular-nums">{t}</text>
            </g>
          ))}
          {days.map((d, i) => (i % labelEvery === 0 || i === days.length - 1) && (
            <text key={d.day} x={x(i)} y={height - 6} textAnchor="middle" className="fill-neutral-400 text-[10px]">{formatDay(d.day)}</text>
          ))}
          <path d={area} fill={color} opacity={0.1} />
          <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {/* A single day draws no line: show its point. */}
          {days.length === 1 && <circle cx={x(0)} cy={y(days[0].total)} r={4} fill={color} />}
          {h && (
            <>
              <line x1={x(hover!)} x2={x(hover!)} y1={pad.top} y2={pad.top + innerH} stroke="#a3a3a3" strokeWidth={1} />
              <circle cx={x(hover!)} cy={y(h.total)} r={4} fill={color} stroke="white" strokeWidth={2} />
            </>
          )}
        </svg>
      )}
      {h && (
        <span className={TOOLTIP} style={{ left: x(hover!), top: y(h.total) - 8 }}>
          <strong className="font-semibold tabular-nums">{h.total} pts</strong>
          <span className="text-neutral-300"> · {formatDay(h.day)}{h.points ? ` (+${h.points})` : ''}</span>
        </span>
      )}
    </div>
  );
}

function niceStep(max: number) {
  const raw = max / 3;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / magnitude;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * magnitude;
}
