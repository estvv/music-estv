CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL,
  display_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  disabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Usernames are case-insensitive: "Estv" and "estv" are the same account.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users (lower(username));

-- Only the sha256 of the session token is stored: a DB leak does not leak sessions.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

CREATE TABLE IF NOT EXISTS spotify_links (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  spotify_user_id TEXT NOT NULL,
  spotify_name TEXT,
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  scope TEXT NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catalogue cache. A track is keyed on its Deezer id because Deezer serves the
-- audio; spotify_id/isrc are filled when the track came from Spotify.
CREATE TABLE IF NOT EXISTS tracks (
  id SERIAL PRIMARY KEY,
  deezer_id BIGINT NOT NULL UNIQUE,
  isrc TEXT,
  spotify_id TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  cover_url TEXT,
  duration INTEGER,
  rank INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tracks_spotify ON tracks(spotify_id);

CREATE TABLE IF NOT EXISTS sources (
  id SERIAL PRIMARY KEY,
  -- spotify_liked: the owner's liked tracks (ref = spotify user id).
  kind TEXT NOT NULL CHECK (kind IN ('deezer_playlist', 'spotify_playlist', 'spotify_liked')),
  ref TEXT NOT NULL,
  name TEXT NOT NULL,
  in_daily_pool BOOLEAN NOT NULL DEFAULT false,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (kind, ref)
);

CREATE TABLE IF NOT EXISTS source_tracks (
  source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  PRIMARY KEY (source_id, track_id)
);

-- scope is 'global' or 'user:<id>' (personal daily).
CREATE TABLE IF NOT EXISTS daily_puzzles (
  day DATE NOT NULL,
  scope TEXT NOT NULL,
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  PRIMARY KEY (day, scope)
);

CREATE TABLE IF NOT EXISTS songless_games (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('daily', 'daily_personal', 'free')),
  day DATE,
  source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  track_id INTEGER NOT NULL REFERENCES tracks(id),
  step INTEGER NOT NULL DEFAULT 0,
  guesses TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'won', 'lost')),
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_daily ON songless_games(user_id, mode, day) WHERE day IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_games_mode_day ON songless_games(mode, day);

-- One blind test run. `rounds` is a JSON array of
-- { track_id, choices: track_id[] | null, started_at: ms | null, result: {...} | null }.
CREATE TABLE IF NOT EXISTS blindtests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
  answer_mode TEXT NOT NULL CHECK (answer_mode IN ('type', 'mcq')),
  rounds TEXT NOT NULL,
  current INTEGER NOT NULL DEFAULT 0,
  score INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'playing' CHECK (status IN ('playing', 'finished')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_blindtests_user ON blindtests(user_id);

-- Final standings of party rooms, for account players only (guests are anonymous).
CREATE TABLE IF NOT EXISTS party_results (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_code TEXT NOT NULL,
  game TEXT NOT NULL,
  score INTEGER NOT NULL,
  rank INTEGER NOT NULL,
  players INTEGER NOT NULL,
  played_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_party_results_user ON party_results(user_id);
