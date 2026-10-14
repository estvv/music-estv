// One accent colour per game, used everywhere that game appears (card, icon
// tile, badge, progress). Literal class strings so Tailwind's scanner sees them,
// same approach as quizz-estv's category colours.
export type Accent = 'emerald' | 'teal' | 'blue' | 'violet' | 'rose' | 'amber' | 'neutral';

export interface AccentClasses {
  tile: string; // icon square
  border: string; // card border
  badge: string; // small pill
  solid: string; // bars, filled dots
  text: string;
  ring: string; // selected state
}

export const ACCENTS: Record<Accent, AccentClasses> = {
  emerald: { tile: 'bg-emerald-50 text-emerald-600', border: 'border-emerald-200', badge: 'bg-emerald-50 text-emerald-700', solid: 'bg-emerald-500', text: 'text-emerald-700', ring: 'ring-emerald-500' },
  teal: { tile: 'bg-teal-50 text-teal-600', border: 'border-teal-200', badge: 'bg-teal-50 text-teal-700', solid: 'bg-teal-500', text: 'text-teal-700', ring: 'ring-teal-500' },
  blue: { tile: 'bg-blue-50 text-blue-600', border: 'border-blue-200', badge: 'bg-blue-50 text-blue-700', solid: 'bg-blue-500', text: 'text-blue-700', ring: 'ring-blue-500' },
  violet: { tile: 'bg-violet-50 text-violet-600', border: 'border-violet-200', badge: 'bg-violet-50 text-violet-700', solid: 'bg-violet-500', text: 'text-violet-700', ring: 'ring-violet-500' },
  rose: { tile: 'bg-rose-50 text-rose-600', border: 'border-rose-200', badge: 'bg-rose-50 text-rose-700', solid: 'bg-rose-500', text: 'text-rose-700', ring: 'ring-rose-500' },
  amber: { tile: 'bg-amber-50 text-amber-600', border: 'border-amber-200', badge: 'bg-amber-50 text-amber-700', solid: 'bg-amber-500', text: 'text-amber-700', ring: 'ring-amber-500' },
  neutral: { tile: 'bg-neutral-100 text-neutral-600', border: 'border-neutral-200', badge: 'bg-neutral-100 text-neutral-600', solid: 'bg-neutral-500', text: 'text-neutral-700', ring: 'ring-neutral-500' },
};

export const GAME_ACCENT = {
  daily: 'emerald',
  daily_personal: 'teal',
  free: 'blue',
  blindtest: 'violet',
  party: 'rose',
  wholiked: 'amber',
  songless: 'blue',
} as const satisfies Record<string, Accent>;

export const accent = (a: Accent) => ACCENTS[a];

// Answer choices in party rooms: the same colour on the TV and on the phones,
// so players match "the blue one" at a glance.
export const CHOICE_STYLES = [
  { tile: 'bg-violet-50 border-violet-200', dot: 'bg-violet-500' },
  { tile: 'bg-blue-50 border-blue-200', dot: 'bg-blue-500' },
  { tile: 'bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  { tile: 'bg-emerald-50 border-emerald-200', dot: 'bg-emerald-500' },
  { tile: 'bg-rose-50 border-rose-200', dot: 'bg-rose-500' },
  { tile: 'bg-teal-50 border-teal-200', dot: 'bg-teal-500' },
];
export const choiceStyle = (index: number) => CHOICE_STYLES[index % CHOICE_STYLES.length];
