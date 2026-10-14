import { useCallback, useEffect, useRef, useState } from 'react';
import type { RoomState } from '../../types';

export interface Welcome {
  role: 'host' | 'player';
  player_id?: number;
  token?: string;
  name?: string;
}

type Hello = { role: 'host' } | { role: 'player'; name?: string; token?: string };

// One WebSocket per screen, re-opened with backoff when a phone sleeps or the
// network blips. Players re-identify with their token and keep their seat.
export function useRoomSocket(code: string, hello: Hello | null, onWelcome?: (w: Welcome) => void) {
  const [state, setState] = useState<RoomState | null>(null);
  const [error, setError] = useState('');
  const [ended, setEnded] = useState<'closed' | 'kicked' | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const helloRef = useRef(hello);
  const welcomeRef = useRef(onWelcome);
  helloRef.current = hello;
  welcomeRef.current = onWelcome;

  const helloKey = hello ? JSON.stringify(hello) : null;

  useEffect(() => {
    if (!helloKey) return;
    let stop = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout>;

    const open = () => {
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const ws = new WebSocket(`${proto}://${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        retry = 0;
        setConnected(true);
        ws.send(JSON.stringify({ type: 'hello', room: code, ...helloRef.current }));
      };
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'state') {
          setState(msg.state);
          setError('');
        } else if (msg.type === 'welcome') {
          welcomeRef.current?.(msg);
        } else if (msg.type === 'error') {
          setError(msg.message);
        } else if (msg.type === 'closed' || msg.type === 'kicked') {
          stop = true;
          setEnded(msg.type);
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (stop) return;
        retry += 1;
        timer = setTimeout(open, Math.min(10_000, 500 * 2 ** retry));
      };
    };
    open();

    return () => {
      stop = true;
      clearTimeout(timer);
      wsRef.current?.close();
    };
  }, [code, helloKey]);

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(message));
  }, []);

  return { state, error, setError, ended, connected, send };
}

// Seconds left in the round, counted down locally from the server's figure.
export function useCountdown(remainingMs: number | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (remainingMs === null) {
      setLeft(null);
      return;
    }
    const end = Date.now() + remainingMs;
    const tick = () => setLeft(Math.max(0, Math.ceil((end - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [remainingMs]);
  return left;
}
