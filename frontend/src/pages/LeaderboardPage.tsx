import { useEffect, useState } from 'react';
import { leaderboardApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { Segmented } from '../components/shared/Segmented';
import { TrophyIcon } from '../components/shared/icons';
import { Badge, LoadingState, Page, PageHeader, panel, SectionTitle } from '../components/shared/ui';
import { formatDay } from './SonglessPage';
import type { AllTimeRow, DailyRow, MyStats } from '../types';

type Tab = 'today' | 'all';

// Gold, silver, bronze for the podium; plain numbers after.
const RANK_STYLES = ['bg-amber-100 text-amber-700', 'bg-neutral-200 text-neutral-700', 'bg-orange-100 text-orange-700'];

function Rank({ index }: { index: number }) {
  return (
    <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold tabular-nums ${RANK_STYLES[index] ?? 'text-neutral-400'}`}>
      {index + 1}
    </span>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="w-8 h-8 shrink-0 rounded-full bg-neutral-100 text-neutral-600 text-sm font-semibold flex items-center justify-center">
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function LeaderboardPage() {
  const { me } = useAuth();
  const [tab, setTab] = useState<Tab>('today');
  const [daily, setDaily] = useState<{ day: string; rows: DailyRow[] } | null>(null);
  const [all, setAll] = useState<AllTimeRow[] | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);

  useEffect(() => {
    leaderboardApi.daily().then(setDaily).catch(() => undefined);
    leaderboardApi.all().then(setAll).catch(() => undefined);
    leaderboardApi.me().then(setStats).catch(() => undefined);
  }, []);

  return (
    <Page>
      <PageHeader
        title="Classement"
        subtitle={tab === 'today' && daily ? `Songless du jour, ${formatDay(daily.day)}` : 'Tous les scores depuis le début'}
        icon={<TrophyIcon />}
        accent="amber"
        actions={
          <Segmented<Tab>
            options={[{ value: 'today', label: "Aujourd'hui" }, { value: 'all', label: 'Général' }]}
            value={tab}
            onChange={setTab}
          />
        }
      />

      {tab === 'today' ? (
        !daily ? <LoadingState /> : daily.rows.length === 0 ? (
          <div className={`${panel} p-10 text-center`}>
            <p className="text-neutral-500">Personne n'a encore terminé le morceau du jour. Sois le premier !</p>
          </div>
        ) : (
          <ol className={`${panel} divide-y divide-neutral-100`}>
            {daily.rows.map((r, i) => (
              <li key={r.user_id} className={`px-4 py-3 flex items-center gap-3 ${r.user_id === me?.id ? 'bg-amber-50/40' : ''}`}>
                <Rank index={i} />
                <Avatar name={r.display_name} />
                <span className="flex-1 font-medium text-neutral-900 truncate">{r.display_name}</span>
                <Badge accent={r.status === 'won' ? 'emerald' : 'rose'}>{r.status === 'won' ? `${r.step + 1}/7` : 'X/7'}</Badge>
                <span className="w-16 text-right font-bold text-neutral-900 tabular-nums">{r.score} pts</span>
              </li>
            ))}
          </ol>
        )
      ) : (
        !all ? <LoadingState /> : (
          <div className={`${panel} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500 border-b border-neutral-100 bg-neutral-50/60">
                  <th className="px-4 py-2.5 font-medium">Joueur</th>
                  <th className="px-3 py-2.5 font-medium text-right">Daily</th>
                  <th className="px-3 py-2.5 font-medium text-right">Trouvés</th>
                  <th className="px-3 py-2.5 font-medium text-right">Série</th>
                  <th className="px-3 py-2.5 font-medium text-right">Libre</th>
                  <th className="px-4 py-2.5 font-medium text-right" title="Victoires / soirées jouées">Soirées</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {all.map((r, i) => (
                  <tr key={r.user_id} className={r.user_id === me?.id ? 'bg-amber-50/40' : ''}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Rank index={i} />
                        <span className="font-medium text-neutral-900">{r.display_name}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums font-bold text-neutral-900">{r.daily_score}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-neutral-600">{r.daily_won}/{r.daily_played}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-neutral-600" title={`Record : ${r.best}`}>{r.current}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-neutral-600">{r.free_score}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-600">{r.party_won}/{r.party_played}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {stats && stats.played > 0 && <MyStatsSection stats={stats} />}
    </Page>
  );
}

function StatTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className={`${panel} px-4 py-3`}>
      <div className="text-2xl font-bold text-neutral-900 tabular-nums">{value}</div>
      <div className="text-sm text-neutral-500">{label}</div>
    </div>
  );
}

function MyStatsSection({ stats }: { stats: MyStats }) {
  const max = Math.max(1, ...stats.distribution, stats.lost);
  const rows = [...stats.distribution.map((n, i) => ({ label: String(i + 1), n, won: true })), { label: 'X', n: stats.lost, won: false }];

  return (
    <section>
      <SectionTitle>Mes daily</SectionTitle>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatTile label="Joués" value={stats.played} />
        <StatTile label="Trouvés" value={`${Math.round((stats.won / stats.played) * 100)} %`} />
        <StatTile label="Série actuelle" value={stats.current} />
        <StatTile label="Record" value={stats.best} />
      </div>
      <div className={`${panel} p-5`}>
        <p className="text-sm font-medium text-neutral-700 mb-3">Trouvé à l'essai n°</p>
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-3 text-sm">
              <span className="w-4 text-neutral-500 tabular-nums text-right">{r.label}</span>
              <div className="flex-1">
                <div
                  className={`h-6 rounded-md flex items-center justify-end px-2 text-xs font-semibold tabular-nums ${
                    r.won ? (r.n ? 'bg-emerald-500 text-white' : 'bg-neutral-100 text-neutral-400') : 'bg-rose-200 text-rose-800'
                  }`}
                  style={{ width: `${Math.max(8, (r.n / max) * 100)}%` }}
                >
                  {r.n}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
