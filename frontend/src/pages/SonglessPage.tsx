import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { songlessApi } from '../utils/api';
import { useClipPlayer } from '../components/songless/useClipPlayer';
import { GuessField, GuessPanel, useGuessSearch } from '../components/songless/GuessInput';
import { Timeline } from '../components/songless/Timeline';
import { ErrorText, LoadingState, Page, panel, primaryButton, secondaryButton } from '../components/shared/ui';
import { BulbIcon, FlagIcon, PauseIcon, PlayIcon } from '../components/shared/icons';
import { ListenButtons } from '../components/shared/ListenButtons';
import { accent, GAME_ACCENT } from '../utils/theme';
import type { GameState, Guess, SearchResult } from '../types';

// secondaryButton without its colours, so the tinted variants never fight
// over bg/border/text classes.
const tintedButton =
  'inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

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

  // Space plays/stops the clip from anywhere except a text field. On a focused
  // button it would otherwise click it again (a second "Passer" by accident).
  const playerRef = useRef(player);
  playerRef.current = player;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      const p = playerRef.current;
      if (p.loading) return;
      if (p.playing) p.stop();
      else p.play();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const search = useGuessSearch();
  const onPick = (r: SearchResult) => {
    search.reset();
    act(() => songlessApi.guess(gameId, r.deezer_id));
  };
  const onSkip = () => act(() => songlessApi.skip(gameId));
  const onGiveUp = () => act(() => songlessApi.giveUp(gameId));

  const playAgain = async () => {
    try {
      if (!game?.source_id) return navigate('/');
      const next = await songlessApi.start(game.source_id);
      navigate(`/songless/${next.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  if (!game) return error ? <Page><ErrorText>{error}</ErrorText></Page> : <LoadingState />;

  const nextStepMs = game.steps_ms[game.step + 1];
  const extra = nextStepMs ? `+${((nextStepMs - game.unlocked_ms) / 1000).toLocaleString('fr-FR')} s` : '';

  return (
    <Page width={finished ? 'md' : 'lg'}>

      {finished && game.answer && <AnswerCard game={game} />}

      <div className={finished ? '' : 'lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6'}>
        <div className="min-w-0">
          <div className={`${panel} p-5 mb-4`}>
            <div className="flex items-center gap-4">
              <button
                onClick={player.playing ? player.stop : player.play}
                disabled={player.loading}
                aria-label={player.playing ? 'Pause' : 'Écouter'}
            title="Espace pour écouter / arrêter"
                className="w-14 h-14 shrink-0 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:bg-neutral-800 transition-colors disabled:opacity-50"
              >
                {player.playing ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-6 h-6 ml-0.5" />}
              </button>
              <div className="flex-1 min-w-0">
                <Timeline stepsMs={game.steps_ms} unlockedMs={game.unlocked_ms} positionMs={player.positionMs} finished={finished} barClass={accent(GAME_ACCENT.songless).solid} />
              </div>
            </div>
            {player.error && <p className="text-sm text-red-600 mt-3">{player.error}</p>}
          </div>

          <GuessList guesses={game.guesses} total={game.steps_ms.length} />

          {!finished && (
            <div className="mt-4 space-y-3">
              <GuessField s={search} disabled={busy} onPick={onPick} />
              <GuessPanel s={search} onPick={onPick} className="h-80 lg:hidden" />
              <div className="flex flex-wrap justify-end items-center gap-2">
                <button onClick={onSkip} disabled={busy} className={secondaryButton}>
                  {nextStepMs ? `Passer (${extra})` : 'Dernier essai : passer'}
                </button>
                <button
                  onClick={onGiveUp}
                  disabled={busy}
                  className={`${tintedButton} border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100`}
                >
                  <FlagIcon className="w-4 h-4" />Abandonner
                </button>
              </div>
            </div>
          )}
        </div>

        {/* The grid cell stretches to the left column; the absolute panel fills
            it without adding height, so both columns end at the same line. */}
        {!finished && (
          <div className="hidden lg:block relative">
            <GuessPanel s={search} onPick={onPick} className="absolute inset-0" />
          </div>
        )}
      </div>

      <div className="mt-4"><ErrorText>{error}</ErrorText></div>

      {finished && (
        <div className="mt-6 flex flex-wrap gap-3 justify-center">
          <button onClick={playAgain} className={primaryButton}>Rejouer</button>
          <Link to="/" className={secondaryButton}>Retour</Link>
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
                : g.kind === 'hint' ? 'bg-amber-100 text-amber-700'
                : 'bg-neutral-100 text-neutral-500'
            }`}>
              {!g ? i + 1 : g.kind === 'right' ? '✓' : g.kind === 'wrong' ? '✗' : g.kind === 'hint' ? <BulbIcon className="w-3.5 h-3.5" /> : '–'}
            </span>
            {g?.kind === 'skip' && <span className="text-neutral-400">Passé</span>}
            {g?.kind === 'hint' && (
              <span className="truncate text-neutral-500">
                Indice · {g.label} <span className="font-mono text-neutral-800 tracking-wider">{g.text}</span>
              </span>
            )}
            {g && (g.kind === 'right' || g.kind === 'wrong') && (
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
  return (
    <div className={`${panel} p-4 mb-4 flex items-center gap-5`}>
      {a.cover_url
        ? <img src={a.cover_url} alt="" className="w-24 h-24 rounded-lg object-cover shrink-0 shadow-sm" />
        : <div className="w-24 h-24 rounded-lg bg-neutral-100 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold text-neutral-900 truncate">{a.title}</p>
        <p className="text-neutral-600 truncate">{a.artist}</p>
        <div className="mt-2"><ListenButtons deezerId={a.deezer_id} spotifyId={a.spotify_id} /></div>
      </div>
    </div>
  );
}
