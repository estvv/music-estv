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
-- Set when the password was generated (account creation, reset): the admin
-- knows it, so the user must pick their own before using the app.
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

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

-- Profile: a short bio and a favourite song shown on the player's page.
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS favorite_track_id INTEGER REFERENCES tracks(id) ON DELETE SET NULL;
-- Up to 5 favourite songs, in the player's order. favorite_track_id above is
-- the former single favourite, copied here once and no longer used.
CREATE TABLE IF NOT EXISTS user_favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 0 AND 4),
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, position),
  UNIQUE (user_id, track_id)
);
INSERT INTO user_favorites (user_id, position, track_id)
  SELECT id, 0, favorite_track_id FROM users WHERE favorite_track_id IS NOT NULL
  ON CONFLICT DO NOTHING;
-- Uploaded profile picture (resized by the browser, a few dozen KB); when
-- absent, the Spotify picture is used (spotify_links.spotify_image).
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar BYTEA;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_type TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_updated_at TIMESTAMPTZ;
-- NULL: not fetched yet; '' : the account has no picture.
ALTER TABLE spotify_links ADD COLUMN IF NOT EXISTS spotify_image TEXT;

-- A Deezer profile linked by its public URL: Deezer no longer issues API keys,
-- so there is no OAuth, only what the profile shows publicly.
CREATE TABLE IF NOT EXISTS deezer_links (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  deezer_user_id BIGINT NOT NULL,
  name TEXT NOT NULL,
  image TEXT,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
-- Order in the original playlist (likes: most recent first).
ALTER TABLE source_tracks ADD COLUMN IF NOT EXISTS position INTEGER;
-- Tracks of the original playlist that have no playable Deezer equivalent,
-- kept to show the user what was left out, and the original size.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS missing JSONB NOT NULL DEFAULT '[]';
ALTER TABLE sources ADD COLUMN IF NOT EXISTS source_size INTEGER;
-- Private playlists are visible and playable by their owner only.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT true;
-- Playlist cover (Deezer/Spotify), or the Spotify profile picture for likes.
ALTER TABLE sources ADD COLUMN IF NOT EXISTS image_url TEXT;
-- A playlist is unique per owner, not site-wide: someone else's private copy
-- must not block (or reveal itself to) a new import of the same playlist.
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_kind_ref_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_sources_owner_ref ON sources (kind, ref, owner_id);

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
-- Songless went from 7 attempts (0.1 s to 16 s) to 4 (0.5 s to 10 s). Games of
-- the old format (steps_total still NULL) are converted once: attempts 1-2 -> 1,
-- 3-4 -> 2, 5-6 -> 3, 7 -> 4, and the score recomputed out of 4.
ALTER TABLE songless_games ADD COLUMN IF NOT EXISTS steps_total SMALLINT;
UPDATE songless_games SET
  step = CASE WHEN step <= 1 THEN 0 WHEN step <= 3 THEN 1 WHEN step <= 5 THEN 2 ELSE 3 END,
  score = CASE WHEN status = 'won' THEN 4 - (CASE WHEN step <= 1 THEN 0 WHEN step <= 3 THEN 1 WHEN step <= 5 THEN 2 ELSE 3 END) ELSE 0 END,
  steps_total = 4
WHERE steps_total IS NULL;
ALTER TABLE songless_games ALTER COLUMN steps_total SET DEFAULT 4;

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
