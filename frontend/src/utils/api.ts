import type {
  RoomAnswerMode, RoomGame, RoomInfo,
  AdminSource, Blindtest, SourceKind, AdminUser, AllTimeRow, DailyRow, GameState, Me, MyStats, SearchResult, SpotifyPlaylist, TodayStatus, UserSource,
} from '../types';

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(endpoint: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(`/api${endpoint}`, {
    method: options.method ?? 'GET',
    headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    credentials: 'same-origin',
  });

  const payload = await response.json().catch(() => ({ error: 'Request failed' }));
  if (!response.ok) throw new ApiError(payload.error || `HTTP ${response.status}`, response.status);
  return payload.data as T;
}

export const authApi = {
  me: () => request<Me>('/auth/me'),
  login: (username: string, password: string) => request<void>('/auth/login', { method: 'POST', body: { username, password } }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  changePassword: (current: string, next: string) =>
    request<void>('/auth/password', { method: 'POST', body: { current, next } }),
};

export const songlessApi = {
  today: () => request<TodayStatus>('/songless/today'),
  start: (mode: GameState['mode'], sourceId?: number) =>
    request<GameState>('/songless/start', { method: 'POST', body: { mode, source_id: sourceId } }),
  get: (id: number) => request<GameState>(`/songless/${id}`),
  guess: (id: number, deezerId: number) =>
    request<GameState>(`/songless/${id}/guess`, { method: 'POST', body: { deezer_id: deezerId } }),
  skip: (id: number) => request<GameState>(`/songless/${id}/skip`, { method: 'POST' }),
  search: (q: string) => request<SearchResult[]>(`/songless/search?q=${encodeURIComponent(q)}`),
  audioUrl: (id: number, step: number) => `/api/songless/${id}/audio?step=${step}`,
};

export const blindtestApi = {
  start: (body: { source_id?: number; rounds: number; answer_mode: Blindtest['answer_mode']; hits: boolean }) =>
    request<Blindtest>('/blindtest/start', { method: 'POST', body }),
  get: (id: number) => request<Blindtest>(`/blindtest/${id}`),
  audioUrl: (id: number, round: number) => `/api/blindtest/${id}/audio?round=${round}`,
  answer: (id: number, body: { deezer_id?: number; choice?: number; give_up?: boolean }) =>
    request<Blindtest>(`/blindtest/${id}/answer`, { method: 'POST', body }),
  next: (id: number) => request<Blindtest>(`/blindtest/${id}/next`, { method: 'POST' }),
};

export const sourcesApi = {
  list: () => request<UserSource[]>('/sources'),
  // reuse: hand back the existing source instead of a "already added" error.
  create: (kind: SourceKind, ref: string, reuse = false) =>
    request<UserSource>('/sources', { method: 'POST', body: { kind, ref, reuse } }),
  sync: (id: number) => request<void>(`/sources/${id}/sync`, { method: 'POST' }),
  remove: (id: number) => request<void>(`/sources/${id}`, { method: 'DELETE' }),
};

export const roomsApi = {
  create: (body: { game: RoomGame; answer_mode: RoomAnswerMode; source_id?: number; rounds: number; hits: boolean }) =>
    request<{ code: string }>('/rooms', { method: 'POST', body }),
  info: (code: string) => request<RoomInfo>(`/rooms/${encodeURIComponent(code)}`),
  audioUrl: (code: string, round: number) => `/api/rooms/${code}/audio?round=${round}`,
  spotifyTrack: (code: string) => request<{ spotify_id: string | null }>(`/rooms/${code}/spotify`),
  // Guests have no session: the room player token authorises the search.
  search: async (code: string, token: string, q: string): Promise<SearchResult[]> => {
    const res = await fetch(`/api/rooms/${code}/search?q=${encodeURIComponent(q)}`, { headers: { 'X-Player-Token': token } });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(payload.error || `HTTP ${res.status}`, res.status);
    return payload.data;
  },
};

export const leaderboardApi = {
  daily: (day?: string) => request<{ day: string; rows: DailyRow[] }>(`/leaderboard/daily${day ? `?day=${day}` : ''}`),
  all: () => request<AllTimeRow[]>('/leaderboard/all'),
  me: () => request<MyStats>('/leaderboard/me'),
};

export const spotifyApi = {
  connectUrl: '/api/spotify/connect',
  token: () => request<{ access_token: string }>('/spotify/token'),
  unlink: () => request<void>('/spotify', { method: 'DELETE' }),
  playlists: () => request<SpotifyPlaylist[]>('/spotify/playlists'),
};

export const adminApi = {
  users: () => request<AdminUser[]>('/admin/users'),
  createUser: (body: { username: string; display_name: string; is_admin: boolean }) =>
    request<{ user: AdminUser; password: string }>('/admin/users', { method: 'POST', body }),
  updateUser: (id: number, body: Partial<{ display_name: string; is_admin: boolean; disabled: boolean; reset_password: true }>) =>
    request<{ password?: string }>(`/admin/users/${id}`, { method: 'PATCH', body }),
  deleteUser: (id: number) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
  sources: () => request<AdminSource[]>('/admin/sources'),
  createSource: (body: { kind: SourceKind; ref: string; in_daily_pool: boolean }) =>
    request<AdminSource>('/admin/sources', { method: 'POST', body }),
  setInPool: (id: number, in_daily_pool: boolean) =>
    request<void>(`/admin/sources/${id}`, { method: 'PATCH', body: { in_daily_pool } }),
  syncSource: (id: number) => request<void>(`/admin/sources/${id}/sync`, { method: 'POST' }),
  deleteSource: (id: number) => request<void>(`/admin/sources/${id}`, { method: 'DELETE' }),
};
