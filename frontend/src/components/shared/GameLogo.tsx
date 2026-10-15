import { useState } from 'react';

// A game's logo from /public/games/<slug>.png. Until the file exists, a grey
// square with the game's initial keeps the layout.
export function GameLogo({ slug, name, className = 'w-16 h-16 sm:w-20 sm:h-20' }: { slug: string; name: string; className?: string }) {
  const [missing, setMissing] = useState(false);
  if (missing) {
    return (
      <span className={`${className} rounded-2xl bg-neutral-100 flex items-center justify-center text-2xl font-bold text-neutral-400`}>
        {name.slice(0, 1)}
      </span>
    );
  }
  return <img src={`/games/${slug}.png`} alt="" onError={() => setMissing(true)} className={`${className} object-contain`} />;
}
