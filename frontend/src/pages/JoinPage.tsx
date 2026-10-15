import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { roomsApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { useCountdown, useRoomSocket, type Welcome } from '../components/party/useRoomSocket';
import { GuessInput } from '../components/songless/GuessInput';
import { Scoreboard } from '../components/party/Scoreboard';
import { inputClass } from '../components/shared/Field';
import { ErrorText, LoadingState } from '../components/shared/ui';
import type { RoomInfo, RoomState } from '../types';
import { choiceStyle } from '../utils/theme';
import { MusicIcon } from '../components/shared/icons';

// Room codes are 6 letters (see CODE_LENGTH in backend/src/services/rooms.ts).
const CODE_LENGTH = 6;

// Phone screen for party guests. Public: no account needed, a nickname is enough.
// Logged-in accounts join under their own name (needed for "Qui a liké ça ?").
export function JoinPage() {
  const { code } = useParams();
  if (!code) return <CodeEntry />;
  return <JoinRoom code={code.toUpperCase()} />;
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="h-14 bg-white border-b border-neutral-200 flex items-center justify-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-neutral-900 text-emerald-400 flex items-center justify-center"><MusicIcon className="w-4 h-4" /></span>
        <span className="font-bold text-neutral-900">Music</span>
      </div>
      <main className="max-w-md mx-auto px-4 py-8">{children}</main>
    </div>
  );
}

function CodeEntry() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  return (
    <Shell>
      <h1 className="text-2xl font-bold text-neutral-900 mb-6 text-center">Rejoindre une soirée</h1>
      <form onSubmit={(e) => { e.preventDefault(); navigate(`/join/${code.trim().toUpperCase()}`); }} className="space-y-3">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, CODE_LENGTH))}
          placeholder="CODE"
          autoCapitalize="characters"
          className={`${inputClass} py-4 text-center text-3xl font-bold tracking-widest`}
          autoFocus
        />
        <button disabled={code.length !== CODE_LENGTH} className="w-full py-4 rounded-lg bg-neutral-900 text-white text-lg font-medium disabled:opacity-40">
          Rejoindre
        </button>
      </form>
    </Shell>
  );
}

const tokenKey = (code: string) => `music-room:${code}`;

function readToken(code: string): string | null {
  try {
    return sessionStorage.getItem(tokenKey(code));
  } catch {
    return null;
  }
}

function JoinRoom({ code }: { code: string }) {
  const { me, loading } = useAuth();
  const [info, setInfo] = useState<RoomInfo | null>(null);
  const [infoError, setInfoError] = useState('');
  const [name, setName] = useState('');
  const [hello, setHello] = useState<{ role: 'player'; name?: string; token?: string } | null>(null);
  const [token, setToken] = useState<string | null>(() => readToken(code));

  useEffect(() => {
    roomsApi.info(code).then(setInfo).catch((e) => setInfoError(e.message));
  }, [code]);

  // Back from a sleeping phone or a reload: rejoin straight away.
  useEffect(() => {
    if (!hello && token) setHello({ role: 'player', token });
  }, [hello, token]);

  const onWelcome = useCallback((w: Welcome) => {
    if (!w.token) return;
    setToken(w.token);
    try {
      sessionStorage.setItem(tokenKey(code), w.token);
    } catch {
      // Private mode: rejoining after a reload will ask for the nickname again.
    }
  }, [code]);

  const socket = useRoomSocket(code, hello, onWelcome);

  if (infoError) return <Shell><p className="text-center text-neutral-600 py-10">Ce salon n'existe pas ou est fermé.</p></Shell>;
  if (!info || loading) return <LoadingState />;
  if (socket.ended) {
    return <Shell><p className="text-center text-neutral-600 py-10">{socket.ended === 'kicked' ? "L'hôte t'a retiré du salon." : 'La soirée est terminée, merci !'}</p></Shell>;
  }

  if (!hello) {
    return (
      <Shell>
        <p className="text-center text-neutral-500">Soirée de {info.host_name}</p>
        <h1 className="text-3xl font-bold text-neutral-900 mb-8 text-center">
          {info.game === 'wholiked' ? 'Qui a liké ça ?' : info.game === 'songless' ? 'Songless' : 'Blind test'}
        </h1>
        {me ? (
          <button onClick={() => setHello({ role: 'player' })} className="w-full py-4 rounded-lg bg-neutral-900 text-white text-lg font-medium">
            Jouer en tant que {me.display_name}
          </button>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); setHello({ role: 'player', name: name.trim() }); }} className="space-y-3">
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} placeholder="Ton pseudo" className={`${inputClass} py-4 text-lg`} autoFocus />
            <button disabled={!name.trim()} className="w-full py-4 rounded-lg bg-neutral-900 text-white text-lg font-medium disabled:opacity-40">Rejoindre</button>
          </form>
        )}
        {info.game === 'wholiked' && !me && (
          <p className="text-sm text-neutral-500 mt-4 text-center">Pour que tes morceaux soient dans la partie, connecte-toi d'abord à ton compte.</p>
        )}
      </Shell>
    );
  }

  if (!socket.state) {
    return (
      <Shell>
        <LoadingState />
        {socket.error && (
          <div className="text-center space-y-3">
            <ErrorText>{socket.error}</ErrorText>
            <button onClick={() => { setHello(null); setToken(null); }} className="text-sm underline text-neutral-600">Changer de pseudo</button>
          </div>
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      <PlayerView state={socket.state} token={token ?? ''} send={socket.send} />
      <div className="mt-4 text-center">
        {!socket.connected && <p className="text-sm text-amber-700">Reconnexion…</p>}
        <ErrorText>{socket.error}</ErrorText>
      </div>
    </Shell>
  );
}

const RESULT_TEXT = { right: 'Bonne réponse !', artist: 'Bon artiste !', wrong: 'Raté', timeout: 'Trop tard' } as const;

function PlayerView({ state, token, send }: { state: RoomState; token: string; send: (m: object) => void }) {
  const me = state.players.find((p) => p.id === state.you?.player_id);
  const round = state.round;
  const left = useCountdown(round?.remaining_ms ?? null);
  const search = useCallback((q: string) => roomsApi.search(state.code, token, q), [state.code, token]);

  const header = (
    <div className="flex justify-between items-baseline mb-6">
      <span className="font-semibold text-neutral-900">{me?.name}</span>
      <span className="text-sm font-semibold text-neutral-900 tabular-nums">{me?.score ?? 0} pts</span>
    </div>
  );

  if (state.phase === 'lobby' || state.phase === 'preparing') {
    return (
      <>
        {header}
        <p className="text-center text-xl text-neutral-900 py-10">Tu es dans la partie !</p>
        <p className="text-center text-neutral-500">Regarde l'écran : ça commence bientôt.</p>
      </>
    );
  }

  if (state.phase === 'finished') {
    const rank = state.players.findIndex((p) => p.id === me?.id) + 1;
    return (
      <>
        {header}
        <p className="text-center text-5xl font-bold text-neutral-900 py-6">{rank}ᵉ</p>
        <Scoreboard players={state.players} highlight={me?.id} />
      </>
    );
  }

  if (!round) return <LoadingState />;
  const result = state.you?.result;

  return (
    <>
      {header}
      <div className="flex justify-between text-sm text-neutral-500 mb-4">
        <span>Morceau {round.index + 1}/{state.total}</span>
        {round.step !== null && round.phase !== 'reveal' && <span>Extrait {round.step + 1}/{round.steps}</span>}
        {round.phase === 'playing' && left !== null && <span className="tabular-nums">{left} s</span>}
      </div>

      {round.phase === 'loading' && !(state.game === 'songless' && result) && (
        <p className="text-center text-neutral-500 py-16">Écoute bien…</p>
      )}
      {state.game === 'songless' && result && round.phase !== 'reveal' && (
        <p className="text-center text-emerald-700 text-xl font-semibold py-16">Trouvé ! +{result.points}</p>
      )}

      {round.phase === 'reveal' && round.reveal && (
        <div className="text-center py-6">
          <p className={`text-2xl font-bold mb-4 ${result && result.points > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {result ? `${RESULT_TEXT[result.kind]}${result.points ? ` +${result.points}` : ''}` : 'Pas de réponse'}
          </p>
          <p className="font-semibold text-neutral-900">{round.reveal.answer.title}</p>
          <p className="text-neutral-500">{round.reveal.answer.artist}</p>
          {round.reveal.owners && <p className="text-emerald-700 mt-2">Liké par {round.reveal.owners.join(', ')}</p>}
        </div>
      )}

      {(round.phase === 'playing' || round.phase === 'buzzed') && !(state.game === 'songless' && result) && (
        state.you?.guessed_this_step ? (
          <p className="text-center text-neutral-500 py-16">Raté. Attends l'extrait suivant, plus long.</p>
        ) : result ? (
          <p className="text-center text-neutral-500 py-16">Réponse envoyée. Attends les autres…</p>
        ) : state.answer_mode === 'buzzer' ? (
          <button
            onClick={() => send({ type: 'buzz' })}
            disabled={round.phase !== 'playing' || state.you?.locked_out}
            className="w-full aspect-square rounded-full bg-red-600 text-white text-4xl font-bold active:scale-95 transition-transform disabled:bg-neutral-200 disabled:text-neutral-400"
          >
            {state.you?.locked_out ? 'Raté'
              : round.phase === 'buzzed' ? (round.buzzer?.id === state.you?.player_id ? 'À toi !' : round.buzzer?.name)
              : 'BUZZ'}
          </button>
        ) : round.choices ? (
          <div className="grid gap-3">
            {round.choices.map((c) => (
              <button
                key={c.index}
                onClick={() => send({ type: 'answer', choice: c.index })}
                className={`w-full px-4 py-4 rounded-xl border text-left flex items-start gap-3 active:scale-[0.98] transition-transform ${choiceStyle(c.index).tile}`}
              >
                <span className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${choiceStyle(c.index).dot}`} />
                <span>
                <span className="block text-lg font-semibold text-neutral-900">{c.title}</span>
                {c.artist && <span className="block text-neutral-500">{c.artist}</span>}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <GuessInput disabled={round.phase !== 'playing'} search={search} onPick={(r) => send({ type: 'answer', deezer_id: r.deezer_id })} />
        )
      )}
    </>
  );
}
