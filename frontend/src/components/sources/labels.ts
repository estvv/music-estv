import type { SourceKind } from '../../types';

export function sourceKindLabel(kind: SourceKind): string {
  return kind === 'deezer_playlist' ? 'Playlist Deezer' : kind === 'spotify_playlist' ? 'Playlist Spotify' : 'Likes Spotify';
}
