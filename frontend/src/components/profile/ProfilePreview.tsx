import { Avatar } from '../shared/Avatar';
import { panel } from '../shared/ui';
import type { Me } from '../../types';
import type { Favorite } from './PresentationSection';

// The public profile's head as friends will see it, updated while typing.
export function ProfilePreview({ me, bio, favorites }: { me: Me; bio: string; favorites: Favorite[] }) {
  return (
    <section>
      <div className={`${panel} p-5`}>
        <div className="flex items-center gap-3">
          <Avatar url={me.avatar_url} name={me.display_name} size="lg" />
          <div className="min-w-0">
            <p className="font-bold text-neutral-900 truncate">{me.display_name}</p>
            <p className="text-xs text-neutral-400 truncate">@{me.username}</p>
          </div>
        </div>
        <p className={`mt-3 text-sm break-words whitespace-pre-line ${bio.trim() ? 'text-neutral-700' : 'text-neutral-300 italic'}`}>
          {bio.trim() || 'Pas encore de bio.'}
        </p>
        <div className="mt-4 grid grid-cols-5 gap-1.5">
          {Array.from({ length: 5 }, (_, i) => {
            const f = favorites[i];
            return f?.cover_url
              ? <img key={i} src={f.cover_url} alt={f.title} title={`${f.title} — ${f.artist}`} className="w-full aspect-square rounded-md object-cover" />
              : <span key={i} className={`w-full aspect-square rounded-md ${f ? 'bg-neutral-200' : 'border border-dashed border-neutral-200'}`} />;
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-neutral-400">Morceaux favoris</p>
      </div>
    </section>
  );
}
