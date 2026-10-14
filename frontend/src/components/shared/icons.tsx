// Stroke icons in the same style as quizz-estv's study modes (24px grid,
// 1.75 stroke, round caps).
const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.75,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

type IconProps = { className?: string };
const cls = (className?: string) => className ?? 'w-5 h-5';

export const CalendarIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 9.5h17M8 3v4M16 3v4" /><path d="M9 14.5l2 2 4-4" /></svg>
);
export const HeadphonesIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4.5" height="6.5" rx="1.5" /><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5" /></svg>
);
export const ShuffleIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M16 4h4v4M20 4l-6.5 6.5M16 20h4v-4M20 20l-5-5M4 4l5 5M4 20l7.5-7.5" /></svg>
);
export const BoltIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M13 2.5 4.5 13.5H12l-1 8 8.5-11H12z" /></svg>
);
export const UsersIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></svg>
);
export const HeartIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z" /></svg>
);
export const MusicIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M9 18V5.5l11-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></svg>
);
export const ListIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M9 6h11M9 12h11M9 18h7" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></svg>
);
export const TrophyIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4.5a2.5 2.5 0 0 0 2.6 4M17 6h2.5a2.5 2.5 0 0 1-2.6 4M12 14v3.5M8.5 20.5h7M9.5 17.5h5v3h-5z" /></svg>
);
export const FlameIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M12 21a6 6 0 0 0 6-6c0-4-3-6-4-9-1 2-2 3-3.5 3.5C9 7 9 5 9.5 3 6.5 5 6 9.5 6 11.5V15a6 6 0 0 0 6 6Z" /></svg>
);
export const LogoutIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4" /></svg>
);
export const PlayIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cls(className)}><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
);
export const PauseIcon = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cls(className)}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
);
export const LockIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><rect x="4.5" y="10.5" width="15" height="10" rx="2" /><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" /></svg>
);
export const ShieldIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M12 3 4.5 6v5.5c0 4.5 3.2 8 7.5 9.5 4.3-1.5 7.5-5 7.5-9.5V6z" /><path d="M9 12l2 2 4-4" /></svg>
);
