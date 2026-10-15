import { useState } from 'react';
import { HeartIcon, ListIcon, MusicIcon } from '../shared/icons';
import { IconTile } from '../shared/ui';
import type { SourceKind } from '../../types';

// The playlist's cover when we have one (likes show the Spotify profile
// picture, hence round); otherwise a coloured icon: Deezer playlists in violet,
// Spotify playlists in green, liked tracks in rose.
export function SourceTile({ kind, image }: { kind: SourceKind; image?: string | null }) {
  const [broken, setBroken] = useState(false);
  if (image && !broken) {
    return (
      <img
        src={image}
        alt=""
        loading="lazy"
        onError={() => setBroken(true)}
        className={`w-10 h-10 shrink-0 object-cover bg-neutral-100 ${kind === 'spotify_liked' ? 'rounded-full' : 'rounded-lg'}`}
      />
    );
  }
  if (kind === 'deezer_playlist') return <IconTile icon={<ListIcon />} accent="violet" />;
  if (kind === 'spotify_playlist') return <IconTile icon={<MusicIcon />} accent="emerald" />;
  return <IconTile icon={<HeartIcon />} accent="rose" />;
}
