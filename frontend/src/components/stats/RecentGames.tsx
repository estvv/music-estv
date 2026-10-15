import { Link } from 'react-router-dom';
import { panel } from '../shared/ui';
import type { HistoryItem } from '../../types';

export function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'hier' : `il y a ${days} j`;
}

// Finished Songless and blind tests, newest first. Rows open the game only for
// its own player (`linkable`): game pages are private.
export function RecentGames({ items, linkable, empty }: { items: HistoryItem[] | null; linkable: boolean; empty: string }) {
  if (!items) return <div className={`${panel} h-40 animate-pulse`} />;
  if (items.length === 0) {
    return <div className={`${panel} px-6 py-10 text-center text-sm text-neutral-500`}>{empty}</div>;
  }
  return (
    <ul className={`${panel} divide-y divide-neutral-100 overflow-hidden`}>
      {items.map((g) => {
        const row = (
          <>
            {g.game === 'songless' ? (
              g.cover_url
                ? <img src={g.cover_url} alt="" loading="lazy" className="w-10 h-10 shrink-0 rounded object-cover bg-neutral-100" />
                : <span className="w-10 h-10 shrink-0 rounded bg-neutral-100" />
            ) : (
              <span className="w-10 h-10 shrink-0 rounded bg-neutral-900 text-white text-[10px] font-bold flex items-center justify-center">BT</span>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">
                {g.game === 'songless' ? <>{g.title} <span className="font-normal text-neutral-500">· {g.artist}</span></> : 'Blind test'}
              </p>
              <p className="text-xs text-neutral-400 truncate">
                {g.game === 'songless' ? 'Songless' : `${g.total} morceaux`}
                {g.source_name ? ` · ${g.source_name}` : ''} · {ago(g.finished_at)}
              </p>
            </div>
            <Result item={g} />
          </>
        );
        return (
          <li key={`${g.game}-${g.id}`}>
            {linkable
              ? <Link to={`/${g.game}/${g.id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition-colors">{row}</Link>
              : <div className="flex items-center gap-3 px-4 py-2.5">{row}</div>}
          </li>
        );
      })}
    </ul>
  );
}

function Result({ item }: { item: HistoryItem }) {
  const pill = 'shrink-0 px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums';
  if (item.game === 'blindtest') return <span className={`${pill} bg-neutral-100 text-neutral-700`}>{item.score} pts</span>;
  return item.status === 'won'
    ? <span className={`${pill} bg-emerald-50 text-emerald-700`}>✓ {item.step + 1}/4</span>
    : <span className={`${pill} bg-rose-50 text-rose-700`}>✗</span>;
}
