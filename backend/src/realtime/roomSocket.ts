import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { isSameOrigin } from '../app.js';
import { userFromCookieHeader, type SessionUser } from '../auth/session.js';
import {
  audioStarted, buzz, closeRoom, endRound, getRoom, joinRoom, kick, nextRound, onRoomChange, purgeIdleRooms,
  roomState, startGame, submitAnswer, touch, verdict, type Room,
} from '../services/rooms.js';

// Protocol (JSON text frames):
//   client → {type:'hello', room, role:'host'}                 (session cookie = room host)
//   client → {type:'hello', room, role:'player', name?, token?} (guests: nickname; accounts: their name)
//   server → {type:'welcome', role, player_id?, token?} then {type:'state', state} on every change
//   host   → start | audio_started | skip | next | verdict{correct} | kick{player_id} | close
//   player → answer{choice?|deezer_id?} | buzz
//   server → {type:'error', message} | {type:'closed'} | {type:'kicked'}

const hello = z.object({
  type: z.literal('hello'),
  room: z.string().min(4).max(8),
  role: z.enum(['host', 'player']),
  name: z.string().max(40).optional(),
  token: z.string().max(64).optional(),
});

const command = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start') }),
  z.object({ type: z.literal('audio_started') }),
  z.object({ type: z.literal('skip') }),
  z.object({ type: z.literal('next') }),
  z.object({ type: z.literal('verdict'), correct: z.boolean() }),
  z.object({ type: z.literal('kick'), player_id: z.number().int() }),
  z.object({ type: z.literal('close') }),
  z.object({ type: z.literal('answer'), choice: z.number().int().optional(), deezer_id: z.number().int().positive().optional() }),
  z.object({ type: z.literal('buzz') }),
]);

const HOST_COMMANDS = new Set(['start', 'audio_started', 'skip', 'next', 'verdict', 'kick', 'close']);

interface Conn {
  room: Room;
  role: 'host' | 'player';
  playerId?: number;
  alive: boolean;
  messages: number[];
}

const conns = new Map<WebSocket, Conn>();

function send(ws: WebSocket, payload: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

export function broadcast(room: Room) {
  touch(room);
  for (const ws of room.hostSockets) send(ws, { type: 'state', state: roomState(room, { host: true }) });
  for (const p of room.players.values()) {
    for (const ws of p.sockets) send(ws, { type: 'state', state: roomState(room, { playerId: p.id }) });
  }
}

// At most 20 messages per second per socket; a flood just gets dropped.
function rateLimited(conn: Conn, now = Date.now()) {
  conn.messages = conn.messages.filter((t) => now - t < 1000);
  conn.messages.push(now);
  return conn.messages.length > 20;
}

export function attachRoomSockets(server: Server) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  onRoomChange(broadcast);

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (new URL(req.url ?? '/', 'http://x').pathname !== '/ws') return void socket.destroy();
    // Cross-site WebSocket hijacking guard: browsers always send Origin here.
    if (!req.headers.origin || !isSameOrigin(req.headers.origin, req.headers.host)) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      return void socket.destroy();
    }
    userFromCookieHeader(req.headers.cookie)
      .then((user) => wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, user)))
      .catch(() => socket.destroy());
  });

  // Heartbeat: phones sleep and drop connections without a FIN.
  const heartbeat = setInterval(() => {
    for (const [ws, conn] of conns) {
      if (!conn.alive) {
        ws.terminate();
        continue;
      }
      conn.alive = false;
      ws.ping();
    }
    purgeIdleRooms();
  }, 30_000);
  heartbeat.unref();
}

function onConnection(ws: WebSocket, user: SessionUser | undefined) {
  let conn: Conn | null = null;
  const helloTimeout = setTimeout(() => ws.close(), 10_000);

  ws.on('pong', () => {
    if (conn) conn.alive = true;
  });

  ws.on('message', async (raw) => {
    let data: unknown;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return send(ws, { type: 'error', message: 'Invalid message' });
    }

    if (!conn) {
      const parsed = hello.safeParse(data);
      if (!parsed.success) return send(ws, { type: 'error', message: 'Say hello first' });
      clearTimeout(helloTimeout);
      conn = handleHello(ws, parsed.data, user);
      return;
    }

    if (rateLimited(conn)) return;
    const parsed = command.safeParse(data);
    if (!parsed.success) return send(ws, { type: 'error', message: 'Unknown command' });

    const { room } = conn;
    if (!getRoom(room.code)) return send(ws, { type: 'closed' });
    if (HOST_COMMANDS.has(parsed.data.type) && conn.role !== 'host') {
      return send(ws, { type: 'error', message: 'Host only' });
    }

    try {
      await handleCommand(conn, parsed.data);
      if (getRoom(room.code)) broadcast(room);
    } catch (e) {
      send(ws, { type: 'error', message: e instanceof Error ? e.message : 'Error' });
      if (getRoom(room.code)) broadcast(room);
    }
  });

  ws.on('close', () => {
    clearTimeout(helloTimeout);
    if (!conn) return;
    conns.delete(ws);
    conn.room.hostSockets.delete(ws);
    if (conn.playerId) conn.room.players.get(conn.playerId)?.sockets.delete(ws);
    if (getRoom(conn.room.code)) broadcast(conn.room);
  });
}

function handleHello(ws: WebSocket, msg: z.infer<typeof hello>, user: SessionUser | undefined): Conn | null {
  const room = getRoom(msg.room);
  if (!room) {
    send(ws, { type: 'closed' });
    ws.close();
    return null;
  }

  if (msg.role === 'host') {
    if (!user || user.id !== room.hostUserId) {
      send(ws, { type: 'error', message: 'Only the host can open the host screen' });
      ws.close();
      return null;
    }
    room.hostSockets.add(ws);
    const conn: Conn = { room, role: 'host', alive: true, messages: [] };
    conns.set(ws, conn);
    send(ws, { type: 'welcome', role: 'host' });
    broadcast(room);
    return conn;
  }

  try {
    const player = joinRoom(room, {
      name: msg.name, token: msg.token, userId: user?.id ?? null, userName: user?.display_name,
    });
    player.sockets.add(ws);
    const conn: Conn = { room, role: 'player', playerId: player.id, alive: true, messages: [] };
    conns.set(ws, conn);
    send(ws, { type: 'welcome', role: 'player', player_id: player.id, token: player.token, name: player.name });
    broadcast(room);
    return conn;
  } catch (e) {
    send(ws, { type: 'error', message: e instanceof Error ? e.message : 'Cannot join' });
    ws.close();
    return null;
  }
}

async function handleCommand(conn: Conn, cmd: z.infer<typeof command>) {
  const { room } = conn;
  switch (cmd.type) {
    case 'start':
      broadcast(room); // shows "preparing" while Spotify/Deezer lookups run
      await startGame(room);
      return;
    case 'audio_started':
      return audioStarted(room);
    case 'skip':
      return endRound(room);
    case 'next':
      return nextRound(room);
    case 'verdict':
      return verdict(room, cmd.correct);
    case 'kick':
      return kick(room, cmd.player_id);
    case 'close':
      return closeRoom(room);
    case 'answer':
    case 'buzz': {
      const player = conn.playerId ? room.players.get(conn.playerId) : undefined;
      if (!player) throw new Error('Not a player');
      if (cmd.type === 'buzz') return buzz(room, player);
      return submitAnswer(room, player, { choice: cmd.choice, deezer_id: cmd.deezer_id });
    }
  }
}
