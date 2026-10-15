import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { inputClass } from '../shared/Field';
import { SearchIcon } from '../shared/icons';
import { SourceOption } from './SourcePicker';
import type { UserSource } from '../../types';

type Tab = 'mine' | 'public';

// Picks one playlist among any number: the player's own or the public ones of
// others, with a search, in a fixed-height scrolling list. The current pick
// stays visible even when the tab or the search hides it.
export function PlaylistBrowser({ sources, value, onPick, listClass = 'h-72' }: {
  sources: UserSource[];
  value: number | '';
  onPick: (id: number) => void;
  listClass?: string;
}) {
  const mine = useMemo(() => sources.filter((s) => s.mine), [sources]);
  const others = useMemo(() => sources.filter((s) => !s.mine), [sources]);
  const [tab, setTab] = useState<Tab>(() => {
    const picked = sources.find((s) => s.id === value);
    return picked ? (picked.mine ? 'mine' : 'public') : mine.length ? 'mine' : 'public';
  });
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const list = (tab === 'mine' ? mine : others).filter((s) => !q || `${s.name} ${s.owner_name ?? ''}`.toLowerCase().includes(q));
  const selected = sources.find((s) => s.id === value);
  const selectedHidden = selected && !list.some((s) => s.id === selected.id);

  const tabButton = (t: Tab, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      aria-pressed={tab === t}
      className={`flex-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        tab === t ? 'bg-white text-neutral-900 shadow-sm' : 'text-neutral-500 hover:text-neutral-900'
      }`}
    >
      {label} <span className="tabular-nums text-neutral-400">{count}</span>
    </button>
  );

  return (
    <div className="flex flex-col">
      <div className="p-3 space-y-2 border-b border-neutral-100">
        <div className="flex gap-1 p-1 rounded-lg bg-neutral-100">
          {tabButton('mine', 'Mes playlists', mine.length)}
          {tabButton('public', 'Publiques', others.length)}
        </div>
        <div className="relative">
          <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={tab === 'mine' ? 'Chercher dans mes playlists…' : 'Chercher une playlist ou un joueur…'}
            className={`${inputClass} pl-9 py-1.5 text-sm`}
          />
        </div>
      </div>

      {selectedHidden && (
        <div className="px-2 pt-2">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Sélectionnée</p>
          <SourceOption source={selected} active onPick={() => onPick(selected.id)} />
        </div>
      )}

      <ul className={`${listClass} overflow-y-auto overscroll-contain p-2`}>
        {list.map((s) => (
          <li key={s.id}><SourceOption source={s} active={s.id === value} onPick={() => onPick(s.id)} /></li>
        ))}
        {list.length === 0 && (
          <li className="h-full flex flex-col items-center justify-center text-center text-sm text-neutral-500 px-6 gap-1">
            {q ? 'Aucune playlist ne correspond.'
              : tab === 'mine' ? <>Tu n'as importé aucune playlist. <Link to="/playlists" className="font-medium text-neutral-900 underline">En importer</Link></>
              : "Personne n'a encore partagé de playlist publique."}
          </li>
        )}
      </ul>
    </div>
  );
}
