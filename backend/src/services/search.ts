import { searchTracks } from './deezer.js';
import { normalizeArtist, normalizeTitle } from './tracks.js';

// Autocomplete for guesses. Deezer search is noisy (covers, karaoke…), so
// results are de-duplicated on normalised title+artist, most popular first.
export async function searchSongs(query: string) {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return [];
  const results = await searchTracks(q, 25);
  const seen = new Set<string>();
  return results
    .sort((a, b) => b.rank - a.rank)
    .filter((t) => {
      const key = `${normalizeTitle(t.title_short || t.title)}|${normalizeArtist(t.artist.name)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8)
    .map((t) => ({
      deezer_id: t.id,
      title: t.title_short || t.title,
      artist: t.artist.name,
      album: t.album.title,
      cover: t.album.cover_small ?? null,
    }));
}
