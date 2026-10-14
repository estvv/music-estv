import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallbackForDev?: string): string {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV !== 'production' && fallbackForDev !== undefined) return fallbackForDev;
  console.error(`FATAL: missing environment variable ${name}`);
  process.exit(1);
}

export const config = {
  port: Number(process.env.PORT || 3013),
  // Dev default: the `db` container exposed on 127.0.0.1:5434 by
  // docker-compose.override.yml. Tests use the same server (own schema per file).
  databaseUrl: required('DATABASE_URL', 'postgres://music:music@127.0.0.1:5434/music'),
  // Public origin of the site (scheme + host, no trailing slash). Used for the
  // Spotify redirect URI and the Origin check on mutations.
  publicUrl: (process.env.PUBLIC_URL || 'http://127.0.0.1:5173').replace(/\/$/, ''),
  cookieSecure: process.env.COOKIE_SECURE !== '0' && process.env.NODE_ENV === 'production',
  // 32-byte hex key for AES-256-GCM encryption of Spotify tokens at rest.
  tokenKey: required('TOKEN_ENCRYPTION_KEY', '0'.repeat(64)),
  spotify: {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  },
};

export const spotifyEnabled = () => Boolean(config.spotify.clientId && config.spotify.clientSecret);
