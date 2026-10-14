// Thin client for the public Deezer API (no auth). Deezer allows ~50 requests
// per 5 s per IP; a tiny sliding-window limiter keeps us well under that.

const API = 'https://api.deezer.com';
const WINDOW_MS = 5000;
const MAX_PER_WINDOW = 40;
const sent: number[] = [];

async function throttle() {
  for (;;) {
    const now = Date.now();
    while (sent.length && now - sent[0] > WINDOW_MS) sent.shift();
    if (sent.length < MAX_PER_WINDOW) {
      sent.push(now);
      return;
    }
    await new Promise((r) => setTimeout(r, WINDOW_MS - (now - sent[0]) + 10));
  }
}

export class DeezerError extends Error {}

async function get<T>(path: string): Promise<T> {
  await throttle();
  const res = await fetch(`${API}${path}`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new DeezerError(`Deezer HTTP ${res.status}`);
  const body = await res.json() as T & { error?: { message?: string } };
  if (body && typeof body === 'object' && 'error' in body && body.error) {
    throw new DeezerError(`Deezer: ${body.error.message ?? 'error'}`);
  }
  return body;
}

export interface DeezerTrack {
  id: number;
  readable: boolean;
  title: string;
  title_short: string;
  isrc?: string;
  duration: number;
  rank: number;
  preview: string;
  artist: { id: number; name: string };
  album: { id: number; title: string; cover_small?: string; cover_medium?: string; cover_big?: string };
}

const playable = (t: DeezerTrack) => t.readable !== false && Boolean(t.preview);

export async function searchTracks(query: string, limit = 10): Promise<DeezerTrack[]> {
  const body = await get<{ data: DeezerTrack[] }>(`/search/track?q=${encodeURIComponent(query)}&limit=${limit}`);
  return body.data.filter(playable);
}

export async function getTrack(id: number | `isrc:${string}`): Promise<DeezerTrack> {
  return get<DeezerTrack>(`/track/${id}`);
}

// Resolve a Spotify track to a playable Deezer one: ISRC first, then a strict
// artist+title search. Returns null when Deezer has no playable equivalent.
export async function findPlayable(isrc: string | undefined, title: string, artist: string): Promise<DeezerTrack | null> {
  if (isrc) {
    try {
      const byIsrc = await getTrack(`isrc:${isrc}`);
      if (playable(byIsrc)) return byIsrc;
    } catch (e) {
      if (!(e instanceof DeezerError)) throw e;
    }
  }
  const clean = (s: string) => s.replace(/"/g, '').replace(/\s*[([].*?[)\]]/g, '').replace(/\s+-\s+.*$/, '');
  const results = await searchTracks(`artist:"${clean(artist)}" track:"${clean(title)}"`, 5);
  return results[0] ?? null;
}

export interface DeezerPlaylist {
  id: number;
  title: string;
  nb_tracks: number;
}

export async function getPlaylist(id: string): Promise<DeezerPlaylist> {
  return get<DeezerPlaylist>(`/playlist/${encodeURIComponent(id)}`);
}

export async function getPlaylistTracks(id: string, max = 1000): Promise<DeezerTrack[]> {
  const out: DeezerTrack[] = [];
  for (let index = 0; index < max; index += 100) {
    const page = await get<{ data: DeezerTrack[]; next?: string }>(
      `/playlist/${encodeURIComponent(id)}/tracks?limit=100&index=${index}`,
    );
    out.push(...page.data.filter(playable));
    if (!page.next) break;
  }
  return out;
}

// Accepts a bare id, deezer.com/…/playlist/<id> or a link.deezer.com short link
// that has already been expanded by the caller.
export function parsePlaylistRef(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/deezer\.com\/(?:[a-z]{2}\/)?playlist\/(\d+)/i);
  return match ? match[1] : null;
}

// Preview bytes are cached briefly: one Songless game asks for the same clip up
// to seven times, and the signed CDN URL lives ~15 minutes anyway.
const previewCache = new Map<number, { bytes: Buffer; at: number }>();
const PREVIEW_TTL = 10 * 60 * 1000;
const PREVIEW_CACHE_MAX = 64;

export async function getPreviewBytes(deezerId: number): Promise<Buffer> {
  const hit = previewCache.get(deezerId);
  if (hit && Date.now() - hit.at < PREVIEW_TTL) return hit.bytes;

  const track = await getTrack(deezerId);
  if (!track.preview) throw new DeezerError('No preview available');
  const res = await fetch(track.preview, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new DeezerError(`Preview HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());

  previewCache.set(deezerId, { bytes, at: Date.now() });
  if (previewCache.size > PREVIEW_CACHE_MAX) {
    previewCache.delete(previewCache.keys().next().value!);
  }
  return bytes;
}
