import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { roomsApi, spotifyApi } from '../../utils/api';
import type { RoomState } from '../../types';

// --- Spotify Web Playback SDK (host with Premium) ------------------------------

interface SpotifyPlayer {
  connect(): Promise<boolean>;
  disconnect(): void;
  pause(): Promise<void>;
  resume(): Promise<void>;
  activateElement(): Promise<void>;
  addListener(event: string, cb: (payload: { device_id?: string; message?: string }) => void): void;
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify?: { Player: new (opts: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume: number }) => SpotifyPlayer };
  }
}

export interface SpotifyPlayback {
  status: 'off' | 'loading' | 'ready' | 'error';
  message: string;
  play: (spotifyId: string, positionMs: number) => Promise<void>;
  pause: () => void;
  resume: () => void;
  activate: () => void;
}

export function useSpotifyPlayback(enabled: boolean): SpotifyPlayback {
  const [status, setStatus] = useState<SpotifyPlayback['status']>('off');
  const [message, setMessage] = useState('');
  const playerRef = useRef<SpotifyPlayer | null>(null);
  const deviceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('off');
      return;
    }
    setStatus('loading');
    const init = () => {
      const player = new window.Spotify!.Player({
        name: 'Music (soirée)',
        getOAuthToken: (cb) => { spotifyApi.token().then((t) => cb(t.access_token)).catch(() => undefined); },
        volume: 0.8,
      });
      player.addListener('ready', ({ device_id }) => {
        deviceRef.current = device_id ?? null;
        setStatus('ready');
      });
      const fail = ({ message: m }: { message?: string }) => {
        setStatus('error');
        setMessage(m ?? 'Spotify indisponible');
      };
      player.addListener('initialization_error', fail);
      player.addListener('authentication_error', fail);
      player.addListener('account_error', () => fail({ message: 'Spotify Premium est nécessaire pour la lecture.' }));
      player.connect();
      playerRef.current = player;
    };

    if (window.Spotify) init();
    else {
      window.onSpotifyWebPlaybackSDKReady = init;
      if (!document.querySelector('script[data-spotify-sdk]')) {
        const script = document.createElement('script');
        script.src = 'https://sdk.scdn.co/spotify-player.js';
        script.dataset.spotifySdk = '1';
        document.body.appendChild(script);
      }
    }
    return () => {
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [enabled]);

  const play = useCallback(async (spotifyId: string, positionMs: number) => {
    const { access_token } = await spotifyApi.token();
    const res = await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${deviceRef.current}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: [`spotify:track:${spotifyId}`], position_ms: positionMs }),
    });
    if (!res.ok) throw new Error(`Spotify ${res.status}`);
  }, []);

  return useMemo(() => ({
    status,
    message,
    play,
    pause: () => { playerRef.current?.pause(); },
    resume: () => { playerRef.current?.resume(); },
    activate: () => { playerRef.current?.activateElement(); },
  }), [status, message, play]);
}

// --- round audio ---------------------------------------------------------------

// Drives the host screen's speakers from the round phase: load and play on
// "loading" (then tell the server the music started), pause on a buzz, resume
// when play goes on. Spotify is used when ready and the track has a Spotify id;
// otherwise the Deezer clip.
export function useHostAudio(
  code: string,
  round: RoomState['round'],
  spotify: SpotifyPlayback,
  onStarted: () => void,
  // Songless needs sample-accurate 0.1 s clips: Deezer only.
  allowSpotify = true,
) {
  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const usingSpotifyRef = useRef(false);
  const loadedRoundRef = useRef<string | null>(null);
  const lastPhaseRef = useRef<string | null>(null);
  const [error, setError] = useState('');
  const startedRef = useRef(onStarted);
  startedRef.current = onStarted;

  // Must run inside a click: browsers only allow audio after a user gesture.
  const unlock = useCallback(() => {
    ctxRef.current ??= new AudioContext();
    ctxRef.current.resume();
    spotify.activate();
  }, [spotify]);

  const stopAll = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    if (usingSpotifyRef.current) spotify.pause();
    usingSpotifyRef.current = false;
  }, [spotify]);

  const index = round?.index ?? null;
  const phase = round?.phase ?? null;
  const step = round?.step ?? null;
  const clipMs = round?.clip_ms ?? null;

  useEffect(() => {
    const previous = lastPhaseRef.current;
    lastPhaseRef.current = phase;
    if (index === null || phase === null) return;

    const loadKey = `${index}:${step}`;
    if (phase === 'loading' && loadedRoundRef.current !== loadKey) {
      loadedRoundRef.current = loadKey;
      stopAll();
      setError('');
      (async () => {
        try {
          if (allowSpotify && spotify.status === 'ready') {
            const { spotify_id } = await roomsApi.spotifyTrack(code);
            if (spotify_id) {
              await spotify.play(spotify_id, 45_000);
              usingSpotifyRef.current = true;
              startedRef.current();
              return;
            }
          }
        } catch {
          // Fall through to Deezer.
        }
        try {
          const ctx = (ctxRef.current ??= new AudioContext());
          if (ctx.state === 'suspended') await ctx.resume();
          const res = await fetch(roomsApi.audioUrl(code, index), { credentials: 'same-origin' });
          if (!res.ok) throw new Error();
          const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0, 0, Math.min(buffer.duration, (clipMs ?? 15000) / 1000));
          sourceRef.current = source;
          startedRef.current();
        } catch {
          setError("Impossible de lire l'extrait : passe au morceau suivant.");
        }
      })();
      return;
    }

    if (phase === 'buzzed') {
      if (usingSpotifyRef.current) spotify.pause();
      else ctxRef.current?.suspend();
    } else if (phase === 'playing' && previous === 'buzzed') {
      if (usingSpotifyRef.current) spotify.resume();
      else ctxRef.current?.resume();
    }
  }, [code, index, phase, step, clipMs, allowSpotify, spotify, stopAll]);

  useEffect(() => () => {
    sourceRef.current?.stop();
    ctxRef.current?.close();
  }, []);

  return { unlock, stopAll, error };
}
