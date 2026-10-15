import { useEffect, useState } from 'react';
import { sourcesApi } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { inputClass } from '../shared/Field';
import { Modal } from '../shared/Modal';
import { Segmented } from '../shared/Segmented';
import { SearchIcon } from '../shared/icons';
import { ErrorText, LoadingState } from '../shared/ui';
import { sourceKindLabel } from './labels';
import type { MissingTrack, SourceTrack, UserSource } from '../../types';

type Tab = 'playable' | 'missing';

// Open a track where the user listens: Spotify when their account is linked
// (the track itself, or a search when we never saw its Spotify id), else Deezer.
function listenUrl(t: { title: string; artist: string; spotify_id: string | null; deezer_id?: number }, spotify: boolean) {
  if (spotify || !t.deezer_id) {
    return t.spotify_id
      ? `https://open.spotify.com/track/${t.spotify_id}`
      : `https://open.spotify.com/search/${encodeURIComponent(`${t.title} ${t.artist}`)}`;
  }
  return `https://www.deezer.com/track/${t.deezer_id}`;
}

// Everything a playlist contributes to the games, in the playlist's own order,
// plus what was left out for lack of a Deezer preview.
export function SourceTracksModal({ source, onClose }: { source: UserSource; onClose: () => void }) {
  const { me } = useAuth();
  const spotify = Boolean(me?.spotify);
  const [data, setData] = useState<{ tracks: SourceTrack[]; missing: MissingTrack[] } | null>(null);
  const [tab, setTab] = useState<Tab>('playable');
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    sourcesApi.tracks(source.id).then(setData).catch((e) => setError(e.message));
  }, [source.id]);

  const matches = (t: { title: string; artist: string }, extra = '') => {
    const q = filter.trim().toLowerCase();
    return !q || `${t.title} ${t.artist} ${extra}`.toLowerCase().includes(q);
  };
  const tracks = data?.tracks.filter((t) => matches(t, t.album ?? '')) ?? [];
  const missing = data?.missing.filter((t) => matches(t)) ?? [];
  const service = spotify ? 'Spotify' : 'Deezer';

  const subtitle = [
    `${sourceKindLabel(source.kind)}${source.owner_name ? ` de ${source.owner_name}` : ''}`,
    source.source_size && source.source_size !== source.track_count
      ? `${source.track_count} jouables sur ${source.source_size}`
      : `${source.track_count} morceaux`,
  ].join(' · ');

  return (
    <Modal title={source.name} subtitle={subtitle} onClose={onClose} width="lg">
      {error ? <ErrorText>{error}</ErrorText> : !data ? <LoadingState /> : (
        <div className="space-y-3">
          <div className="sticky top-0 bg-white pb-1 z-10 space-y-3">
            {data.missing.length > 0 && (
              <Segmented<Tab>
                options={[
                  { value: 'playable', label: `Jouables (${data.tracks.length})` },
                  { value: 'missing', label: `Introuvables (${data.missing.length})` },
                ]}
                value={tab}
                onChange={setTab}
              />
            )}
            <div className="relative">
              <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Chercher un titre, un artiste…" className={`${inputClass} pl-9`} />
            </div>
          </div>

          {tab === 'missing' && (
            <p className="text-xs text-neutral-500">
              Ces morceaux n'ont pas d'extrait sur Deezer (titre absent du catalogue, ou extrait bloqué) : ils ne sortent pas dans les jeux.
            </p>
          )}

          {(tab === 'playable' ? tracks : missing).length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500">
              {filter ? 'Aucun morceau ne correspond.' : 'Aucun morceau importé.'}
            </p>
          ) : tab === 'playable' ? (
            <ul className="divide-y divide-neutral-100">
              {tracks.map((t) => (
                <li key={t.deezer_id} className="py-2 flex items-center gap-3">
                  {t.cover_url
                    ? <img src={t.cover_url} alt="" loading="lazy" className="w-10 h-10 shrink-0 rounded object-cover bg-neutral-100" />
                    : <span className="w-10 h-10 shrink-0 rounded bg-neutral-100" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 truncate">{t.title}</p>
                    <p className="text-xs text-neutral-500 truncate">{t.artist}{t.album && t.album !== t.title ? ` · ${t.album}` : ''}</p>
                  </div>
                  <ListenLink href={listenUrl(t, spotify)} label={service} />
                </li>
              ))}
            </ul>
          ) : (
            <ul className="divide-y divide-neutral-100">
              {missing.map((t, i) => (
                <li key={t.spotify_id ?? i} className="py-2 flex items-center gap-3">
                  <span className="w-10 h-10 shrink-0 rounded bg-neutral-50 border border-dashed border-neutral-200" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-500 truncate">{t.title}</p>
                    <p className="text-xs text-neutral-400 truncate">{t.artist}</p>
                  </div>
                  <ListenLink href={listenUrl(t, true)} label="Spotify" />
                </li>
              ))}
            </ul>
          )}
          {filter && <p className="text-xs text-neutral-400">{(tab === 'playable' ? tracks : missing).length} résultat(s)</p>}
        </div>
      )}
    </Modal>
  );
}

function ListenLink({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-xs text-neutral-400 hover:text-neutral-900 shrink-0">
      {label} ↗
    </a>
  );
}
