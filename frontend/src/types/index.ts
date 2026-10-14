export interface Me {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  spotify: { name: string | null; id: string } | null;
  spotify_available: boolean;
}

export type Guess =
  | { kind: 'skip' }
  | { kind: 'wrong' | 'right'; title: string; artist: string };

export interface GameState {
  id: number;
  mode: 'daily' | 'daily_personal' | 'free';
  day: string | null;
  step: number;
  steps_ms: number[];
  unlocked_ms: number;
  guesses: Guess[];
  status: 'playing' | 'won' | 'lost';
  score: number;
  answer: {
    title: string;
    artist: string;
    album: string | null;
    cover_url: string | null;
    deezer_id: number;
    spotify_id: string | null;
  } | null;
}

export interface TodayStatus {
  games: { id: number; mode: GameState['mode']; status: GameState['status']; score: number; step: number }[];
  steps: number;
}

export interface SearchResult {
  deezer_id: number;
  title: string;
  artist: string;
  album: string;
  cover: string | null;
}

export type SourceKind = 'deezer_playlist' | 'spotify_playlist' | 'spotify_liked';

export interface UserSource {
  id: number;
  name: string;
  kind: SourceKind;
  in_daily_pool: boolean;
  owner_id: number | null;
  owner_name: string | null;
  track_count: number;
  synced_at: string | null;
  sync: { done: number; total: number; error?: string } | null;
  mine: boolean;
  spotify_id: string | null;
}

export interface RevealedTrack {
  title: string;
  artist: string;
  cover_url: string | null;
  deezer_id: number;
}

export interface BlindtestRoundResult {
  kind: 'right' | 'artist' | 'wrong' | 'timeout';
  points: number;
  elapsed_ms: number;
  guess: { title: string; artist: string } | null;
  answer: RevealedTrack;
}

export interface Blindtest {
  id: number;
  source_name: string;
  answer_mode: 'type' | 'mcq';
  total: number;
  current: number;
  score: number;
  status: 'playing' | 'finished';
  clip_ms: number;
  history: BlindtestRoundResult[];
  round: {
    index: number;
    answered: boolean;
    choices: { index: number; title: string; artist: string }[] | null;
  } | null;
}

export interface DailyRow {
  user_id: number;
  display_name: string;
  status: 'won' | 'lost';
  score: number;
  step: number;
}

export interface AllTimeRow {
  user_id: number;
  display_name: string;
  daily_score: number;
  daily_played: number;
  daily_won: number;
  free_score: number;
  free_played: number;
  party_played: number;
  party_won: number;
  current: number;
  best: number;
}

export interface MyStats {
  played: number;
  won: number;
  lost: number;
  distribution: number[];
  current: number;
  best: number;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  owned: boolean;
  total: number | null;
  image: string | null;
}

export interface AdminUser {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  disabled: boolean;
  created_at: string;
  spotify_name: string | null;
}

export interface AdminSource {
  id: number;
  kind: SourceKind;
  ref: string;
  name: string;
  in_daily_pool: boolean;
  owner_name: string | null;
  track_count: number;
  synced_at: string | null;
  sync: { done: number; total: number; error?: string } | null;
}

export type RoomGame = 'blindtest' | 'wholiked' | 'songless';
export type RoomAnswerMode = 'mcq' | 'type' | 'buzzer';

export interface RoomInfo {
  code: string;
  game: RoomGame;
  answer_mode: RoomAnswerMode;
  host_name: string;
  phase: RoomState['phase'];
}

export interface RoomPlayer {
  id: number;
  name: string;
  score: number;
  connected: boolean;
  answered: boolean;
  account: boolean;
}

export interface RoomState {
  code: string;
  game: RoomGame;
  answer_mode: RoomAnswerMode;
  host_name: string;
  phase: 'lobby' | 'preparing' | 'round' | 'finished';
  error: string | null;
  total: number;
  players: RoomPlayer[];
  round: {
    index: number;
    phase: 'loading' | 'playing' | 'buzzed' | 'reveal';
    clip_ms: number;
    remaining_ms: number | null;
    step: number | null;
    steps: number | null;
    choices: { index: number; title: string; artist: string }[] | null;
    buzzer: { id: number; name: string } | null;
    answered_count: number;
    reveal: {
      answer: { title: string; artist: string; cover_url: string | null };
      owners: string[] | null;
      results: { player_id: number; name: string; kind: BlindtestRoundResult['kind']; points: number }[];
    } | null;
  } | null;
  you: {
    player_id: number;
    result: { kind: BlindtestRoundResult['kind']; points: number } | null;
    locked_out: boolean;
    guessed_this_step: boolean;
  } | null;
}
