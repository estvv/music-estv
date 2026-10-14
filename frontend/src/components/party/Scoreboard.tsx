import type { RoomPlayer } from '../../types';

export function Scoreboard({ players, highlight, large = false }: { players: RoomPlayer[]; highlight?: number; large?: boolean }) {
  return (
    <ol className="rounded-lg border border-neutral-200 bg-white divide-y divide-neutral-100">
      {players.map((p, i) => (
        <li
          key={p.id}
          className={`flex items-center gap-3 ${large ? 'px-5 py-3 text-xl' : 'px-4 py-2.5 text-sm'} ${p.id === highlight ? 'bg-neutral-50' : ''}`}
        >
          <span className={`${large ? 'w-8' : 'w-6'} font-semibold text-neutral-400 tabular-nums`}>{i + 1}</span>
          <span className={`flex-1 font-medium truncate ${p.connected ? 'text-neutral-900' : 'text-neutral-400'}`}>{p.name}</span>
          <span className="font-semibold text-neutral-900 tabular-nums">{p.score}</span>
        </li>
      ))}
    </ol>
  );
}
