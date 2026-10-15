import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { roomsApi } from '../utils/api';
import { usePlayableSources } from '../components/sources/SourcePicker';
import { PlaylistBrowser } from '../components/sources/PlaylistBrowser';
import { Segmented } from '../components/shared/Segmented';
import { ErrorText, LoadingState, Page, panel, primaryButton } from '../components/shared/ui';
import { CheckIcon, DeezerLogo, SpotifyLogo } from '../components/shared/icons';
import { GameLogo } from '../components/shared/GameLogo';
import type { RoomAnswerMode, RoomGame } from '../types';

// slug: the logo file in /public/games.
const GAMES: { value: RoomGame; slug: string; label: string; detail: string }[] = [
  { value: 'blindtest', slug: 'blindtest', label: 'Blind test', detail: '15 s par morceau' },
  { value: 'songless', slug: 'songless', label: 'Songless', detail: '4 extraits pour trouver' },
  { value: 'wholiked', slug: 'wholiked', label: 'Qui a liké ça ?', detail: 'Devine à qui est le morceau' },
];

const MODE_LABELS: Record<RoomAnswerMode, string> = { mcq: '4 choix', type: 'saisie libre', buzzer: 'buzzer' };

function Chip({ children, warn = false }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
      warn ? 'bg-amber-50 text-amber-800' : 'bg-neutral-100 text-neutral-700'
    }`}>
      {children}
    </span>
  );
}

// A settings line: what it is on the left, the control on the right.
function Row({ label, hint, children }: { label: string; hint?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

export function PartyNewPage() {
  const navigate = useNavigate();
  const { sources, last, remember } = usePlayableSources();
  const [game, setGame] = useState<RoomGame>('blindtest');
  const [mode, setMode] = useState<RoomAnswerMode>('mcq');
  const [rounds, setRounds] = useState(10);
  const [hits, setHits] = useState(false);
  const [sourceId, setSourceId] = useState<number | ''>('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Start on the playlist played last.
  useEffect(() => {
    if (last) setSourceId((current) => current || last);
  }, [last]);

  const needsPlaylist = game !== 'wholiked';
  const source = sources?.find((s) => s.id === sourceId);
  const ready = !needsPlaylist || Boolean(sourceId);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      if (sourceId) remember(sourceId);
      const { code } = await roomsApi.create({
        game,
        answer_mode: game === 'wholiked' ? 'mcq' : game === 'songless' ? 'type' : mode,
        rounds,
        source_id: needsPlaylist && sourceId ? sourceId : undefined,
        hits,
      });
      navigate(`/party/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setCreating(false);
    }
  };

  const chosen = GAMES.find((g) => g.value === game)!;

  return (
    <Page width="lg">
      {/* The game */}
      <div className="grid grid-cols-3 gap-3 mb-6" role="radiogroup" aria-label="Jeu">
        {GAMES.map((g) => {
          const selected = game === g.value;
          return (
            <button
              key={g.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setGame(g.value)}
              className={`relative rounded-xl border bg-white px-3 py-5 flex flex-col items-center text-center gap-2 transition ${
                selected ? 'border-neutral-900 ring-1 ring-neutral-900' : 'border-neutral-200 hover:border-neutral-300'
              }`}
            >
              {selected && (
                <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-neutral-900 text-white flex items-center justify-center">
                  <CheckIcon className="w-3 h-3" />
                </span>
              )}
              <GameLogo slug={g.slug} name={g.label} className="w-14 h-14" />
              <span className="font-semibold text-neutral-900">{g.label}</span>
              <span className="hidden sm:block text-xs text-neutral-500">{g.detail}</span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 items-start">
        {/* Settings */}
        <section>
          <h2 className="text-sm font-semibold text-neutral-500 mb-3">Réglages</h2>
          <div className={`${panel} p-5 divide-y divide-neutral-100`}>
            {game === 'blindtest' && (
              <Row
                label="Réponses"
                hint={mode === 'buzzer' ? "Le premier qui buzze répond à voix haute, tu valides depuis l'écran." : undefined}
              >
                <Segmented<RoomAnswerMode>
                  options={[{ value: 'mcq', label: '4 choix' }, { value: 'type', label: 'Saisie' }, { value: 'buzzer', label: 'Buzzer' }]}
                  value={mode}
                  onChange={setMode}
                />
              </Row>
            )}
            {game === 'songless' && (
              <Row label="Extraits" hint="0,5 s, 2 s, 5 s puis 10 s : une réponse par extrait, plus tôt = plus de points." />
            )}
            <Row label="Nombre de morceaux">
              <Segmented<number>
                options={[{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 15, label: '15' }, { value: 20, label: '20' }]}
                value={rounds}
                onChange={setRounds}
              />
            </Row>
            {needsPlaylist && (
              <Row label="Tubes uniquement" hint="La moitié la plus populaire de la playlist">
                <input type="checkbox" checked={hits} onChange={(e) => setHits(e.target.checked)} className="w-4 h-4 accent-neutral-900" />
              </Row>
            )}
          </div>
        </section>
      </div>

      {/* Summary of the room, then launch */}
      <div className={`${panel} mt-6 p-4 flex flex-wrap items-center gap-4`}>
        <GameLogo slug={chosen.slug} name={chosen.label} className="w-12 h-12" />
        <div className="flex-1 min-w-[12rem]">
          <p className="font-semibold text-neutral-900">{chosen.label}</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            <Chip>{rounds} morceaux</Chip>
            {game === 'blindtest' && <Chip>{MODE_LABELS[mode]}</Chip>}
            {needsPlaylist ? (
              source ? (
                <Chip>
                  {source.image_url && <img src={source.image_url} alt="" className="w-4 h-4 rounded-sm object-cover -ml-1" />}
                  <span className="truncate max-w-[14rem]">{source.name}</span>
                </Chip>
              ) : <Chip warn>Aucune playlist choisie</Chip>
            ) : <Chip>Goûts Spotify et Deezer des joueurs</Chip>}
            {needsPlaylist && hits && <Chip>Tubes uniquement</Chip>}
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
        <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">Annuler</Link>
        <button
          onClick={create}
          disabled={creating || !ready}
          title={!ready ? "Choisis d'abord une playlist" : undefined}
          className={primaryButton}
        >
          {creating ? 'Création…' : 'Créer le salon'}
        </button>
      </div>
    </Page>
  );
}
