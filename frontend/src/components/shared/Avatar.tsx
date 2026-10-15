import { useState } from 'react';
import { UserIcon } from './icons';

const SIZES = {
  xs: { box: 'w-7 h-7', icon: 'w-4 h-4' },
  sm: { box: 'w-8 h-8', icon: 'w-4 h-4' },
  md: { box: 'w-9 h-9', icon: 'w-5 h-5' },
  lg: { box: 'w-14 h-14', icon: 'w-7 h-7' },
  xl: { box: 'w-20 h-20', icon: 'w-10 h-10' },
};

// A player's picture (uploaded, else their Spotify one); without any, or if it
// fails to load, a neutral user icon.
export function Avatar({ url, name, size = 'md' }: { url?: string | null; name?: string; size?: keyof typeof SIZES }) {
  const [broken, setBroken] = useState<string | null>(null);
  const s = SIZES[size];
  if (url && broken !== url) {
    return <img src={url} alt={name ?? ''} onError={() => setBroken(url)} className={`${s.box} shrink-0 rounded-full object-cover bg-neutral-100`} />;
  }
  return (
    <span className={`${s.box} shrink-0 rounded-full bg-neutral-200 text-neutral-500 flex items-center justify-center`} aria-label={name}>
      <UserIcon className={s.icon} />
    </span>
  );
}
