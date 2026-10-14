import { useCallback, useEffect, useState } from 'react';
import { sourcesApi, spotifyApi } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import type { SpotifyPlaylist, UserSource } from '../../types';

export interface SourceSelection {
  id: number | '';
  // False while the chosen playlist is still importing (or failed to).
  ready: boolean;
}

// Playlist chooser for the free games. Besides the playlists already added, it
// lists the user's own Spotify playlists and likes: picking one of those adds
// it as a source on the spot and waits for its import.
export function SourcePicker({ onChange }: { onChange: (selection: SourceSelection) => void }) {
  const { me } = useAuth();
  const [sources, setSources] = useState<UserSource[]>([]);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[]>([]);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(() => sourcesApi.list().then(setSources).catch(() => undefined), []);

  useEffect(() => {
    load();
  }, [load]);

  // Dev-mode Spotify apps can only read playlists the user owns.
  useEffect(() => {
    if (!me?.spotify) return;
    spotifyApi.playlists().then((list) => setPlaylists(list.filter((p) => p.owned))).catch(() => undefined);
  }, [me?.spotify]);

  const selected = value.startsWith('s:') ? sources.find((s) => s.id === Number(value.slice(2))) : undefined;
  const importing = Boolean(selected?.sync && !selected.sync.error);
  const ready = value === '' || Boolean(selected && !selected.sync && selected.track_count > 0);

  useEffect(() => {
    if (!importing) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [importing, load]);

  useEffect(() => {
    onChange({ id: selected?.id ?? '', ready });
  }, [selected?.id, ready, onChange]);

  const choose = async (next: string) => {
    setValue(next);
    setError('');
    if (!next.startsWith('sp:') && next !== 'liked') return;
    try {
      const source = next === 'liked'
        ? await sourcesApi.create('spotify_liked', '', true)
        : await sourcesApi.create('spotify_playlist', next.slice(3), true);
      await load();
      setValue(`s:${source.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import impossible');
      setValue('');
    }
  };

  const mine = sources.filter((s) => s.mine && (s.track_count > 0 || s.sync));
  const others = sources.filter((s) => !s.mine && s.track_count > 0);
  const known = new Set(sources.map((s) => s.spotify_id));
  const hasLiked = sources.some((s) => s.mine && s.kind === 'spotify_liked');
  const fromSpotify = playlists.filter((p) => !known.has(p.id));

  const label = (s: UserSource) => (s.sync && !s.sync.error ? `${s.name} (import…)` : `${s.name} (${s.track_count})`);

  let status = '';
  if (value.startsWith('sp:') || value === 'liked') status = 'Ajout…';
  else if (importing) status = `Import ${selected!.sync!.done}/${selected!.sync!.total || '…'}`;
  else if (selected?.sync?.error) status = 'Import raté';
  else if (selected && selected.track_count === 0) status = 'Aucun titre trouvé';

  return (
    <div className="flex items-center gap-2 min-w-0">
      {(status || error) && (
        <span className={`text-xs whitespace-nowrap ${error || selected?.sync?.error ? 'text-red-600' : 'text-violet-600'}`} title={error}>
          {error ? 'Erreur' : status}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => choose(e.target.value)}
        className="max-w-56 truncate pl-3 pr-8 py-1.5 border border-neutral-200 rounded-lg text-sm bg-white focus:outline-none focus:border-neutral-500"
        aria-label="Playlist"
      >
        <option value="">Playlists du daily</option>
        {mine.length > 0 && (
          <optgroup label="Mes playlists">
            {mine.map((s) => <option key={s.id} value={`s:${s.id}`}>{label(s)}</option>)}
          </optgroup>
        )}
        {me?.spotify && (!hasLiked || fromSpotify.length > 0) && (
          <optgroup label="Mon compte Spotify">
            {!hasLiked && <option value="liked">Mes titres likés</option>}
            {fromSpotify.map((p) => (
              <option key={p.id} value={`sp:${p.id}`}>{p.name}{p.total != null ? ` (${p.total})` : ''}</option>
            ))}
          </optgroup>
        )}
        {others.length > 0 && (
          <optgroup label="Playlists des autres">
            {others.map((s) => <option key={s.id} value={`s:${s.id}`}>{label(s)}{s.owner_name ? ` · ${s.owner_name}` : ''}</option>)}
          </optgroup>
        )}
      </select>
    </div>
  );
}
