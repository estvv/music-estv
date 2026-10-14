import { accent, type Accent } from '../../utils/theme';

// Button and panel classes shared across pages, in the house style of the
// other *-estv apps (neutral palette, rounded-lg, emerald for success).
export const primaryButton =
  'px-4 py-2 rounded-lg bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const secondaryButton =
  'px-4 py-2 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
export const ghostButton =
  'px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 hover:bg-neutral-50 rounded-lg transition-colors';
export const panel = 'rounded-xl border border-neutral-200 bg-white shadow-sm';
// Clickable card: same lift-on-hover as quizz-estv's category cards.
export const card = `${panel} hover:shadow-md hover:-translate-y-0.5 transition-all`;

export function LoadingState() {
  return (
    <div className="text-center py-12">
      <p className="text-neutral-400 text-sm">Chargement…</p>
    </div>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-red-600">{children}</p>;
}

export function Page({ children, width = 'md' }: { children: React.ReactNode; width?: 'md' | 'lg' }) {
  return <main className={`${width === 'lg' ? 'max-w-5xl' : 'max-w-3xl'} mx-auto px-4 py-8 md:py-10`}>{children}</main>;
}

export function IconTile({ icon, accent: a, size = 'md' }: { icon: React.ReactNode; accent: Accent; size?: 'md' | 'lg' }) {
  return (
    <span className={`${size === 'lg' ? 'w-12 h-12' : 'w-10 h-10'} shrink-0 rounded-lg flex items-center justify-center ${accent(a).tile}`}>
      {icon}
    </span>
  );
}

export function Badge({ children, accent: a = 'neutral' }: { children: React.ReactNode; accent?: Accent }) {
  return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${accent(a).badge}`}>{children}</span>;
}

export function PageHeader({ title, subtitle, icon, accent: a = 'neutral', actions }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: React.ReactNode;
  accent?: Accent;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4 mb-8">
      {icon && <IconTile icon={icon} accent={a} size="lg" />}
      <div className="flex-1 min-w-0">
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 truncate">{title}</h1>
        {subtitle && <p className="text-neutral-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="shrink-0 flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-3 mt-10 first:mt-0">
      <h2 className="text-sm font-semibold text-neutral-500">{children}</h2>
      {aside}
    </div>
  );
}
