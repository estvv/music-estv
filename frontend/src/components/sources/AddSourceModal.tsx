import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { deezerApi, sourcesApi, spotifyApi } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { inputClass } from '../shared/Field';
import { Modal } from '../shared/Modal';
import { Segmented } from '../shared/Segmented';
import { CheckIcon, GlobeIcon, HeartIcon, LockIcon, MusicIcon, PlusIcon, SearchIcon } from '../shared/icons';
import { ErrorText, LoadingState, primaryButton, secondaryButton } from '../shared/ui';
import type { DeezerPlaylist, SourceKind, SpotifyPlaylist } from '../../types';
import { PROFILE_SETTINGS_PATH } from '../../utils/paths';

type Tab = 'spotify' | 'deezer';
type RowState = 'idle' | 'adding' | 'added' | 'present';

interface Props {
  onClose: () => void;
  // Called after each addition: the modal stays open to add several at once.
  onAdded: () => void;
  submit: (kind: SourceKind, ref: string, isPublic: boolean) => Promise<unknown>;
}

export function AddSourceModal({ onClose, onAdded, submit }: Props) {
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>(me?.spotify ? 'spotify' : 'deezer');
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState('');

  const add = async (kind: SourceKind, ref: string) => {
    setError('');
    try {
      await submit(kind, ref, isPublic);
      onAdded();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      return false;
    }
  };

  return (
    <Modal
      title="Ajouter une playlist"
      subtitle="Les morceaux sans extrait Deezer sont ignorés à l'import."
      onClose={onClose}
      width="lg"
      footer={<button type="button" onClick={onClose} className={primaryButton}>Terminé</button>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented<Tab>
            options={[{ value: 'spotify', label: 'Spotify' }, { value: 'deezer', label: 'Deezer' }]}
            value={tab}
            onChange={(t) => { setTab(t); setError(''); }}
          />
          <VisibilityToggle isPublic={isPublic} onChange={setIsPublic} />
        </div>
        <p className="text-xs text-neutral-500 -mt-2">
          {isPublic
            ? 'Publique : les autres joueurs la voient et peuvent jouer dessus.'
            : "Privée : visible et jouable par toi seul. Tu pourras la rendre publique plus tard."}
        </p>

        {tab === 'spotify' ? <SpotifyTab add={add} /> : <DeezerTab add={add} />}
        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}

function SpotifyTab({ add }: { add: (kind: SourceKind, ref: string) => Promise<boolean> }) {
  const { me } = useAuth();
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(null);
  const [present, setPresent] = useState<{ ids: Set<string>; liked: boolean } | null>(null);
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [filter, setFilter] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!me?.spotify) return;
    spotifyApi.playlists().then(setPlaylists).catch((e) => setLoadError(e.message));
    sourcesApi.list().then((list) => setPresent({
      ids: new Set(list.flatMap((s) => (s.mine && s.spotify_id ? [s.spotify_id] : []))),
      liked: list.some((s) => s.mine && s.kind === 'spotify_liked'),
    })).catch(() => setPresent({ ids: new Set(), liked: false }));
  }, [me?.spotify]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (playlists ?? []).filter((p) => p.owned && (!q || p.name.toLowerCase().includes(q)));
  }, [playlists, filter]);

  if (!me?.spotify) {
    return (
      <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
        <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center"><MusicIcon /></div>
        <p className="font-medium text-neutral-900">Spotify n'est pas encore lié</p>
        <p className="text-sm text-neutral-500 mt-1 mb-4">Lie ton compte pour importer tes playlists et tes titres likés.</p>
        <Link to={PROFILE_SETTINGS_PATH} className={primaryButton}>Lier Spotify</Link>
      </div>
    );
  }
  if (loadError) return <ErrorText>{loadError}</ErrorText>;
  if (!playlists || !present) return <LoadingState />;

  const stateOf = (key: string, already: boolean): RowState => states[key] ?? (already ? 'present' : 'idle');
  const run = async (key: string, kind: SourceKind, ref: string) => {
    setStates((s) => ({ ...s, [key]: 'adding' }));
    const ok = await add(kind, ref);
    setStates((s) => ({ ...s, [key]: ok ? 'added' : 'idle' }));
  };

  const hidden = playlists.filter((p) => !p.owned).length;

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer mes playlists…" className={`${inputClass} pl-9`} />
      </div>

      <ul className="rounded-xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden">
        {!filter && (
          <SpotifyRow
            cover={<div className="w-12 h-12 rounded-lg bg-gradient-to-br from-rose-400 to-violet-500 text-white flex items-center justify-center"><HeartIcon /></div>}
            name="Mes titres likés"
            detail="Tous tes likes Spotify"
            state={stateOf('liked', present.liked)}
            onAdd={() => run('liked', 'spotify_liked', '')}
          />
        )}
        {visible.map((p) => (
          <SpotifyRow
            key={p.id}
            cover={p.image
              ? <img src={p.image} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover bg-neutral-100" />
              : <div className="w-12 h-12 rounded-lg bg-neutral-100 text-neutral-400 flex items-center justify-center"><MusicIcon /></div>}
            name={p.name}
            detail={p.total != null ? `${p.total} titre${p.total > 1 ? 's' : ''}` : 'Playlist'}
            state={stateOf(p.id, present.ids.has(p.id))}
            onAdd={() => run(p.id, 'spotify_playlist', p.id)}
          />
        ))}
        {filter && visible.length === 0 && <li className="px-4 py-6 text-center text-sm text-neutral-500">Aucune playlist ne correspond.</li>}
      </ul>

      {hidden > 0 && (
        <p className="text-xs text-neutral-400">
          {hidden} playlist{hidden > 1 ? 's suivies masquées' : ' suivie masquée'} : Spotify ne laisse importer que celles que tu as créées ou dont tu es collaborateur.
        </p>
      )}
    </div>
  );
}

function SpotifyRow({ cover, name, detail, state, onAdd }: {
  cover: React.ReactNode;
  name: string;
  detail: string;
  state: RowState;
  onAdd: () => void;
}) {
  return (
    <li className="px-3 py-2.5 flex items-center gap-3 hover:bg-neutral-50 transition-colors">
      <div className="shrink-0">{cover}</div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-neutral-900 truncate">{name}</p>
        <p className="text-xs text-neutral-500">{detail}</p>
      </div>
      {state === 'present' ? (
        <span className="text-xs font-medium text-neutral-400 px-3">Déjà importée</span>
      ) : state === 'added' ? (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-600 px-3"><CheckIcon className="w-4 h-4" />Ajoutée</span>
      ) : (
        <button type="button" onClick={onAdd} disabled={state === 'adding'} className={`${secondaryButton} inline-flex items-center gap-1.5 shrink-0`}>
          <PlusIcon className="w-4 h-4" />{state === 'adding' ? 'Ajout…' : 'Ajouter'}
        </button>
      )}
    </li>
  );
}

function DeezerTab({ add }: { add: (kind: SourceKind, ref: string) => Promise<boolean> }) {
  const [ref, setRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [added, setAdded] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAdded(false);
    if (await add('deezer_playlist', ref)) {
      setRef('');
      setAdded(true);
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5">
      <DeezerProfilePlaylists add={add} />
      <form onSubmit={onSubmit} className="space-y-2">
        <label className="block text-sm font-medium text-neutral-700" htmlFor="deezer-ref">Lien de la playlist</label>
        <div className="flex gap-2">
          <input
            id="deezer-ref"
            value={ref}
            onChange={(e) => { setRef(e.target.value); setAdded(false); }}
            placeholder="https://www.deezer.com/fr/playlist/…"
            className={inputClass}
            autoFocus
          />
          <button type="submit" disabled={saving || !ref.trim()} className={`${primaryButton} shrink-0`}>{saving ? 'Ajout…' : 'Ajouter'}</button>
        </div>
        {added
          ? <p className="inline-flex items-center gap-1 text-sm text-emerald-600"><CheckIcon className="w-4 h-4" />Ajoutée, l'import tourne en arrière-plan.</p>
          : <p className="text-xs text-neutral-400">N'importe quelle playlist publique, y compris les playlists éditoriales Deezer.</p>}
      </form>
    </div>
  );
}

// The linked Deezer profile's public playlists and "Coups de cœur", one click
// each; nothing when no profile is linked.
function DeezerProfilePlaylists({ add }: { add: (kind: SourceKind, ref: string) => Promise<boolean> }) {
  const { me } = useAuth();
  const [playlists, setPlaylists] = useState<DeezerPlaylist[] | null>(null);
  const [present, setPresent] = useState<Set<string>>(new Set());
  const [states, setStates] = useState<Record<string, RowState>>({});
  const [error, setError] = useState('');

  useEffect(() => {
    if (!me?.deezer) return;
    deezerApi.playlists().then(setPlaylists).catch((e) => setError(e.message));
    sourcesApi.list()
      .then((list) => setPresent(new Set(list.flatMap((s) => (s.mine && s.deezer_id ? [s.deezer_id] : [])))))
      .catch(() => undefined);
  }, [me?.deezer]);

  if (!me?.deezer) {
    return (
      <p className="text-xs text-neutral-500">
        Relie ton profil Deezer dans <Link to={PROFILE_SETTINGS_PATH} className="underline">ton profil</Link> pour voir tes playlists ici.
      </p>
    );
  }
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!playlists) return <LoadingState />;
  if (playlists.length === 0) return <p className="text-sm text-neutral-500">Ton profil Deezer n'a pas de playlist publique.</p>;

  const run = async (id: string) => {
    setStates((s) => ({ ...s, [id]: 'adding' }));
    const ok = await add('deezer_playlist', id);
    setStates((s) => ({ ...s, [id]: ok ? 'added' : 'idle' }));
  };

  return (
    <div>
      <p className="text-sm font-medium text-neutral-700 mb-2">Mes playlists Deezer</p>
      <ul className="rounded-xl border border-neutral-200 divide-y divide-neutral-100 overflow-hidden max-h-72 overflow-y-auto">
        {playlists.map((p) => (
          <SpotifyRow
            key={p.id}
            cover={p.loved
              ? <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-rose-400 to-violet-500 text-white flex items-center justify-center"><HeartIcon /></div>
              : p.image
                ? <img src={p.image} alt="" loading="lazy" className="w-12 h-12 rounded-lg object-cover bg-neutral-100" />
                : <div className="w-12 h-12 rounded-lg bg-neutral-100" />}
            name={p.name}
            detail={`${p.total} titre${p.total > 1 ? 's' : ''}`}
            state={states[p.id] ?? (present.has(p.id) ? 'present' : 'idle')}
            onAdd={() => run(p.id)}
          />
        ))}
      </ul>
    </div>
  );
}

// Publique / Privée switch, shown next to the source tabs.
export function VisibilityToggle({ isPublic, onChange }: { isPublic: boolean; onChange: (value: boolean) => void }) {
  const option = (value: boolean, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      aria-pressed={isPublic === value}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
        isPublic === value ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50'
      }`}
    >
      {icon}{label}
    </button>
  );
  return (
    <div className="inline-flex border border-neutral-200 rounded-lg p-0.5 bg-white">
      {option(true, <GlobeIcon className="w-4 h-4" />, 'Publique')}
      {option(false, <LockIcon className="w-4 h-4" />, 'Privée')}
    </div>
  );
}
