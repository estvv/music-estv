import { HeartIcon, ListIcon, MusicIcon } from '../shared/icons';
import { IconTile } from '../shared/ui';
import type { SourceKind } from '../../types';

// Deezer playlists in violet, Spotify playlists in green, liked tracks in rose.
export function SourceTile({ kind }: { kind: SourceKind }) {
  if (kind === 'deezer_playlist') return <IconTile icon={<ListIcon />} accent="violet" />;
  if (kind === 'spotify_playlist') return <IconTile icon={<MusicIcon />} accent="emerald" />;
  return <IconTile icon={<HeartIcon />} accent="rose" />;
}
