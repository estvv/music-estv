import { useEffect, useState } from 'react';
import { spotifyApi } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { Field, inputClass } from '../shared/Field';
import { Modal } from '../shared/Modal';
import { Segmented } from '../shared/Segmented';
import { ErrorText, LoadingState, primaryButton, secondaryButton } from '../shared/ui';
import type { SourceKind, SpotifyPlaylist } from '../../types';

type Tab = 'deezer' | 'spotify';

interface Props {
  onClose: () => void;
  onAdded: () => void;
  submit: (kind: SourceKind, ref: string, inDailyPool: boolean) => Promise<unknown>;
  // Only admins choose whether a playlist feeds the shared daily.
  showDailyPool?: boolean;
}

export function AddSourceModal({ onClose, onAdded, submit, showDailyPool = false }: Props) {
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>('deezer');
  const [ref, setRef] = useState('');
  const [inPool, setInPool] = useState(true);
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (tab === 'spotify' && me?.spotify && !playlists) {
      spotifyApi.playlists().then(setPlaylists).catch((e) => setError(e.message));
    }
  }, [tab, me, playlists]);

  const kind: SourceKind = tab === 'deezer' ? 'deezer_playlist' : ref === 'liked' ? 'spotify_liked' : 'spotify_playlist';

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await submit(kind, ref === 'liked' ? '' : ref, showDailyPool && inPool);
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setSaving(false);
    }
  };

  return (
    <Modal title="Ajouter une playlist" onClose={onClose} width="md">
      <form onSubmit={onSubmit} className="space-y-4">
        <Segmented<Tab>
          options={[{ value: 'deezer', label: 'Deezer' }, { value: 'spotify', label: 'Spotify' }]}
          value={tab}
          onChange={(t) => { setTab(t); setRef(''); }}
        />

        {tab === 'deezer' ? (
          <Field label="Lien de la playlist" hint="N'importe quelle playlist publique, y compris les playlists éditoriales Deezer.">
            <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="https://www.deezer.com/fr/playlist/…" className={inputClass} autoFocus />
          </Field>
        ) : !me?.spotify ? (
          <p className="text-sm text-neutral-600">Lie d'abord ton compte Spotify depuis ton profil.</p>
        ) : !playlists ? <LoadingState /> : (
          <Field label="Playlist" hint="Spotify ne laisse lire que tes titres likés et les playlists que tu as créées ou dont tu es collaborateur.">
            <select value={ref} onChange={(e) => setRef(e.target.value)} className={inputClass}>
              <option value="">Choisir…</option>
              <option value="liked">Mes titres likés</option>
              {playlists.filter((p) => p.owned).map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.total != null ? ` (${p.total})` : ''}</option>
              ))}
            </select>
          </Field>
        )}

        {showDailyPool && (
          <label className="flex items-center gap-2 text-sm text-neutral-700">
            <input type="checkbox" checked={inPool} onChange={(e) => setInPool(e.target.checked)} />
            Utiliser pour le daily commun
          </label>
        )}
        <p className="text-xs text-neutral-400">
          Les morceaux sans extrait Deezer sont ignorés. Une grosse playlist Spotify peut prendre une minute à importer.
        </p>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Annuler</button>
          <button type="submit" disabled={saving || !ref} className={primaryButton}>{saving ? 'Ajout…' : 'Ajouter'}</button>
        </div>
      </form>
    </Modal>
  );
}
