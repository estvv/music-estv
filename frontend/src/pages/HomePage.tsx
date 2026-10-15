import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { historyApi, leaderboardApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { StartGameModal } from '../components/home/StartGameModal';
import { launchGame, loadLastGame, type GameSettings, type SoloGame } from '../components/home/lastGame';
import { usePlayableSources } from '../components/sources/SourcePicker';
import { card, ErrorText, Page, panel, primaryButton } from '../components/shared/ui';
import { RecentGames } from '../components/stats/RecentGames';
import { Avatar } from '../components/shared/Avatar';
import type { BoardRow, History } from '../types';
import { profilePath } from '../utils/paths';
import { GameLogo } from '../components/shared/GameLogo';

const GAME_NAMES: Record<SoloGame, string> = { songless: 'Songless', blindtest: 'Blind test' };

export function HomePage() {
  const [setup, setSetup] = useState<SoloGame | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [board, setBoard] = useState<BoardRow[] | null>(null);

  useEffect(() => {
    historyApi.get().then(setHistory).catch(() => setHistory({ recent: [], playing: null }));
    leaderboardApi.board('songless', 'all').then((b) => setBoard(b.rows)).catch(() => setBoard([]));
  }, []);

  return (
    <Page width="lg">
      <div className="space-y-6">
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          <GameTile slug="songless" title="Songless" tagline="4 extraits pour trouver" onClick={() => setSetup('songless')} />
          <GameTile slug="blindtest" title="Blind test" tagline="Réponds vite" onClick={() => setSetup('blindtest')} />
          <GameTile slug="soiree" title="Soirée" tagline="Entre amis" to="/party/new" />
        </div>

        <div className="grid lg:grid-cols-3 gap-6 items-start">
          <section className="lg:col-span-2 min-w-0">
            <h2 className="text-sm font-semibold text-neutral-500 mb-3">Dernières parties</h2>
            <RecentGames items={history?.recent ?? null} linkable empty="Pas encore de partie terminée. Lance un Songless ou un blind test au-dessus." />
          </section>
          <section className="min-w-0">
            <div className="flex items-baseline justify-between mb-3">
              <Link to="/leaderboard" className="text-sm font-semibold text-neutral-500">Classement</Link>
            </div>
            <MiniLeaderboard rows={board} />
          </section>
        </div>
      </div>

      {setup && <StartGameModal game={setup} onClose={() => setSetup(null)} />}
    </Page>
  );
}

// --- game tiles ----------------------------------------------------------------

// Logo from /public/games/<slug>.png; until the file exists, a neutral
// placeholder keeps the layout.
function GameTile({ slug, title, tagline, onClick, to }: {
  slug: string;
  title: string;
  tagline: string;
  onClick?: () => void;
  to?: string;
}) {
  const className = `${card} w-full flex flex-col items-center justify-center gap-3 px-3 py-6 sm:py-7 text-center`;
  const content = (
    <>
      <GameLogo slug={slug} name={title} />
      <span>
        <span className="block font-semibold text-neutral-900">{title}</span>
        <span className="hidden sm:block text-xs text-neutral-500 mt-0.5">{tagline}</span>
      </span>
    </>
  );
  return to
    ? <Link to={to} className={className}>{content}</Link>
    : <button type="button" onClick={onClick} className={className}>{content}</button>;
}

// --- replay / resume -------------------------------------------------------------

function describe(s: GameSettings) {
  if (s.game === 'songless') return null;
  return `${s.rounds} morceaux · ${s.answerMode === 'mcq' ? '4 choix' : 'saisie'}${s.hits ? ' · tubes' : ''}`;
}

// One click back into the game: the Songless still in progress first, else the
// last game launched from this browser with the same playlist and settings.
function ReplayBar({ playing }: { playing: History['playing'] }) {
  const navigate = useNavigate();
  const { sources } = usePlayableSources();
  const [last] = useState(loadLastGame);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  const bar = 'flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-neutral-200 bg-white px-4 py-3';

  if (playing) {
    return (
      <div className={bar}>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-neutral-900">Songless en cours</p>
          <p className="text-xs text-neutral-500 truncate">
            {playing.source_name} · {playing.step === 0 ? 'pas encore commencé' : `essai ${playing.step + 1}/4`}
          </p>
        </div>
        <Link to={`/songless/${playing.id}`} className={primaryButton}>Reprendre</Link>
      </div>
    );
  }

  const source = last && sources?.find((s) => s.id === last.sourceId);
  if (!last || !source) return null;

  const replay = async () => {
    setStarting(true);
    setError('');
    try {
      navigate(await launchGame(last));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setStarting(false);
    }
  };

  const details = describe(last);
  return (
    <div className={bar}>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-neutral-900">Rejouer : {GAME_NAMES[last.game]}</p>
        <p className="text-xs text-neutral-500 truncate">{source.name}{details ? ` · ${details}` : ''}</p>
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      <button onClick={replay} disabled={starting} className={primaryButton}>{starting ? 'Lancement…' : 'Lancer'}</button>
    </div>
  );
}

// --- leaderboard ---------------------------------------------------------------

// Podium plus the viewer's own line when they are further down.
function MiniLeaderboard({ rows }: { rows: BoardRow[] | null }) {
  const { me } = useAuth();
  if (!rows) return <div className={`${panel} h-40 animate-pulse`} />;
  if (rows.length === 0) {
    return <div className={`${panel} px-6 py-10 text-center text-sm text-neutral-500`}>Personne n'a encore de points.</div>;
  }

  const myIndex = rows.findIndex((r) => r.user_id === me?.id);
  const shown = rows.slice(0, 3).map((r, i) => ({ r, i }));
  if (myIndex >= 3) shown.push({ r: rows[myIndex], i: myIndex });

  return (
    <ol className={`${panel} divide-y divide-neutral-100 overflow-hidden`}>
      {shown.map(({ r, i }) => (
        <li key={r.user_id} className={`flex items-center gap-3 px-4 py-2.5 ${r.user_id === me?.id ? 'bg-amber-50/50' : ''}`}>
          <span className="w-5 text-sm font-bold tabular-nums text-neutral-400">{i + 1}</span>
          <Avatar url={r.avatar_url} name={r.display_name} size="xs" />
          <Link to={profilePath(r.username)} className="flex-1 min-w-0 truncate text-sm font-medium text-neutral-900 hover:underline">
            {r.display_name}{r.user_id === me?.id && <span className="text-neutral-400 font-normal"> (toi)</span>}
          </Link>
          <span className="text-sm font-bold tabular-nums text-neutral-900">{r.points}</span>
        </li>
      ))}
    </ol>
  );
}
