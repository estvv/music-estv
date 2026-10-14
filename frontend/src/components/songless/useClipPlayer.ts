import { useCallback, useEffect, useRef, useState } from 'react';

// Plays the first `limitMs` of a clip with sample accuracy. An <audio> element
// can't reliably stop after 100 ms, so the clip is decoded with WebAudio and
// scheduled with an explicit duration.
export function useClipPlayer(url: string, limitMs: number) {
  const ctxRef = useRef<AudioContext | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const frameRef = useRef(0);

  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [error, setError] = useState('');

  const stop = useCallback(() => {
    sourceRef.current?.stop();
    sourceRef.current = null;
    cancelAnimationFrame(frameRef.current);
    setPlaying(false);
  }, []);

  // A new URL (next step unlocked) means a longer slice: drop the old buffer.
  useEffect(() => {
    bufferRef.current = null;
    stop();
    setPositionMs(0);
  }, [url, stop]);

  useEffect(() => () => {
    stop();
    ctxRef.current?.close();
  }, [stop]);

  const play = useCallback(async () => {
    setError('');
    stop();
    // The AudioContext must be created/resumed inside a user gesture (iOS).
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    if (ctx.state === 'suspended') await ctx.resume();

    if (!bufferRef.current) {
      setLoading(true);
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error();
        bufferRef.current = await ctx.decodeAudioData(await res.arrayBuffer());
      } catch {
        setError("Impossible de charger l'extrait, réessaie.");
        return;
      } finally {
        setLoading(false);
      }
    }

    const buffer = bufferRef.current;
    const duration = Math.min(limitMs / 1000, buffer.duration);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (sourceRef.current === source) stop();
    };
    source.start(0, 0, duration);
    sourceRef.current = source;
    startedAtRef.current = ctx.currentTime;
    setPlaying(true);

    const tick = () => {
      setPositionMs(Math.min((ctx.currentTime - startedAtRef.current) * 1000, duration * 1000));
      frameRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, [url, limitMs, stop]);

  return { play, stop, loading, playing, positionMs, error };
}
