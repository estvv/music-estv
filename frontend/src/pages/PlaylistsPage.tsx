import { useCallback, useEffect, useState } from 'react';
import { sourcesApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { AddSourceModal } from '../components/sources/AddSourceModal';
import { SourceTracksModal } from '../components/sources/SourceTracksModal';
import { sourceKindLabel } from '../components/sources/labels';
import { ConfirmModal } from '../components/shared/Modal';
import { ErrorText, LoadingState, Page, panel, primaryButton, SectionTitle } from '../components/shared/ui';
import { GlobeIcon, LockIcon, PlusIcon, RefreshIcon, TrashIcon } from '../components/shared/icons';
import { SourceTile } from '../components/sources/SourceTile';
import type { UserSource } from '../types';

export function PlaylistsPage() {
  const { me } = useAuth();
  const [sources, setSources] = useState<UserSource[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<UserSource | null>(null);
  const [removing, setRemoving] = useState<UserSource | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => sourcesApi.list().then(setSources).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const syncing = sources?.some((s) => s.sync && !s.sync.error);
  useEffect(() => {
    if (!syncing) return;
    const timer = setInterval(load, 1500);
    return () => clearInterval(timer);
  }, [syncing, load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const mine = sources?.filter((s) => s.mine) ?? [];
  const others = sources?.filter((s) => !s.mine) ?? [];

  const list = (items: UserSource[]) => (
    <ul className={`${panel} divide-y divide-neutral-100 overflow-hidden`}>
      {items.map((s) => (
        <SourceRow
          key={s.id}
          source={s}
          canManage={s.mine || Boolean(me?.is_admin)}
          onOpen={() => setViewing(s)}
          onSync={() => act(() => sourcesApi.sync(s.id))}
          onToggleVisibility={() => act(() => sourcesApi.setPublic(s.id, !s.is_public))}
          onRemove={() => setRemoving(s)}
        />
      ))}
    </ul>
  );

  return (
    <Page>
      {!sources ? <LoadingState /> : (
        <>
          <SectionTitle
            aside={
              <button
                type="button"
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />Ajouter
              </button>
            }
          >
            Mes playlists
          </SectionTitle>
          {mine.length > 0 ? list(mine) : (
            <div className={`${panel} p-8 text-center`}>
              <p className="font-medium text-neutral-900">Tu n'as encore importé aucune playlist</p>
              <p className="text-sm text-neutral-500 mt-1 mb-4">Tes playlists Spotify, tes titres likés ou une playlist Deezer.</p>
              <button onClick={() => setAdding(true)} className={primaryButton}>Ajouter une playlist</button>
            </div>
          )}

          <SectionTitle>Playlists des autres</SectionTitle>
          {others.length > 0 ? list(others) : (
            <div className={`${panel} p-8 text-center text-sm text-neutral-500`}>
              Personne d'autre n'a encore partagé de playlist publique.
            </div>
          )}
        </>
      )}
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>

      {adding && (
        <AddSourceModal
          submit={(kind, ref, isPublic) => sourcesApi.create(kind, ref, isPublic)}
          onClose={() => setAdding(false)}
          onAdded={load}
        />
      )}
      {viewing && <SourceTracksModal source={viewing} onClose={() => setViewing(null)} />}
      {removing && (
        <ConfirmModal
          title="Retirer la playlist ?"
          message={<>« {removing.name} » ne sera plus proposée pour les parties. Tu pourras la réimporter plus tard.</>}
          confirmLabel="Retirer"
          danger
          onConfirm={() => act(() => sourcesApi.remove(removing.id))}
          onClose={() => setRemoving(null)}
        />
      )}
    </Page>
  );
}

function SourceRow({ source: s, canManage, onOpen, onSync, onToggleVisibility, onRemove }: {
  source: UserSource;
  canManage: boolean;
  onOpen: () => void;
  onSync: () => void;
  onToggleVisibility: () => void;
  onRemove: () => void;
}) {
  const importing = Boolean(s.sync && !s.sync.error);
  const percent = s.sync && s.sync.total ? Math.round((s.sync.done / s.sync.total) * 100) : 0;
  const iconButton = 'p-2 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors disabled:opacity-40';

  return (
    <li className="relative flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors">
      <button type="button" onClick={onOpen} className="flex-1 min-w-0 flex items-center gap-3 text-left" title="Voir les morceaux">
        <SourceTile kind={s.kind} image={s.image_url} />
        <div className="flex-1 min-w-0">
          <span className="block font-medium text-neutral-900 truncate">{s.name}</span>
          <div className="text-xs text-neutral-500 mt-0.5">
            {sourceKindLabel(s.kind)}{!s.mine && s.owner_name ? ` de ${s.owner_name}` : ''}
            {importing
              ? <> · import {s.sync!.done}/{s.sync!.total || '…'}</>
              : <> · <span className="tabular-nums">{s.track_count}</span> morceaux</>}
            {s.sync?.error && <span className="text-red-600"> · import raté : {s.sync.error}</span>}
          </div>
        </div>
      </button>
      {s.mine && (
        <button
          type="button"
          onClick={onToggleVisibility}
          title={s.is_public ? 'Visible par tous. Cliquer pour la rendre privée.' : 'Visible par toi seul. Cliquer pour la rendre publique.'}
          className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors ${
            s.is_public
              ? 'border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              : 'border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100'
          }`}
        >
          {s.is_public ? <GlobeIcon className="w-3.5 h-3.5" /> : <LockIcon className="w-3.5 h-3.5" />}
          {s.is_public ? 'Publique' : 'Privée'}
        </button>
      )}
      {canManage && (
        <div className="flex items-center shrink-0">
          <button type="button" onClick={onSync} disabled={importing} className={iconButton} title="Mettre à jour depuis la source">
            <RefreshIcon className={`w-4 h-4 ${importing ? 'animate-spin' : ''}`} />
          </button>
          <button type="button" onClick={onRemove} className={`${iconButton} hover:text-red-600 hover:bg-red-50`} title="Retirer">
            <TrashIcon className="w-4 h-4" />
          </button>
        </div>
      )}
      {importing && (
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-violet-100">
          <div className="h-full bg-violet-500 transition-[width] duration-500" style={{ width: `${percent}%` }} />
        </div>
      )}
    </li>
  );
}
