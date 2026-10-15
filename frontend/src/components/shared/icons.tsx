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
export const BulbIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M9 18h6M10 21h4" /><path d="M8.5 14.5A6 6 0 1 1 15.5 14.5c-.9.7-1.5 1.6-1.5 2.5h-4c0-.9-.6-1.8-1.5-2.5Z" /></svg>
);
export const FlagIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M5 21V4M5 4h11l-2 4 2 4H5" /></svg>
);
export const SearchIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4" /></svg>
);
export const CheckIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
export const ChevronDownIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="m6 9 6 6 6-6" /></svg>
);
export const PlusIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M12 5v14M5 12h14" /></svg>
);
export const RefreshIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M20 12a8 8 0 0 1-14.3 4.9M4 12a8 8 0 0 1 14.3-4.9" /><path d="M18.5 3v4.5H14M5.5 21v-4.5H10" /></svg>
);
export const TrashIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
);
export const GlobeIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.5 2.7 3.5 5.5 3.5 8.5s-1 5.8-3.5 8.5c-2.5-2.7-3.5-5.5-3.5-8.5s1-5.8 3.5-8.5Z" /></svg>
);

// Official brand marks (paths from simple-icons: Spotify and Apple Music from
// v13.21.0, Deezer from v9.0.0, its last release carrying it). Filled, unlike the icons above.
export const SpotifyLogo = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cls(className)}>
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
  </svg>
);
export const DeezerLogo = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cls(className)}>
    <path d="M18.81 4.16v3.03H24V4.16h-5.19zM6.27 8.38v3.027h5.189V8.38h-5.19zm12.54 0v3.027H24V8.38h-5.19zM6.27 12.594v3.027h5.189v-3.027h-5.19zm6.271 0v3.027h5.19v-3.027h-5.19zm6.27 0v3.027H24v-3.027h-5.19zM0 16.81v3.029h5.19v-3.03H0zm6.27 0v3.029h5.189v-3.03h-5.19zm6.271 0v3.029h5.19v-3.03h-5.19zm6.27 0v3.029H24v-3.03h-5.19Z" />
  </svg>
);
export const UserIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><circle cx="12" cy="8.5" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></svg>
);
export const PencilIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M14.5 5.5l4 4M4 20l1-5L15.5 4.5a2.1 2.1 0 0 1 3 0l1 1a2.1 2.1 0 0 1 0 3L9 19z" /></svg>
);
export const EyeIcon = ({ className }: IconProps) => (
  <svg {...base} className={cls(className)}><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12Z" /><circle cx="12" cy="12" r="3" /></svg>
);
export const AppleMusicLogo = ({ className }: IconProps) => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={cls(className)}>
    <path d="M23.994 6.124a9.23 9.23 0 00-.24-2.19c-.317-1.31-1.062-2.31-2.18-3.043a5.022 5.022 0 00-1.877-.726 10.496 10.496 0 00-1.564-.15c-.04-.003-.083-.01-.124-.013H5.986c-.152.01-.303.017-.455.026-.747.043-1.49.123-2.193.4-1.336.53-2.3 1.452-2.865 2.78-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03a12.5 12.5 0 001.57-.1c.822-.106 1.596-.35 2.295-.81a5.046 5.046 0 001.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76.962-1.388 1.14-.35.1-.706.157-1.07.173-.95.045-1.773-.6-1.943-1.536a1.88 1.88 0 011.038-2.022c.323-.16.67-.25 1.018-.324.378-.082.758-.153 1.134-.24.274-.063.457-.23.51-.516a.904.904 0 00.02-.193c0-1.815 0-3.63-.002-5.443a.725.725 0 00-.026-.185c-.04-.15-.15-.243-.304-.234-.16.01-.318.035-.475.066-.76.15-1.52.303-2.28.456l-2.325.47-1.374.278c-.016.003-.032.01-.048.013-.277.077-.377.203-.39.49-.002.042 0 .086 0 .13-.002 2.602 0 5.204-.003 7.805 0 .42-.047.836-.215 1.227-.278.64-.77 1.04-1.434 1.233-.35.1-.71.16-1.075.172-.96.036-1.755-.6-1.92-1.544-.14-.812.23-1.685 1.154-2.075.357-.15.73-.232 1.108-.31.287-.06.575-.116.86-.177.383-.083.583-.323.6-.714v-.15c0-2.96 0-5.922.002-8.882 0-.123.013-.25.042-.37.07-.285.273-.448.546-.518.255-.066.515-.112.774-.165.733-.15 1.466-.296 2.2-.444l2.27-.46c.67-.134 1.34-.27 2.01-.403.22-.043.442-.088.663-.106.31-.025.523.17.554.482.008.073.012.148.012.223.002 1.91.002 3.822 0 5.732z" />
  </svg>
);
