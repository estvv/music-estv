import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { blindtestApi } from '../utils/api';
import { useClipPlayer } from '../components/songless/useClipPlayer';
import { GuessInput } from '../components/songless/GuessInput';
import { Badge, card, ErrorText, LoadingState, Page, PageHeader, panel, primaryButton } from '../components/shared/ui';
import { BoltIcon, PlayIcon } from '../components/shared/icons';
import type { Blindtest, BlindtestRoundResult } from '../types';

const RESULT_LABELS: Record<BlindtestRoundResult['kind'], string> = {
  right: 'Bonne réponse',
  artist: 'Bon artiste',
  wrong: 'Raté',
  timeout: 'Temps écoulé',
};

export function BlindTestPage() {
  const { id } = useParams();
  const testId = Number(id);
  const [test, setTest] = useState<Blindtest | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const startedRef = useRef(false);

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

  // New round: nothing played yet.
  useEffect(() => {
    startedRef.current = false;
  }, [roundIndex]);

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

  if (!test) return error ? <Page><ErrorText>{error}</ErrorText></Page> : <LoadingState />;

  if (test.status === 'finished') return <Summary test={test} />;

  const round = test.round!;
  const last = round.answered ? test.history[round.index] : null;
  const remaining = Math.max(0, Math.ceil((test.clip_ms - player.positionMs) / 1000));

  return (
    <Page>
      <PageHeader
        title="Blind test"
        subtitle={test.source_name}
        icon={<BoltIcon />}
        accent="violet"
        actions={<Badge accent="violet"><span className="tabular-nums">{test.score} pts</span></Badge>}
      />
      <div className="mb-6">
        <div className="flex justify-between text-sm text-neutral-500 mb-1.5">
          <span>Morceau {round.index + 1}/{test.total}</span>
        </div>
        <div className="flex gap-1">
          {Array.from({ length: test.total }, (_, i) => {
            const h = test.history[i];
            const cls = h ? (h.kind === 'right' ? 'bg-emerald-500' : h.kind === 'artist' ? 'bg-amber-400' : 'bg-rose-300')
              : i === round.index ? 'bg-violet-500' : 'bg-neutral-200';
            return <span key={i} className={`h-2 flex-1 rounded-full ${cls}`} />;
          })}
        </div>
      </div>

      <div className={`${panel} p-5 mb-4 flex items-center gap-4`}>
        <button
          onClick={player.play}
          disabled={player.loading || player.playing || round.answered || startedRef.current}
          className="w-14 h-14 shrink-0 rounded-full bg-neutral-900 text-white flex items-center justify-center hover:bg-neutral-800 transition-colors disabled:opacity-40"
          aria-label="Lancer l'extrait"
        >
          <PlayIcon className="w-6 h-6 ml-0.5" />
        </button>
        <div className="flex-1">
          {round.answered ? (
            <p className="text-sm text-neutral-500">Manche terminée.</p>
          ) : player.playing ? (
            <>
              <div className="h-2 rounded-full bg-neutral-100 overflow-hidden mb-1.5">
                <div className="h-full bg-violet-500" style={{ width: `${(player.positionMs / test.clip_ms) * 100}%` }} />
              </div>
              <p className="text-sm text-neutral-500 tabular-nums">{remaining} s : plus tu réponds vite, plus tu marques.</p>
            </>
          ) : (
            <p className="text-sm text-neutral-500">Lance l'extrait : le chrono démarre avec la musique.</p>
          )}
          {player.error && <p className="text-sm text-red-600 mt-1">{player.error}</p>}
        </div>
      </div>

      {last ? (
        <RoundReveal result={last} />
      ) : test.answer_mode === 'mcq' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {round.choices!.map((c) => (
            <button
              key={c.index}
              onClick={() => act(() => blindtestApi.answer(testId, { choice: c.index }))}
              disabled={busy || !player.playing}
              className={`${card} px-4 py-3.5 text-left hover:border-violet-300 disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-sm`}
            >
              <div className="font-medium text-neutral-900">{c.title}</div>
              <div className="text-sm text-neutral-500">{c.artist}</div>
            </button>
          ))}
        </div>
      ) : (
        <GuessInput disabled={busy || !player.playing} onPick={(r) => act(() => blindtestApi.answer(testId, { deezer_id: r.deezer_id }))} />
      )}

      {round.answered && (
        <div className="mt-4 flex justify-end">
          <button onClick={() => act(() => blindtestApi.next(testId))} disabled={busy} className={primaryButton}>
            {round.index + 1 === test.total ? 'Voir le résultat' : 'Morceau suivant'}
          </button>
        </div>
      )}
      <div className="mt-4"><ErrorText>{error}</ErrorText></div>
    </Page>
  );
}

function RoundReveal({ result }: { result: BlindtestRoundResult }) {
  const good = result.kind === 'right' || result.kind === 'artist';
  return (
    <div className={`${panel} p-4 flex items-center gap-4 border-t-4 ${good ? 'border-t-emerald-500' : 'border-t-rose-400'}`}>
      {result.answer.cover_url
        ? <img src={result.answer.cover_url} alt="" className="w-20 h-20 rounded-lg object-cover shrink-0 shadow-sm" />
        : <div className="w-20 h-20 rounded-lg bg-neutral-100 shrink-0" />}
      <div className="min-w-0 flex-1">
        <Badge accent={result.kind === 'right' ? 'emerald' : result.kind === 'artist' ? 'amber' : 'rose'}>
          {RESULT_LABELS[result.kind]}{result.points > 0 && ` +${result.points} pts en ${(result.elapsed_ms / 1000).toFixed(1)} s`}
        </Badge>
        <p className="text-lg font-bold text-neutral-900 truncate mt-1">{result.answer.title}</p>
        <p className="text-sm text-neutral-600 truncate">{result.answer.artist}</p>
        {result.guess && result.kind !== 'right' && (
          <p className="text-xs text-neutral-400 truncate">Ta réponse : {result.guess.title} — {result.guess.artist}</p>
        )}
      </div>
    </div>
  );
}

function Summary({ test }: { test: Blindtest }) {
  const found = test.history.filter((h) => h.kind === 'right').length;
  return (
    <Page>
      <div className={`${panel} p-8 mb-6 text-center`}>
        <span className="inline-flex"><Badge accent="violet">Blind test, {test.source_name}</Badge></span>
        <p className="text-5xl font-bold text-neutral-900 mt-4 tabular-nums">{test.score}</p>
        <p className="text-neutral-500 mt-1">points, {found}/{test.total} morceaux trouvés</p>
      </div>

      <div className={`${panel} divide-y divide-neutral-100 mb-6`}>
        {test.history.map((h, i) => (
          <div key={i} className="px-4 py-3 flex items-center gap-3">
            <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${
              h.kind === 'right' ? 'bg-emerald-100 text-emerald-700'
                : h.kind === 'artist' ? 'bg-amber-50 text-amber-700'
                : 'bg-rose-50 text-rose-700'
            }`}>
              {h.kind === 'right' ? '✓' : h.kind === 'artist' ? '½' : '✗'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 truncate">{h.answer.title}</p>
              <p className="text-xs text-neutral-500 truncate">{h.answer.artist}</p>
            </div>
            <span className={`text-sm font-semibold tabular-nums ${h.points ? 'text-neutral-900' : 'text-neutral-300'}`}>{h.points ? `+${h.points}` : '0'}</span>
          </div>
        ))}
      </div>

      <div className="flex gap-3 justify-center">
        <Link to="/" className={primaryButton}>Retour à l'accueil</Link>
      </div>
    </Page>
  );
}
