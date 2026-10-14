interface Props {
  stepsMs: number[];
  unlockedMs: number;
  positionMs: number;
  finished: boolean;
  barClass?: string;
}

// Song timeline on a square-root scale: on a linear 16 s bar the first steps
// (0.1 s, 0.5 s) would be invisible slivers.
export function Timeline({ stepsMs, unlockedMs, positionMs, finished, barClass = 'bg-emerald-500' }: Props) {
  const totalMs = finished ? 30000 : stepsMs[stepsMs.length - 1];
  const scale = (ms: number) => `${(Math.sqrt(Math.min(ms, totalMs) / totalMs) * 100).toFixed(2)}%`;

  return (
    <div>
      <div className="relative h-3 rounded-full bg-neutral-100 overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-neutral-300" style={{ width: scale(unlockedMs) }} />
        <div className={`absolute inset-y-0 left-0 ${barClass}`} style={{ width: scale(positionMs) }} />
        {!finished && stepsMs.slice(0, -1).map((ms) => (
          <div key={ms} className="absolute inset-y-0 w-px bg-white" style={{ left: scale(ms) }} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-neutral-400 mt-1.5 tabular-nums">
        <span>{(positionMs / 1000).toFixed(1)} s</span>
        <span>{finished ? '30 s' : `${unlockedMs / 1000} s débloquées`}</span>
      </div>
    </div>
  );
}
