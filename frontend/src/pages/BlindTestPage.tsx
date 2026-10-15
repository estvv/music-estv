import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { blindtestApi } from '../utils/api';
import { useClipPlayer } from '../components/songless/useClipPlayer';
import { GuessField, GuessPanel, useGuessSearch } from '../components/songless/GuessInput';
import { launchGame, loadLastGame } from '../components/home/lastGame';
import { ListenButtons } from '../components/shared/ListenButtons';
import { ErrorText, LoadingState, Page, panel, primaryButton, secondaryButton } from '../components/shared/ui';
import { PlayIcon } from '../components/shared/icons';
import type { Blindtest, BlindtestRoundResult, SearchResult } from '../types';

const RESULT_LABELS: Record<BlindtestRoundResult['kind'], string> = {
  right: 'Bonne réponse',
  artist: 'Bon artiste',
  wrong: 'Raté',
  timeout: 'Temps écoulé',
};

const RESULT_COLORS: Record<BlindtestRoundResult['kind'], string> = {
  right: 'text-emerald-600',
  artist: 'text-amber-600',
  wrong: 'text-rose-600',
  timeout: 'text-neutral-400',
};

// Keyboard: Space starts the clip, 1-4 pick a choice, Enter goes to the next
// track. Ignored while typing in a field.
function useKeys(handler: (e: KeyboardEvent) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if ((e.target as HTMLElement).closest('input, textarea, select, [contenteditable="true"]')) return;
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function BlindTestPage() {
  const { id } = useParams();
  const testId = Number(id);
  const [test, setTest] = useState<Blindtest | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);
  const search = useGuessSearch();

  useEffect(() => {
    blindtestApi.get(testId).then(setTest).catch((e) => setError(e.message));
  }, [testId]);

  const roundIndex = test?.round?.index ?? 0;
  const player = useClipPlayer(blindtestApi.audioUrl(testId, roundIndex), test?.clip_ms ?? 15000);

  const act = useCallback(async (fn: () => Promise<Blindtest>) => {
    setBusy(true);
    setError('');
    try {
      setTest(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }, []);

  const answered = Boolean(test?.round?.answered);

  // New round: nothing played yet, empty search.
  const resetSearch = search.reset;
  useEffect(() => {
    startedRef.current = false;
    resetSearch();
  }, [roundIndex, resetSearch]);

  // The clip ran to its end without an answer: the round is lost.
  useEffect(() => {
    if (player.playing) startedRef.current = true;
    else if (startedRef.current && !answered && !busy) {
      startedRef.current = false;
      act(() => blindtestApi.answer(testId, { give_up: true }));
    }
  }, [player.playing, answered, busy, act, testId]);

  // Stop the music as soon as the round is answered.
  const stopPlayer = player.stop;
  useEffect(() => {
    if (answered) stopPlayer();
  }, [answered, stopPlayer]);

  const canPlay = Boolean(test?.round) && !answered && !player.loading && !player.playing && !startedRef.current;
  const choose = (index: number) => act(() => blindtestApi.answer(testId, { choice: index }));
  const pickTyped = (r: SearchResult) => {
    search.reset();
    act(() => blindtestApi.answer(testId, { deezer_id: r.deezer_id }));
  };
  const next = () => act(() => blindtestApi.next(testId));

  useKeys((e) => {
    if (!test?.round || busy) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (canPlay) player.play();
    } else if (e.key === 'Enter' && answered) {
      e.preventDefault();
      next();
    } else if (test.answer_mode === 'mcq' && player.playing && !answered && /^[1-4]$/.test(e.key)) {
      const choice = test.round.choices?.[Number(e.key) - 1];
      if (choice) choose(choice.index);
    }
  });

  if (!test) return error ? <Page><ErrorText>{error}</ErrorText></Page> : <LoadingState />;
  if (test.status === 'finished') return <Summary test={test} />;

  const round = test.round!;
  const last = round.answered ? test.history[round.index] : null;
  const typed = test.answer_mode === 'type';
  const sidePanel = typed && !round.answered;

  return (
    <Page width={sidePanel ? 'lg' : 'md'}>
      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-sm text-neutral-500">
            Morceau <span className="font-semibold text-neutral-900 tabular-nums">{round.index + 1}</span>/{test.total}
            <span className="text-neutral-300"> · </span>{test.source_name}
          </span>
          <span className="text-lg font-bold text-neutral-900 tabular-nums">{test.score} <span className="text-sm font-medium text-neutral-500">pts</span></span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: test.total }, (_, i) => {
            const h = test.history[i];
            const cls = h ? (h.kind === 'right' ? 'bg-emerald-500' : h.kind === 'artist' ? 'bg-amber-400' : 'bg-rose-300')
              : i === round.index ? 'bg-neutral-900' : 'bg-neutral-200';
            return <span key={i} className={`h-1.5 flex-1 rounded-full ${cls}`} />;
          })}
        </div>
      </div>

      <div className={sidePanel ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6' : ''}>
        <div className="min-w-0 space-y-4">
          <div className={`${panel} p-5 flex items-center gap-4`}>
            <button
              onClick={player.play}
              disabled={!canPlay}
              title="Espace pour lancer"
              className="w-14 h-14 shrink-0 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:bg-neutral-800 transition-colors disabled:opacity-30"
              aria-label="Lancer l'extrait"
            >
              <PlayIcon className="w-6 h-6 ml-0.5" />
            </button>
            <div className="flex-1 min-w-0">
              <div className="h-2.5 rounded-full bg-neutral-100 overflow-hidden">
                <div
                  className={`h-full ${round.answered ? 'bg-neutral-300' : 'bg-violet-500'}`}
                  style={{ width: `${Math.min(100, (player.positionMs / test.clip_ms) * 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-neutral-400 mt-1.5 tabular-nums">
                <span>
                  {round.answered ? 'Manche terminée'
                    : player.playing ? `${(player.positionMs / 1000).toFixed(1)} s`
                    : 'Espace pour lancer : le chrono démarre avec la musique'}
                </span>
                <span>{test.clip_ms / 1000} s</span>
              </div>
              {player.error && <p className="text-sm text-red-600 mt-1">{player.error}</p>}
            </div>
          </div>

          {last ? (
            <RoundResult result={last} />
          ) : !typed ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {round.choices!.map((c, i) => (
                <button
                  key={c.index}
                  onClick={() => choose(c.index)}
                  disabled={busy || !player.playing}
                  className={`${panel} px-4 py-3.5 flex items-center gap-3 text-left transition-colors hover:border-neutral-400 disabled:opacity-50 disabled:hover:border-neutral-200`}
                >
                  <span className="w-7 h-7 shrink-0 rounded-md bg-neutral-100 text-neutral-500 text-sm font-semibold flex items-center justify-center tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-neutral-900 truncate">{c.title}</span>
                    <span className="block text-sm text-neutral-500 truncate">{c.artist}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <>
              <GuessField s={search} disabled={busy || !player.playing} onPick={pickTyped} />
              <GuessPanel s={search} onPick={pickTyped} className="h-80 lg:hidden" />
            </>
          )}

          {round.answered && (
            <div className="flex items-center justify-end gap-3">
              <button onClick={next} disabled={busy} className={primaryButton}>
                {round.index + 1 === test.total ? 'Voir le résultat' : 'Suivant'}
              </button>
            </div>
          )}
          <ErrorText>{error}</ErrorText>
        </div>

        {sidePanel && (
          <div className="hidden lg:block relative">
            <GuessPanel s={search} onPick={pickTyped} className="absolute inset-0" />
          </div>
        )}
      </div>
    </Page>
  );
}

function RoundResult({ result }: { result: BlindtestRoundResult }) {
  const a = result.answer;
  return (
    <div className={`${panel} p-4 flex items-center gap-5`}>
      {a.cover_url
        ? <img src={a.cover_url} alt="" className="w-24 h-24 rounded-lg object-cover shrink-0 shadow-sm" />
        : <div className="w-24 h-24 rounded-lg bg-neutral-100 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold text-neutral-900 truncate">{a.title}</p>
        <p className="text-neutral-600 truncate">{a.artist}</p>
        {result.guess && result.kind !== 'right' && (
          <p className="text-xs text-neutral-400 truncate mt-0.5">Ta réponse : {result.guess.title} — {result.guess.artist}</p>
        )}
        <div className="mt-2"><ListenButtons deezerId={a.deezer_id} spotifyId={a.spotify_id} /></div>
      </div>
      <div className="shrink-0 text-right pl-2">
        <p className={`text-2xl font-bold tabular-nums ${RESULT_COLORS[result.kind]}`}>{result.points > 0 ? `+${result.points}` : '0'}</p>
        <p className="text-xs text-neutral-500">
          {RESULT_LABELS[result.kind]}
          {result.points > 0 && <><br />en {(result.elapsed_ms / 1000).toFixed(1)} s</>}
        </p>
      </div>
    </div>
  );
}

function Summary({ test }: { test: Blindtest }) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const found = test.history.filter((h) => h.kind === 'right').length;

  // Same playlist and settings; "hits only" is not stored with the game, so it
  // comes from the last launch when that was this same playlist.
  const replay = async () => {
    if (!test.source_id) return;
    const last = loadLastGame();
    setStarting(true);
    try {
      navigate(await launchGame({
        game: 'blindtest',
        sourceId: test.source_id,
        rounds: test.total,
        answerMode: test.answer_mode,
        hits: last?.game === 'blindtest' && last.sourceId === test.source_id ? last.hits : false,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setStarting(false);
    }
  };

  return (
    <Page>
      <div className={`${panel} p-8 mb-4 text-center`}>
        <p className="text-sm text-neutral-500">{test.source_name}</p>
        <p className="text-5xl font-bold text-neutral-900 mt-2 tabular-nums">{test.score}</p>
        <p className="text-neutral-500 mt-1">points · {found}/{test.total} morceaux trouvés</p>
      </div>

      <ul className={`${panel} divide-y divide-neutral-100 overflow-hidden mb-6`}>
        {test.history.map((h, i) => (
          <li key={i} className="px-4 py-2.5 flex items-center gap-3">
            {h.answer.cover_url
              ? <img src={h.answer.cover_url} alt="" loading="lazy" className="w-10 h-10 shrink-0 rounded object-cover bg-neutral-100" />
              : <span className="w-10 h-10 shrink-0 rounded bg-neutral-100" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-neutral-900 truncate">{h.answer.title}</p>
              <p className="text-xs text-neutral-500 truncate">{h.answer.artist} · {RESULT_LABELS[h.kind]}</p>
            </div>
            <span className={`text-sm font-semibold tabular-nums ${h.points ? RESULT_COLORS[h.kind] : 'text-neutral-300'}`}>
              {h.points ? `+${h.points}` : '0'}
            </span>
          </li>
        ))}
      </ul>

      <ErrorText>{error}</ErrorText>
      <div className="flex gap-3 justify-center">
        {test.source_id && <button onClick={replay} disabled={starting} className={primaryButton}>{starting ? 'Lancement…' : 'Rejouer'}</button>}
        <Link to="/" className={secondaryButton}>Retour à l'accueil</Link>
      </div>
    </Page>
  );
}
