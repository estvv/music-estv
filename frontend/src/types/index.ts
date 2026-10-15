export interface Me {
  id: number;
  username: string;
  display_name: string;
  is_admin: boolean;
  must_change_password: boolean;
  avatar_url: string | null;
  // True when the picture is an upload; false for the Spotify one or none.
  avatar_custom: boolean;
  spotify: { name: string | null; id: string } | null;
  // Linked by its public profile URL (no OAuth with Deezer).
  deezer: { name: string; id: number } | null;
  spotify_available: boolean;
}

export type Guess =
  | { kind: 'skip' }
  | { kind: 'hint'; label: string; text: string }
  | { kind: 'wrong' | 'right'; title: string; artist: string };

export interface GameState {
  id: number;
  // Games from before the daily modes were retired keep their mode.
  mode: 'daily' | 'daily_personal' | 'free';
  day: string | null;
  step: number;
  steps_ms: number[];
  unlocked_ms: number;
  guesses: Guess[];
  status: 'playing' | 'won' | 'lost';
  score: number;
  source_id: number | null;
  answer: {
    title: string;
    artist: string;
    album: string | null;
    cover_url: string | null;
    deezer_id: number;
    spotify_id: string | null;
  } | null;
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
  owner_id: number | null;
  owner_name: string | null;
  track_count: number;
  synced_at: string | null;
  sync: { done: number; total: number; error?: string } | null;
  mine: boolean;
  is_public: boolean;
  deezer_id: string | null;
  image_url: string | null;
  spotify_id: string | null;
  // Size of the original playlist, and how many of its tracks Deezer lacks.
  source_size: number | null;
  missing_count: number;
}

export interface RevealedTrack {
  title: string;
  artist: string;
  cover_url: string | null;
  deezer_id: number;
  spotify_id: string | null;
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
  source_id: number | null;
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

export type HistoryItem =
  | {
    game: 'songless'; id: number; status: 'won' | 'lost'; step: number; score: number; finished_at: string;
    title: string; artist: string; cover_url: string | null; source_name: string | null;
  }
  | { game: 'blindtest'; id: number; score: number; total: number; finished_at: string; source_name: string | null };

export interface History {
  recent: HistoryItem[];
  playing: { id: number; step: number; source_name: string } | null;
}

export type BoardGame = 'songless' | 'blindtest' | 'party';
export type BoardPeriod = 'week' | 'month' | 'all';

interface BoardBase { user_id: number; username: string; display_name: string; avatar_url: string | null; points: number; played: number }
export interface SonglessBoardRow extends BoardBase { won: number; first_try: number; avg_attempts: number | null }
export interface BlindtestBoardRow extends BoardBase { best: number; found: number; tracks: number; per_track: number | null }
export interface PartyBoardRow extends BoardBase { wins: number; podiums: number }
export type BoardRow = SonglessBoardRow | BlindtestBoardRow | PartyBoardRow;

export interface RecordEntry {
  key: string;
  label: string;
  value: string;
  user_id: number;
  username: string;
  avatar_url: string | null;
  display_name: string;
  detail: string | null;
}

export interface SonglessStats {
  points: number; played: number; won: number; lost: number; first_try: number;
  avg_attempts: number | null; distribution: number[]; best_streak: number;
}
export interface BlindtestStats {
  points: number; played: number; best: number; found: number; tracks: number;
  per_track: number | null; fastest_ms: number | null; best_streak: number;
}
export interface PartyStats { played: number; wins: number; podiums: number; points: number }

export interface FavoriteTrack {
  deezer_id: number;
  title: string;
  artist: string;
  cover_url: string | null;
  spotify_id: string | null;
}

export interface PlayerProfile {
  player: {
    id: number;
    username: string;
    display_name: string;
    avatar_url: string | null;
    bio: string | null;
    created_at: string;
    // Up to 5, in the player's order.
    favorites: FavoriteTrack[];
  };
  stats: { songless: SonglessStats; blindtest: BlindtestStats; party: PartyStats };
  recent: HistoryItem[];
}

export interface DayPoints { day: string; points: number }

export interface SourceTrack {
  deezer_id: number;
  spotify_id: string | null;
  title: string;
  artist: string;
  album: string | null;
  cover_url: string | null;
}

export interface MissingTrack {
  title: string;
  artist: string;
  spotify_id: string | null;
}

export interface DeezerPlaylist {
  id: string;
  name: string;
  total: number;
  image: string | null;
  loved: boolean;
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
  must_change_password: boolean;
  avatar_url: string | null;
  created_at: string;
  spotify_name: string | null;
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
