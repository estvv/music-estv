interface Props {
  stepsMs: number[];
  unlockedMs: number;
  positionMs: number;
  finished: boolean;
  barClass?: string;
}

const seconds = (ms: number) => `${(ms / 1000).toLocaleString('fr-FR')} s`;

// One equal-width slot per attempt, labelled with its length, instead of a
// time scale where the first clips would be slivers. Unlocked slots are
// tinted; playback fills them one after the other. Once the game is over, a
// plain bar over the whole 30 s preview.
export function Timeline({ stepsMs, unlockedMs, positionMs, finished, barClass = 'bg-emerald-500' }: Props) {
  if (finished) {
    const pct = Math.min(100, (positionMs / 30000) * 100);
    return (
      <div>
        <div className="relative h-3 rounded-full bg-neutral-100 overflow-hidden">
          <div className={`absolute inset-y-0 left-0 ${barClass}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-neutral-400 mt-1.5 tabular-nums">
          <span>{(positionMs / 1000).toFixed(1)} s</span>
          <span>30 s</span>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1.5">
        {stepsMs.map((end, i) => {
          const start = i === 0 ? 0 : stepsMs[i - 1];
          const unlocked = end <= unlockedMs;
          const current = unlocked && (i === stepsMs.length - 1 || stepsMs[i + 1] > unlockedMs);
          const fill = Math.max(0, Math.min(1, (positionMs - start) / (end - start)));
          return (
            <div
              key={end}
              className={`relative flex-1 h-3.5 rounded-full bg-neutral-100 overflow-hidden ${current ? 'ring-2 ring-offset-1 ring-neutral-300' : ''}`}
            >
              {unlocked && <div className={`absolute inset-0 ${barClass} opacity-25`} />}
              <div className={`absolute inset-y-0 left-0 ${barClass}`} style={{ width: `${fill * 100}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {stepsMs.map((end) => (
          <span
            key={end}
            className={`flex-1 text-center text-xs tabular-nums ${end <= unlockedMs ? 'text-neutral-600 font-medium' : 'text-neutral-300'}`}
          >
            {seconds(end)}
          </span>
        ))}
      </div>
    </div>
  );
}
