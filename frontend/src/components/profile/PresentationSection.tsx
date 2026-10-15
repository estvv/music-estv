import { useEffect, useState } from 'react';
import { authApi, playersApi } from '../../utils/api';
import { GuessInput } from '../songless/GuessInput';
import { inputClass } from '../shared/Field';
import { ErrorText, panel, primaryButton } from '../shared/ui';
import type { PlayerProfile } from '../../types';

const MAX_FAVORITES = 5;

export type Favorite = { deezer_id: number; title: string; artist: string; cover_url: string | null };

// Bio and favourite songs (up to 5, in order), shown on the public profile.
// `onDraft` reports unsaved edits, for the live preview next to the form.
export function PresentationSection({ userId, onDraft }: {
  userId: number;
  onDraft?: (draft: { bio: string; favorites: Favorite[] }) => void;
}) {
  const [bio, setBio] = useState('');
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    playersApi.get(userId).then((p: PlayerProfile) => {
      setBio(p.player.bio ?? '');
      setFavorites(p.player.favorites);
      setLoaded(true);
    }).catch((e) => setError(e.message));
  }, [userId]);

  useEffect(() => {
    if (loaded) onDraft?.({ bio, favorites });
  }, [bio, favorites, loaded, onDraft]);

  const change = (next: Favorite[]) => {
    setFavorites(next);
    setSaved(false);
  };

  const move = (from: number, to: number) => {
    const next = [...favorites];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    change(next);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      await authApi.updateProfile({ bio: bio.trim() || null, favorite_deezer_ids: favorites.map((f) => f.deezer_id) });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const arrow = 'p-1 rounded text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <section className={`${panel} p-5`}>
      <h2 className="font-semibold text-neutral-900 mb-4">Présentation</h2>
      {!loaded ? <div className="h-32" /> : (
        <form onSubmit={save} className="space-y-4">
          <div>
            <label htmlFor="bio" className="block text-sm font-medium text-neutral-700 mb-1">Bio</label>
            <textarea
              id="bio"
              value={bio}
              onChange={(e) => { setBio(e.target.value); setSaved(false); }}
              maxLength={280}
              rows={3}
              placeholder="Quelques mots sur toi, tes goûts musicaux…"
              className={`${inputClass} resize-none`}
            />
            <p className="text-xs text-neutral-400 text-right tabular-nums">{bio.length}/280</p>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-sm font-medium text-neutral-700">Morceaux favoris</span>
              <span className="text-xs text-neutral-400 tabular-nums">{favorites.length}/{MAX_FAVORITES}</span>
            </div>
            {favorites.length > 0 && (
              <ol className="rounded-lg border border-neutral-200 divide-y divide-neutral-100 mb-2">
                {favorites.map((f, i) => (
                  <li key={f.deezer_id} className="flex items-center gap-3 px-3 py-2">
                    <span className="w-4 text-xs font-semibold text-neutral-400 tabular-nums">{i + 1}</span>
                    {f.cover_url
                      ? <img src={f.cover_url} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                      : <span className="w-10 h-10 rounded bg-neutral-100 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-neutral-900 truncate">{f.title}</p>
                      <p className="text-xs text-neutral-500 truncate">{f.artist}</p>
                    </div>
                    <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} className={arrow} title="Monter" aria-label="Monter">↑</button>
                    <button type="button" onClick={() => move(i, i + 1)} disabled={i === favorites.length - 1} className={arrow} title="Descendre" aria-label="Descendre">↓</button>
                    <button
                      type="button"
                      onClick={() => change(favorites.filter((_, j) => j !== i))}
                      className="text-xs font-medium text-neutral-500 hover:text-red-600 pl-1"
                    >
                      Retirer
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {favorites.length < MAX_FAVORITES ? (
              <GuessInput
                disabled={false}
                onPick={(r) => {
                  if (favorites.some((f) => f.deezer_id === r.deezer_id)) return;
                  change([...favorites, { deezer_id: r.deezer_id, title: r.title, artist: r.artist, cover_url: r.cover }]);
                }}
              />
            ) : (
              <p className="text-xs text-neutral-400">5 morceaux maximum : retires-en un pour en ajouter un autre.</p>
            )}
          </div>

          <ErrorText>{error}</ErrorText>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving} className={primaryButton}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
            {saved && <span className="text-sm text-emerald-700">Enregistré.</span>}
          </div>
        </form>
      )}
    </section>
  );
}
