import type {
  RoomAnswerMode, RoomGame, RoomInfo,
  Blindtest, BoardGame, DeezerPlaylist, BoardPeriod, BoardRow, DayPoints, SourceKind, AdminUser, GameState, History, Me, PlayerProfile, RecordEntry, MissingTrack, SearchResult, SourceTrack, SpotifyPlaylist, UserSource,
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
  updateProfile: (body: { bio?: string | null; favorite_deezer_ids?: number[] }) =>
    request<void>('/auth/profile', { method: 'PATCH', body }),
  // The image is sent as is (already resized by the page), not as JSON.
  uploadAvatar: async (image: Blob): Promise<{ avatar_url: string | null }> => {
    const res = await fetch('/api/auth/avatar', { method: 'PUT', headers: { 'Content-Type': image.type }, body: image, credentials: 'same-origin' });
    const payload = await res.json().catch(() => ({ error: 'Request failed' }));
    if (!res.ok) throw new ApiError(payload.error || `HTTP ${res.status}`, res.status);
    return payload.data;
  },
  removeAvatar: () => request<{ avatar_url: string | null }>('/auth/avatar', { method: 'DELETE' }),
};

export const songlessApi = {
  start: (sourceId: number) => request<GameState>('/songless/start', { method: 'POST', body: { source_id: sourceId } }),
  get: (id: number) => request<GameState>(`/songless/${id}`),
  guess: (id: number, deezerId: number) =>
    request<GameState>(`/songless/${id}/guess`, { method: 'POST', body: { deezer_id: deezerId } }),
  skip: (id: number) => request<GameState>(`/songless/${id}/skip`, { method: 'POST' }),
  giveUp: (id: number) => request<GameState>(`/songless/${id}/give-up`, { method: 'POST' }),
  search: (q: string) => request<SearchResult[]>(`/songless/search?q=${encodeURIComponent(q)}`),
  audioUrl: (id: number, step: number) => `/api/songless/${id}/audio?step=${step}`,
};

export const blindtestApi = {
  start: (body: { source_id: number; rounds: number; answer_mode: Blindtest['answer_mode']; hits: boolean }) =>
    request<Blindtest>('/blindtest/start', { method: 'POST', body }),
  get: (id: number) => request<Blindtest>(`/blindtest/${id}`),
  audioUrl: (id: number, round: number) => `/api/blindtest/${id}/audio?round=${round}`,
  answer: (id: number, body: { deezer_id?: number; choice?: number; give_up?: boolean }) =>
    request<Blindtest>(`/blindtest/${id}/answer`, { method: 'POST', body }),
  next: (id: number) => request<Blindtest>(`/blindtest/${id}/next`, { method: 'POST' }),
};

export const sourcesApi = {
  list: () => request<UserSource[]>('/sources'),
  create: (kind: SourceKind, ref: string, isPublic: boolean) =>
    request<UserSource>('/sources', { method: 'POST', body: { kind, ref, is_public: isPublic } }),
  setPublic: (id: number, isPublic: boolean) => request<void>(`/sources/${id}`, { method: 'PATCH', body: { is_public: isPublic } }),
  tracks: (id: number) => request<{ tracks: SourceTrack[]; missing: MissingTrack[] }>(`/sources/${id}/tracks`),
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
  board: (game: BoardGame, period: BoardPeriod) =>
    request<{ game: BoardGame; period: BoardPeriod; rows: BoardRow[] }>(`/leaderboard?game=${game}&period=${period}`),
  records: (game: BoardGame, period: BoardPeriod) => request<RecordEntry[]>(`/leaderboard/records?game=${game}&period=${period}`),
};

export const playersApi = {
  // By username (profile URLs) or numeric id.
  get: (ref: string | number, period: BoardPeriod = 'all') =>
    request<PlayerProfile>(`/players/${encodeURIComponent(String(ref))}?period=${period}`),
  progress: (id: number, game: BoardGame, period: BoardPeriod) =>
    request<DayPoints[]>(`/players/${id}/progress?game=${game}&period=${period}`),
};

export const historyApi = {
  get: () => request<History>('/history'),
};

export const deezerApi = {
  link: (ref: string) => request<{ id: number; name: string }>('/deezer/link', { method: 'POST', body: { ref } }),
  unlink: () => request<void>('/deezer/link', { method: 'DELETE' }),
  playlists: () => request<DeezerPlaylist[]>('/deezer/playlists'),
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
  updateUser: (id: number, body: Partial<{ username: string; display_name: string; is_admin: boolean; disabled: boolean; reset_password: true }>) =>
    request<{ password?: string }>(`/admin/users/${id}`, { method: 'PATCH', body }),
  deleteUser: (id: number) => request<void>(`/admin/users/${id}`, { method: 'DELETE' }),
};
