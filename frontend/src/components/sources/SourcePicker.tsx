import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { sourcesApi } from '../../utils/api';
import { Modal } from '../shared/Modal';
import { CheckIcon, ChevronDownIcon, ListIcon, LockIcon, SearchIcon } from '../shared/icons';
import { inputClass } from '../shared/Field';
import { IconTile } from '../shared/ui';
import { SourceTile } from './SourceTile';
import { sourceKindLabel } from './labels';
import type { UserSource } from '../../types';

const LAST_KEY = 'music.lastSource';

// Playlists that can be played right now (imported, not mid-sync), plus the
// last one picked in this browser so a new game starts on it.
export function usePlayableSources() {
  const [sources, setSources] = useState<UserSource[] | null>(null);
  const [last, setLast] = useState<number | ''>('');

  useEffect(() => {
    sourcesApi.list().then((all) => {
      const list = all.filter((s) => s.track_count > 0 && !s.sync);
      setSources(list);
      try {
        const stored = Number(localStorage.getItem(LAST_KEY));
        if (stored && list.some((s) => s.id === stored)) setLast(stored);
      } catch {
        // Storage blocked: start without a pick.
      }
    }).catch(() => setSources([]));
  }, []);

  const remember = useCallback((id: number) => {
    setLast(id);
    try {
      localStorage.setItem(LAST_KEY, String(id));
    } catch {
      // Not remembered, that is all.
    }
  }, []);

  return { sources, last, remember };
}

// Selectable list of playlists, grouped into mine and the others', with a
// filter once the list gets long.
export const GROUP_LABEL = 'text-xs font-semibold uppercase tracking-wide text-neutral-400';

// Title of the first group shown, for callers that put it in their own header.
export const firstGroupTitle = (sources: UserSource[]) => (sources.some((s) => s.mine) ? 'Mes playlists' : 'Playlists des autres');

// One selectable playlist line: cover, name (lock when private), origin, size.
export function SourceOption({ source: s, active, onPick }: { source: UserSource; active: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={active}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${active ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}
    >
      <SourceTile kind={s.kind} image={s.image_url} />
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-1.5 font-medium text-neutral-900 min-w-0">
          <span className="truncate">{s.name}</span>
          {!s.is_public && <LockIcon className="w-3.5 h-3.5 shrink-0 text-neutral-400" />}
        </span>
        <span className="block text-xs text-neutral-500 truncate">
          {sourceKindLabel(s.kind)}{!s.mine && s.owner_name ? ` de ${s.owner_name}` : ''} · {s.track_count} morceaux
        </span>
      </span>
      {active && <CheckIcon className="w-5 h-5 text-neutral-900 shrink-0" />}
    </button>
  );
}

export function SourceList({ sources, value, onPick, hideFirstTitle = false }: {
  sources: UserSource[];
  value: number | '';
  onPick: (id: number) => void;
  hideFirstTitle?: boolean;
}) {
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return q ? sources.filter((s) => s.name.toLowerCase().includes(q)) : sources;
  }, [sources, filter]);
  const mine = visible.filter((s) => s.mine);
  const others = visible.filter((s) => !s.mine);

  const group = (title: string, items: UserSource[], showTitle = true) => items.length > 0 && (
    <div>
      {showTitle && <p className={`px-3 pt-3 pb-1 ${GROUP_LABEL}`}>{title}</p>}
      <ul>
        {items.map((s) => {
          const active = s.id === value;
          return (
            <li key={s.id}><SourceOption source={s} active={active} onPick={() => onPick(s.id)} /></li>
          );
        })}
      </ul>
    </div>
  );

  if (sources.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-neutral-500">
        Aucune playlist importée pour l'instant.{' '}
        <Link to="/playlists" className="font-medium text-neutral-900 underline">Importer une playlist</Link>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {sources.length > 5 && (
        <div className="relative px-3 pb-1">
          <SearchIcon className="w-4 h-4 absolute left-6 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Chercher une playlist…" className={`${inputClass} pl-9`} />
        </div>
      )}
      {group('Mes playlists', mine, !(hideFirstTitle && mine.length > 0))}
      {group('Playlists des autres', others, !(hideFirstTitle && mine.length === 0))}
      {filter && visible.length === 0 && <p className="px-3 py-6 text-center text-sm text-neutral-500">Aucune playlist ne correspond.</p>}
    </div>
  );
}

// Compact button + chooser modal, for forms that need a playlist field.
export function SourcePicker({ value, onChange }: { value: number | ''; onChange: (id: number | '') => void }) {
  const { sources, last, remember } = usePlayableSources();
  const [open, setOpen] = useState(false);

  // Start on the playlist played last, but never override a choice already made.
  useEffect(() => {
    if (last && value === '') onChange(last);
  }, [last, value, onChange]);

  const selected = sources?.find((s) => s.id === value);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 max-w-64 pl-1.5 pr-2.5 py-1 rounded-lg border bg-white text-sm transition-colors ${
          selected ? 'border-neutral-200 hover:bg-neutral-50 hover:border-neutral-300' : 'border-neutral-900 ring-2 ring-neutral-900/10 hover:bg-neutral-50'
        }`}
      >
        <span className="scale-75 -m-1.5">
          {selected ? <SourceTile kind={selected.kind} image={selected.image_url} /> : <IconTile icon={<ListIcon />} accent="neutral" />}
        </span>
        <span className="truncate font-medium text-neutral-800">{selected?.name ?? 'Choisir une playlist'}</span>
        <ChevronDownIcon className="w-4 h-4 shrink-0 text-neutral-400" />
      </button>
      {open && (
        <Modal title="Choisir une playlist" onClose={() => setOpen(false)} width="md">
          <div className="-mx-3">
            <SourceList
              sources={sources ?? []}
              value={value}
              onPick={(id) => { remember(id); onChange(id); setOpen(false); }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
