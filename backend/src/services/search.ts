import { getArtistTop, searchArtists, searchTracks, type DeezerTrack } from './deezer.js';
import { normalizeArtist, normalizeTitle } from './tracks.js';

const MAX_RESULTS = 60;

// Re-uploads that only clutter the list: never the answer, and another release
// of the real song is accepted anyway.
const NOISE = /\b(sped ?up|slowed|nightcore|karaok[eé]|8d audio|reverb|tiktok version|made famous by|in the style of)\b/i;

// Typing pauses fire the same queries again and again: cache them briefly to
// spare the Deezer quota shared with playlist imports.
const cache = new Map<string, { at: number; data: SearchSong[] }>();
const CACHE_TTL = 10 * 60 * 1000;
const CACHE_MAX = 300;

export interface SearchSong {
  deezer_id: number;
  title: string;
  artist: string;
  album: string;
  cover: string | null;
}

// Autocomplete for guesses. Deezer's track search alone misses most of an
// artist's catalogue ("woody" returns a handful of tracks), so when the query
// names an artist, that artist's top tracks come first. Results are
// de-duplicated on normalised title+artist, in relevance order.
export async function searchSongs(query: string): Promise<SearchSong[]> {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.data;

  const [tracks, artists] = await Promise.all([searchTracks(q, 100), searchArtists(q, 3)]);
  const wanted = normalizeArtist(q);
  const artist = artists.find((a) => normalizeArtist(a.name) === wanted || normalizeArtist(a.name).startsWith(wanted));
  const top = artist ? await getArtistTop(artist.id, 50).catch(() => []) : [];

  const seen = new Set<string>();
  const data = [...top, ...tracks]
    .filter((t: DeezerTrack) => {
      const title = t.title_short || t.title;
      if (NOISE.test(`${t.title} ${t.album?.title ?? ''}`)) return false;
      const k = `${normalizeTitle(title)}|${normalizeArtist(t.artist.name)}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, MAX_RESULTS)
    .map((t) => ({
      deezer_id: t.id,
      title: t.title_short || t.title,
      artist: t.artist.name,
      album: t.album.title,
      cover: t.album.cover_small ?? null,
    }));

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), data });
  return data;
}
