import { useCallback, useEffect, useState } from 'react';
import { sourcesApi } from '../utils/api';
import { AddSourceModal } from '../components/sources/AddSourceModal';
import { sourceKindLabel } from '../components/sources/labels';
import { Badge, ErrorText, ghostButton, LoadingState, Page, PageHeader, panel, primaryButton } from '../components/shared/ui';
import { ListIcon } from '../components/shared/icons';
import { SourceTile } from '../components/sources/SourceTile';
import type { UserSource } from '../types';

export function PlaylistsPage() {
  const [sources, setSources] = useState<UserSource[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => sourcesApi.list().then(setSources).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const syncing = sources?.some((s) => s.sync && !s.sync.error);
  useEffect(() => {
    if (!syncing) return;
    const timer = setInterval(load, 2000);
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

  return (
    <Page>
      <PageHeader
        title="Playlists"
        subtitle="Partagées avec tout le monde : chacun peut lancer un Songless libre ou un blind test dessus."
        icon={<ListIcon />}
        accent="violet"
        actions={<button onClick={() => setAdding(true)} className={primaryButton}>Ajouter</button>}
      />

      {!sources ? <LoadingState /> : sources.length === 0 ? (
        <div className={`${panel} p-10 text-center`}>
          <p className="text-neutral-500 mb-4">Aucune playlist pour l'instant. Ajoute une playlist Deezer, une de tes playlists Spotify ou tes titres likés.</p>
          <button onClick={() => setAdding(true)} className={primaryButton}>Ajouter une playlist</button>
        </div>
      ) : (
        <ul className={`${panel} divide-y divide-neutral-100`}>
          {sources.map((s) => (
            <li key={s.id} className="px-4 py-3 flex items-center gap-3">
              <SourceTile kind={s.kind} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium text-neutral-900 truncate">{s.name}</span>
                  {s.in_daily_pool && <Badge accent="emerald">Daily</Badge>}
                  {s.mine && <Badge>À moi</Badge>}
                </div>
                <div className="text-xs text-neutral-500 mt-0.5">
                  {sourceKindLabel(s.kind)}{s.owner_name ? ` de ${s.owner_name}` : ''}, <span className="tabular-nums">{s.track_count}</span> morceaux
                  {s.sync && !s.sync.error && <span className="text-violet-600">, import {s.sync.done}/{s.sync.total || '…'}</span>}
                  {s.sync?.error && <span className="text-red-600">, échec : {s.sync.error}</span>}
                </div>
              </div>
              {s.mine && (
                <>
                  <button onClick={() => act(() => sourcesApi.sync(s.id))} className={ghostButton}>Mettre à jour</button>
                  <button
                    onClick={() => window.confirm(`Retirer « ${s.name} » ?`) && act(() => sourcesApi.remove(s.id))}
                    className={`${ghostButton} text-red-600 hover:text-red-700`}
                  >
                    Retirer
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>

      {adding && (
        <AddSourceModal
          submit={(kind, ref) => sourcesApi.create(kind, ref)}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); load(); }}
        />
      )}
    </Page>
  );
}
