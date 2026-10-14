import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { songlessApi } from '../utils/api';
import { useClipPlayer } from '../components/songless/useClipPlayer';
import { GuessInput } from '../components/songless/GuessInput';
import { Timeline } from '../components/songless/Timeline';
import { Badge, ErrorText, LoadingState, Page, PageHeader, panel, primaryButton, secondaryButton } from '../components/shared/ui';
import { CalendarIcon, HeadphonesIcon, PauseIcon, PlayIcon, ShuffleIcon } from '../components/shared/icons';
import { accent, GAME_ACCENT } from '../utils/theme';
import type { GameState, Guess, SearchResult } from '../types';

const MODE_TITLES: Record<GameState['mode'], string> = {
  daily: 'Songless du jour',
  daily_personal: 'Mon Spotify du jour',
  free: 'Songless libre',
};

const MODE_ICONS: Record<GameState['mode'], React.ReactNode> = {
  daily: <CalendarIcon />,
  daily_personal: <HeadphonesIcon />,
  free: <ShuffleIcon />,
};

export function SonglessPage() {
  const { id } = useParams();
  const gameId = Number(id);
  const navigate = useNavigate();
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    songlessApi.get(gameId).then(setGame).catch((e) => setError(e.message));
  }, [gameId]);

  const finished = game ? game.status !== 'playing' : false;
  const player = useClipPlayer(
    songlessApi.audioUrl(gameId, finished ? 99 : game?.step ?? 0),
    game?.unlocked_ms ?? 0,
  );

  const act = useCallback(async (fn: () => Promise<GameState>) => {
    setBusy(true);
    setError('');
    try {
      setGame(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }, []);

  const onPick = (r: SearchResult) => act(() => songlessApi.guess(gameId, r.deezer_id));
  const onSkip = () => act(() => songlessApi.skip(gameId));

  const playAgain = async () => {
    try {
      const next = await songlessApi.start('free');
      navigate(`/songless/${next.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  if (!game) return error ? <Page><ErrorText>{error}</ErrorText></Page> : <LoadingState />;

  const nextStepMs = game.steps_ms[game.step + 1];

  return (
    <Page>
      <PageHeader
        title={MODE_TITLES[game.mode]}
        subtitle={game.day ? formatDay(game.day) : 'Trouve le titre avec le moins d\'écoute possible.'}
        icon={MODE_ICONS[game.mode]}
        accent={GAME_ACCENT[game.mode]}
        actions={!finished && <Badge accent={GAME_ACCENT[game.mode]}>Essai {game.step + 1}/{game.steps_ms.length}</Badge>}
      />

      {finished && game.answer && <AnswerCard game={game} />}

      <div className={`${panel} p-5 mb-4`}>
        <div className="flex items-center gap-4">
          <button
            onClick={player.playing ? player.stop : player.play}
            disabled={player.loading}
            aria-label={player.playing ? 'Pause' : 'Écouter'}
            className="w-14 h-14 shrink-0 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:bg-neutral-800 transition-colors disabled:opacity-50"
          >
            {player.playing ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-6 h-6 ml-0.5" />}
          </button>
          <div className="flex-1 min-w-0">
            <Timeline stepsMs={game.steps_ms} unlockedMs={game.unlocked_ms} positionMs={player.positionMs} finished={finished} barClass={accent(GAME_ACCENT[game.mode]).solid} />
          </div>
        </div>
        {player.error && <p className="text-sm text-red-600 mt-3">{player.error}</p>}
      </div>

      <GuessList guesses={game.guesses} total={game.steps_ms.length} />

      {!finished && (
        <div className="mt-4 space-y-3">
          <GuessInput disabled={busy} onPick={onPick} />
          <div className="flex justify-between items-center gap-3">
            <p className="text-sm text-neutral-500">Tape un titre ou un artiste, puis choisis dans la liste.</p>
            <button onClick={onSkip} disabled={busy} className={secondaryButton}>
              {nextStepMs ? `Passer (+${(nextStepMs - game.unlocked_ms) / 1000} s)` : 'Abandonner'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4"><ErrorText>{error}</ErrorText></div>

      {finished && (
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <ShareButton game={game} />
          {game.mode === 'free' && <button onClick={playAgain} className={primaryButton}>Rejouer</button>}
          <Link to="/" className={secondaryButton}>Retour à l'accueil</Link>
        </div>
      )}
    </Page>
  );
}

function GuessList({ guesses, total }: { guesses: Guess[]; total: number }) {
  return (
    <ol className={`${panel} divide-y divide-neutral-100`}>
      {Array.from({ length: total }, (_, i) => {
        const g = guesses[i];
        return (
          <li key={i} className="px-4 py-2.5 flex items-center gap-3 text-sm min-h-11">
            <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
              !g ? 'bg-neutral-50 text-neutral-300'
                : g.kind === 'right' ? 'bg-emerald-100 text-emerald-700'
                : g.kind === 'wrong' ? 'bg-rose-50 text-rose-700'
                : 'bg-neutral-100 text-neutral-500'
            }`}>
              {!g ? i + 1 : g.kind === 'right' ? '✓' : g.kind === 'wrong' ? '✗' : '–'}
            </span>
            {g?.kind === 'skip' && <span className="text-neutral-400">Passé</span>}
            {g && g.kind !== 'skip' && (
              <span className={`truncate ${g.kind === 'right' ? 'text-emerald-700 font-medium' : 'text-neutral-700'}`}>
                {g.title} <span className="text-neutral-400">— {g.artist}</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function AnswerCard({ game }: { game: GameState }) {
  const a = game.answer!;
  const won = game.status === 'won';
  const linkClass = 'px-2.5 py-1 rounded-md border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900 transition-colors';
  return (
    <div className={`${panel} p-4 mb-4 flex items-center gap-5 border-t-4 ${won ? 'border-t-emerald-500' : 'border-t-rose-400'}`}>
      {a.cover_url
        ? <img src={a.cover_url} alt="" className="w-24 h-24 rounded-lg object-cover shrink-0 shadow-sm" />
        : <div className="w-24 h-24 rounded-lg bg-neutral-100 shrink-0" />}
      <div className="min-w-0 flex-1">
        <Badge accent={won ? 'emerald' : 'rose'}>
          {won ? `Trouvé en ${game.step + 1} essai${game.step ? 's' : ''}, ${game.score} pts` : 'Pas trouvé cette fois'}
        </Badge>
        <p className="text-xl font-bold text-neutral-900 truncate mt-1.5">{a.title}</p>
        <p className="text-neutral-600 truncate">{a.artist}</p>
        <div className="flex gap-2 mt-2">
          <a href={`https://www.deezer.com/track/${a.deezer_id}`} target="_blank" rel="noreferrer" className={linkClass}>Écouter sur Deezer</a>
          {a.spotify_id && (
            <a href={`https://open.spotify.com/track/${a.spotify_id}`} target="_blank" rel="noreferrer" className={linkClass}>Spotify</a>
          )}
        </div>
      </div>
    </div>
  );
}

function ShareButton({ game }: { game: GameState }) {
  const [copied, setCopied] = useState(false);
  const squares = Array.from({ length: game.steps_ms.length }, (_, i) => {
    const g = game.guesses[i];
    if (!g) return '⬜';
    return g.kind === 'right' ? '🟩' : g.kind === 'wrong' ? '🟥' : '⬛';
  }).join('');
  const result = game.status === 'won' ? `${game.step + 1}/${game.steps_ms.length}` : `X/${game.steps_ms.length}`;
  const text = `Music ${MODE_TITLES[game.mode]}${game.day ? ` ${game.day}` : ''}\n${squares} ${result}`;

  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return <button onClick={copy} className={secondaryButton}>{copied ? 'Copié' : 'Copier le résultat'}</button>;
}

export function formatDay(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}
