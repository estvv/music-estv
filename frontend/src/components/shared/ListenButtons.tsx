import { DeezerLogo, SpotifyLogo } from './icons';

const linkClass = 'inline-flex items-center justify-center gap-1.5 py-1 rounded-md border text-xs font-semibold transition-colors';

// "Listen on" links in each service's colours: pastel fill, dark text, darker
// border, the logo in its real colour. `compact` keeps only the logos and
// shares the width between them, for narrow cards.
export function ListenButtons({ deezerId, spotifyId, compact = false }: {
  deezerId: number;
  spotifyId?: string | null;
  compact?: boolean;
}) {
  const size = compact ? 'min-w-0 px-2' : 'px-2.5';
  return (
    // Compact: two fixed halves, so Deezer keeps its size without Spotify.
    <div className={compact ? 'grid grid-cols-2 gap-2' : 'flex gap-2'}>
      <a
        href={`https://www.deezer.com/track/${deezerId}`}
        target="_blank"
        rel="noreferrer"
        title="Écouter sur Deezer"
        aria-label="Écouter sur Deezer"
        className={`${linkClass} ${size} bg-violet-50 text-violet-700 border-violet-800 hover:bg-violet-100`}
      >
        <DeezerLogo className="w-3.5 h-3.5 text-[#a238ff]" />{!compact && 'Deezer'}
      </a>
      {spotifyId && (
        <a
          href={`https://open.spotify.com/track/${spotifyId}`}
          target="_blank"
          rel="noreferrer"
          title="Écouter sur Spotify"
          aria-label="Écouter sur Spotify"
          className={`${linkClass} ${size} bg-emerald-50 text-emerald-700 border-emerald-800 hover:bg-emerald-100`}
        >
          <SpotifyLogo className="w-3.5 h-3.5 text-[#1db954]" />{!compact && 'Spotify'}
        </a>
      )}
    </div>
  );
}
