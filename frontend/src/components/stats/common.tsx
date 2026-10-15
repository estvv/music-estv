import type { BoardGame, BoardPeriod } from '../../types';

// One colour per game, shared by charts and highlights (Tailwind 500 steps of
// the games' accents: blue, violet, rose).
export const GAME_COLOR: Record<BoardGame, string> = {
  songless: '#3b82f6',
  blindtest: '#8b5cf6',
  party: '#f43f5e',
};

export const GAME_LABEL: Record<BoardGame, string> = {
  songless: 'Songless',
  blindtest: 'Blind test',
  party: 'Soirée',
};

export { Avatar } from '../shared/Avatar';

export function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white px-4 py-3">
      <div className="text-xl font-bold text-neutral-900 tabular-nums">{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
      {sub && <div className="text-xs text-neutral-400 mt-0.5">{sub}</div>}
    </div>
  );
}
