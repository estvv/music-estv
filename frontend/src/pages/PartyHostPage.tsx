import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useAuth } from '../contexts/AuthContext';
import { useCountdown, useRoomSocket } from '../components/party/useRoomSocket';
import { useHostAudio, useSpotifyPlayback } from '../components/party/useHostAudio';
import { Scoreboard } from '../components/party/Scoreboard';
import { ErrorText, ghostButton, LoadingState, primaryButton, secondaryButton } from '../components/shared/ui';
import type { RoomState } from '../types';
import { choiceStyle } from '../utils/theme';

const GAME_TITLES = { blindtest: 'Blind test', wholiked: 'Qui a liké ça ?', songless: 'Songless' } as const;

// The TV screen: large type, readable from the sofa. It owns the audio.
export function PartyHostPage() {
  const { code = '' } = useParams();
  const { me } = useAuth();
  const { state, error, ended, connected, send } = useRoomSocket(code, { role: 'host' });
  const [useSpotify, setUseSpotify] = useState(false);
  const spotify = useSpotifyPlayback(useSpotify);
  const audio = useHostAudio(code, state?.round ?? null, spotify, () => send({ type: 'audio_started' }), state?.game !== 'songless');

  if (ended === 'closed') {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <p className="text-neutral-600 mb-6">Le salon est fermé.</p>
        <Link to="/" className={primaryButton}>Retour à l'accueil</Link>
      </div>
    );
  }
  if (!state) return error ? <div className="p-10"><ErrorText>{error}</ErrorText></div> : <LoadingState />;

  const start = () => {
    audio.unlock();
    send({ type: 'start' });
  };
  const close = () => {
    audio.stopAll();
    send({ type: 'close' });
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center gap-4 mb-8">
        <h1 className="text-3xl font-bold text-neutral-900">{GAME_TITLES[state.game]}</h1>
        {state.phase === 'round' && state.round && (
          <span className="text-xl text-neutral-500 tabular-nums">Morceau {state.round.index + 1}/{state.total}</span>
        )}
        <div className="flex-1" />
        {!connected && <span className="text-sm text-amber-700">Reconnexion…</span>}
        {me?.spotify && state.game !== 'songless' && (
          <label className="flex items-center gap-2 text-sm text-neutral-600" title="Nécessite Spotify Premium">
            <input type="checkbox" checked={useSpotify} onChange={(e) => setUseSpotify(e.target.checked)} />
            Son Spotify
            {useSpotify && spotify.status === 'loading' && <span className="text-neutral-400">(connexion…)</span>}
            {useSpotify && spotify.status === 'error' && <span className="text-red-600">({spotify.message})</span>}
          </label>
        )}
        <button onClick={close} className={ghostButton}>Fermer le salon</button>
      </div>

      {state.phase === 'lobby' || state.phase === 'preparing'
        ? <Lobby state={state} onStart={start} onKick={(id) => send({ type: 'kick', player_id: id })} />
        : state.phase === 'finished'
          ? <Podium state={state} onReplay={start} />
          : <RoundView state={state} send={send} />}

      <div className="mt-6 space-y-1">
        <ErrorText>{error || state.error || audio.error}</ErrorText>
      </div>
    </div>
  );
}

function Lobby({ state, onStart, onKick }: { state: RoomState; onStart: () => void; onKick: (id: number) => void }) {
  const joinUrl = `${window.location.origin}/join/${state.code}`;
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(joinUrl, { margin: 1, width: 360 }).then(setQr).catch(() => undefined);
  }, [joinUrl]);

  return (
    <div className="grid md:grid-cols-2 gap-10 items-start">
      <div className="text-center">
        {qr && <img src={qr} alt={`QR code pour rejoindre ${joinUrl}`} className="mx-auto w-72 h-72 rounded-xl border border-neutral-200 bg-white p-3 shadow-sm" />}
        <p className="mt-4 text-neutral-500">ou va sur <span className="font-medium text-neutral-900">{window.location.host}/join</span> avec le code</p>
        <p className="text-6xl font-bold tracking-widest text-neutral-900 mt-2">{state.code}</p>
      </div>
      <div>
        <h2 className="text-xl font-semibold text-neutral-900 mb-3">
          {state.players.length === 0 ? 'En attente des joueurs…' : `${state.players.length} joueur${state.players.length > 1 ? 's' : ''}`}
        </h2>
        <ul className="flex flex-wrap gap-2 mb-8">
          {state.players.map((p) => (
            <li key={p.id} className="group flex items-center gap-2 pl-2 pr-2 py-1.5 rounded-full border border-neutral-200 bg-white shadow-sm text-lg">
              <span className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 text-sm font-bold flex items-center justify-center">{p.name.slice(0, 1).toUpperCase()}</span>
              <span className={p.connected ? 'text-neutral-900' : 'text-neutral-400'}>{p.name}</span>
              <button onClick={() => onKick(p.id)} className="text-neutral-300 hover:text-red-600 px-1" title={`Retirer ${p.name}`}>×</button>
            </li>
          ))}
        </ul>
        <button
          onClick={onStart}
          disabled={state.players.length === 0 || state.phase === 'preparing'}
          className="w-full px-6 py-4 rounded-lg bg-neutral-900 text-white text-lg font-medium hover:bg-neutral-800 transition-colors disabled:opacity-40"
        >
          {state.phase === 'preparing' ? 'Préparation des morceaux…' : 'Lancer la partie'}
        </button>
      </div>
    </div>
  );
}

function RoundView({ state, send }: { state: RoomState; send: (m: object) => void }) {
  const round = state.round!;
  const left = useCountdown(round.remaining_ms);
  const connectedCount = state.players.filter((p) => p.connected).length;

  return (
    <div className="grid lg:grid-cols-[1fr_320px] gap-10">
      <div>
        {round.phase === 'loading' && (
          <p className="text-3xl text-neutral-400 py-16 text-center">
            {round.step ? `Extrait suivant : ${round.clip_ms / 1000} s…` : 'Chargement du morceau…'}
          </p>
        )}

        {round.step !== null && round.steps !== null && round.phase !== 'reveal' && (
          <div className="flex justify-center gap-2 mb-2">
            {Array.from({ length: round.steps }, (_, i) => (
              <span key={i} className={`h-2 w-10 rounded-full ${i < round.step! ? 'bg-neutral-300' : i === round.step ? 'bg-emerald-500' : 'bg-neutral-100'}`} />
            ))}
          </div>
        )}

        {round.phase === 'playing' && (
          <div className="text-center py-6">
            <p className={`text-8xl font-bold tabular-nums ${left !== null && left <= 5 ? 'text-rose-600' : 'text-neutral-900'}`}>{left ?? ''}</p>
            <p className="text-xl text-neutral-500 mt-2">
              {state.answer_mode === 'buzzer' ? 'Buzzez quand vous savez !'
                : state.game === 'songless' ? `Extrait de ${round.clip_ms / 1000} s, ${round.answered_count}/${connectedCount} ont trouvé`
                : `${round.answered_count}/${connectedCount} ont répondu`}
            </p>
            {round.choices && (
              <div className="grid grid-cols-2 gap-3 mt-10 text-left">
                {round.choices.map((c) => (
                  <div key={c.index} className={`rounded-xl border px-5 py-4 flex items-start gap-3 ${choiceStyle(c.index).tile}`}>
                    <span className={`w-3 h-3 rounded-full mt-2 shrink-0 ${choiceStyle(c.index).dot}`} />
                    <div>
                    <div className="text-xl font-semibold text-neutral-900">{c.title}</div>
                    {c.artist && <div className="text-neutral-500">{c.artist}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {round.phase === 'buzzed' && round.buzzer && (
          <div className="text-center py-10">
            <p className="text-xl text-neutral-500">Buzz de</p>
            <p className="text-6xl font-bold text-neutral-900 my-4">{round.buzzer.name}</p>
            <div className="flex justify-center gap-4 mt-8">
              <button onClick={() => send({ type: 'verdict', correct: true })} className="px-8 py-4 rounded-lg bg-emerald-600 text-white text-xl font-medium hover:bg-emerald-700">Bonne réponse</button>
              <button onClick={() => send({ type: 'verdict', correct: false })} className="px-8 py-4 rounded-lg border border-neutral-200 text-xl font-medium text-neutral-700 hover:bg-neutral-50">Raté, on continue</button>
            </div>
          </div>
        )}

        {round.phase === 'reveal' && round.reveal && (
          <div>
            <div className="flex items-center gap-6 mb-6">
              {round.reveal.answer.cover_url && <img src={round.reveal.answer.cover_url} alt="" className="w-40 h-40 rounded-lg object-cover" />}
              <div>
                <p className="text-4xl font-bold text-neutral-900">{round.reveal.answer.title}</p>
                <p className="text-2xl text-neutral-600">{round.reveal.answer.artist}</p>
                {round.reveal.owners && (
                  <p className="text-xl text-emerald-700 mt-2">Liké par {round.reveal.owners.join(', ')}</p>
                )}
              </div>
            </div>
            {round.reveal.results.filter((r) => r.points > 0).length > 0 ? (
              <ul className="text-xl space-y-1">
                {round.reveal.results.filter((r) => r.points > 0).map((r) => (
                  <li key={r.player_id} className="flex justify-between max-w-md">
                    <span>{r.name}</span><span className="text-emerald-700 tabular-nums">+{r.points}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xl text-neutral-500">Personne n'a trouvé.</p>}
          </div>
        )}

        <div className="mt-10 flex gap-3">
          {round.phase === 'reveal' ? (
            <button onClick={() => send({ type: 'next' })} className="px-6 py-3 rounded-lg bg-neutral-900 text-white text-lg font-medium hover:bg-neutral-800">
              {round.index + 1 >= state.total ? 'Voir le podium' : 'Morceau suivant'}
            </button>
          ) : (
            <button onClick={() => send({ type: 'skip' })} className={secondaryButton}>Révéler maintenant</button>
          )}
        </div>
      </div>

      <Scoreboard players={state.players} large />
    </div>
  );
}

function Podium({ state, onReplay }: { state: RoomState; onReplay: () => void }) {
  const [first, second, third] = state.players;
  return (
    <div className="max-w-2xl mx-auto text-center">
      <p className="text-xl text-neutral-500 mb-2">Victoire de</p>
      <p className="text-6xl font-bold text-neutral-900 mb-2">{first?.name ?? '—'}</p>
      <p className="text-2xl text-emerald-700 tabular-nums mb-10">{first?.score ?? 0} pts</p>
      {(second || third) && (
        <p className="text-xl text-neutral-600 mb-10">
          {second && <>2ᵉ {second.name} ({second.score})</>}{third && <>, 3ᵉ {third.name} ({third.score})</>}
        </p>
      )}
      <Scoreboard players={state.players} large />
      <button onClick={onReplay} className={`${primaryButton} mt-8 px-6 py-3 text-lg`}>Rejouer avec les mêmes joueurs</button>
    </div>
  );
}
