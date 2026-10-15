import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { leaderboardApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { Segmented } from '../components/shared/Segmented';
import { ErrorText, LoadingState, Page, panel } from '../components/shared/ui';
import { Avatar, GAME_LABEL } from '../components/stats/common';
import type {
  BlindtestBoardRow, BoardGame, BoardPeriod, BoardRow, PartyBoardRow, RecordEntry, SonglessBoardRow,
} from '../types';
import { profilePath } from '../utils/paths';
import { TrophyIcon } from '../components/shared/icons';

// The number a board is ranked on, and how it reads.
function mainValue(game: BoardGame, r: BoardRow): { value: number; unit: string } {
  if (game === 'party') {
    const wins = (r as PartyBoardRow).wins;
    return { value: wins, unit: wins > 1 ? 'victoires' : 'victoire' };
  }
  return { value: r.points, unit: 'pts' };
}

interface Column {
  label: string;
  title?: string;
  cell: (r: BoardRow) => React.ReactNode;
  strong?: boolean;
}

const COLUMNS: Record<BoardGame, Column[]> = {
  songless: [
    { label: 'Points', cell: (r) => r.points, strong: true },
    { label: 'Trouvés', title: 'Morceaux trouvés / parties terminées', cell: (r) => `${(r as SonglessBoardRow).won}/${r.played}` },
    { label: '1er essai', title: 'Trouvés dès le premier extrait', cell: (r) => (r as SonglessBoardRow).first_try },
    { label: 'Moy. essais', title: "Nombre moyen d'essais pour trouver", cell: (r) => (r as SonglessBoardRow).avg_attempts ?? '–' },
  ],
  blindtest: [
    { label: 'Points', cell: (r) => r.points, strong: true },
    { label: 'Parties', cell: (r) => r.played },
    { label: 'Record', title: 'Meilleure partie', cell: (r) => (r as BlindtestBoardRow).best },
    { label: 'Trouvés', title: 'Bonnes réponses / morceaux joués', cell: (r) => `${(r as BlindtestBoardRow).found}/${(r as BlindtestBoardRow).tracks}` },
    { label: 'Pts/morceau', title: 'Points moyens par morceau', cell: (r) => (r as BlindtestBoardRow).per_track ?? '–' },
  ],
  party: [
    { label: 'Victoires', cell: (r) => (r as PartyBoardRow).wins, strong: true },
    { label: 'Podiums', cell: (r) => (r as PartyBoardRow).podiums },
    { label: 'Soirées', cell: (r) => r.played },
    { label: 'Points', cell: (r) => r.points },
  ],
};

// The board covers everything since the start; the API still takes a period.
const PERIOD: BoardPeriod = 'all';

export function LeaderboardPage() {
  const { me } = useAuth();
  const [game, setGame] = useState<BoardGame>('songless');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [records, setRecords] = useState<RecordEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    Promise.all([leaderboardApi.board(game, PERIOD), leaderboardApi.records(game, PERIOD)])
      .then(([board, recs]) => {
        if (!live) return;
        setRows(board.rows);
        setRecords(recs);
        setError('');
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => { live = false; };
  }, [game]);

  return (
    <Page width="lg">
      <div className="mb-6">
        <Segmented<BoardGame>
          options={(['songless', 'blindtest', 'party'] as const).map((g) => ({ value: g, label: GAME_LABEL[g] }))}
          value={game}
          onChange={setGame}
        />
      </div>

      {error ? <ErrorText>{error}</ErrorText> : !rows ? <LoadingState /> : (
        // A refetch keeps the previous board, dimmed, instead of flashing.
        <div className={`transition-opacity ${loading ? 'opacity-50' : ''}`}>
          {rows.length === 0 ? (
            <div className={`${panel} p-10 text-center text-neutral-500`}>
              Aucune partie de {GAME_LABEL[game]} pour l'instant.
            </div>
          ) : (
            <>
            {records.length > 0 && <Records records={records} />}
            {/* A player's own details live on their profile page. */}
            <div className="mb-6">
              <Podium game={game} rows={rows.slice(0, 3)} meId={me?.id} />
            </div>
            {rows.length > 3 && <Table game={game} rows={rows} meId={me?.id} />}
            </>
          )}
        </div>
      )}
    </Page>
  );
}

// --- podium ---------------------------------------------------------------------

const MEDALS = [
  { ring: 'ring-amber-300', bg: 'bg-amber-50', label: 'text-amber-700', height: 'h-24' },
  { ring: 'ring-neutral-300', bg: 'bg-neutral-100', label: 'text-neutral-600', height: 'h-16' },
  { ring: 'ring-orange-300', bg: 'bg-orange-50', label: 'text-orange-700', height: 'h-12' },
];

// Second, first, third from left to right, first on the tallest step.
function Podium({ game, rows, meId }: { game: BoardGame; rows: BoardRow[]; meId?: number }) {
  const order = [1, 0, 2].filter((i) => rows[i]);
  return (
    <div className="grid grid-cols-3 gap-3 items-end">
      {order.map((i) => {
        const r = rows[i];
        const m = MEDALS[i];
        const { value, unit } = mainValue(game, r);
        return (
          <Link key={r.user_id} to={profilePath(r.username)} className="flex flex-col items-center text-center group min-w-0">
            <span className={`rounded-full ring-4 ${m.ring} ${i === 0 ? 'scale-110' : ''}`}>
              <Avatar url={r.avatar_url} name={r.display_name} size={i === 0 ? 'lg' : 'md'} />
            </span>
            <span className="mt-2 font-semibold text-neutral-900 truncate max-w-full group-hover:underline">
              {r.display_name}{r.user_id === meId && <span className="text-neutral-400 font-normal"> (toi)</span>}
            </span>
            <span className="text-sm text-neutral-500 tabular-nums">
              <span className="font-bold text-neutral-900">{value}</span> {unit}
            </span>
            <div className={`mt-2 w-full ${m.height} ${m.bg} rounded-t-xl flex items-start justify-center pt-2`}>
              <span className={`text-2xl font-bold ${m.label}`}>{i + 1}</span>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

// --- table ----------------------------------------------------------------------

// Everyone from the 4th place on (the podium covers the top 3).
function Table({ game, rows, meId }: { game: BoardGame; rows: BoardRow[]; meId?: number }) {
  const columns = COLUMNS[game];
  return (
    <div className={`${panel} overflow-x-auto`}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500 border-b border-neutral-100">
            <th className="px-4 py-2.5 font-medium w-10">#</th>
            <th className="px-2 py-2.5 font-medium">Joueur</th>
            {columns.map((c) => (
              <th key={c.label} title={c.title} className="px-3 py-2.5 font-medium text-right whitespace-nowrap">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.slice(3).map((r, i) => (
            <tr key={r.user_id} className={r.user_id === meId ? 'bg-amber-50/50' : 'hover:bg-neutral-50'}>
              <td className="px-4 py-2.5 font-semibold text-neutral-400 tabular-nums">{i + 4}</td>
              <td className="px-2 py-2.5">
                <Link to={profilePath(r.username)} className="flex items-center gap-2.5 min-w-0 hover:underline">
                  <Avatar url={r.avatar_url} name={r.display_name} size="xs" />
                  <span className="font-medium text-neutral-900 truncate">
                    {r.display_name}{r.user_id === meId && <span className="text-neutral-400 font-normal"> (toi)</span>}
                  </span>
                </Link>
              </td>
              {columns.map((c) => (
                <td key={c.label} className={`px-3 py-2.5 text-right tabular-nums ${c.strong ? 'font-bold text-neutral-900' : 'text-neutral-600'}`}>
                  {c.cell(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// --- records ----------------------------------------------------------------------

// Highlights under the filters, sharing the full width: the holder first
// (picture with a trophy, name), then the feat and its value.
function Records({ records }: { records: RecordEntry[] }) {
  return (
    <ul className="grid gap-3 mb-8 sm:grid-cols-2 lg:[grid-template-columns:repeat(var(--n),minmax(0,1fr))]" style={{ '--n': records.length } as React.CSSProperties}>
      {records.map((r) => (
        <li key={r.key} className="min-w-0">
          <Link
            to={profilePath(r.username)}
            className="h-full flex items-center gap-4 rounded-xl border border-neutral-200 bg-white px-4 py-3.5 hover:border-neutral-300 hover:shadow-sm transition"
          >
            <span className="relative shrink-0">
              <Avatar url={r.avatar_url} name={r.display_name} size="lg" />
              <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-amber-400 text-white ring-2 ring-white flex items-center justify-center">
                <TrophyIcon className="w-3.5 h-3.5" />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-neutral-400 truncate">{r.label}</span>
              <span className="flex items-baseline gap-2 min-w-0">
                <span className="text-xl font-bold text-neutral-900 tabular-nums whitespace-nowrap">{r.value}</span>
                <span className="text-sm font-medium text-neutral-700 truncate">{r.display_name}</span>
              </span>
              {r.detail && <span className="block text-xs text-neutral-400 truncate">{r.detail}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
