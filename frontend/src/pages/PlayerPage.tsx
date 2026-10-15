import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { playersApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { Segmented } from '../components/shared/Segmented';
import { ListenButtons } from '../components/shared/ListenButtons';
import { ErrorText, LoadingState, Page, panel } from '../components/shared/ui';
import { DistributionBars, ProgressChart } from '../components/stats/Charts';
import { Avatar, GAME_COLOR, GAME_LABEL, StatTile } from '../components/stats/common';
import { RecentGames } from '../components/stats/RecentGames';
import type { BoardGame, BoardPeriod, DayPoints, PlayerProfile } from '../types';
import { PencilIcon } from '../components/shared/icons';
import { PROFILE_SETTINGS_PATH, profilePath } from '../utils/paths';

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)} %` : '–');

export function PlayerPage() {
  // A username, or a numeric id from an older link.
  const { ref = '' } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const [period] = useState<BoardPeriod>('all');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    playersApi.get(ref, period).then((p) => {
      setProfile(p);
      setError('');
      // Always show the canonical address: /profiles/<username>.
      if (ref !== p.player.username) navigate(profilePath(p.player.username), { replace: true });
    }).catch((e) => setError(e.message));
  }, [ref, period, navigate]);

  if (error && !profile) return <Page><ErrorText>{error === 'Player not found' ? 'Joueur introuvable.' : error}</ErrorText></Page>;
  if (!profile) return <LoadingState />;

  const { player, stats, recent } = profile;
  const isMe = me?.id === player.id;
  const since = new Date(player.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  return (
    <Page width="lg">
      {/* Identity, full width: the two columns below start on the same line. */}
      <section className="flex items-start gap-5 mb-8">
        <Avatar url={player.avatar_url} name={player.display_name} size="xl" />
        <div className="min-w-0 flex-1 pt-1">
          <div className="flex items-baseline gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-neutral-900 truncate">{player.display_name}</h1>
            {isMe && (
              <Link
                to={PROFILE_SETTINGS_PATH}
                className="inline-flex items-center gap-1.5 self-center px-2.5 py-1 rounded-md bg-neutral-100 text-xs font-medium text-neutral-600 hover:bg-neutral-200 hover:text-neutral-900 transition-colors"
              >
                <PencilIcon className="w-3.5 h-3.5" />Modifier
              </Link>
            )}
          </div>
          <p className="text-xs text-neutral-400">
            <span className="text-neutral-500 font-medium">@{player.username}</span>
          </p>
          {player.bio
            ? <p className="mt-2 text-neutral-700 whitespace-pre-line break-words">{player.bio}</p>
            : isMe && <p className=""></p>}
        </div>
      </section>

      {player.favorites.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-neutral-500 mb-3">
            {player.favorites.length > 1 ? 'Morceaux favoris' : 'Morceau favori'}
          </h2>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {player.favorites.map((f) => (
              <li key={f.deezer_id} className={`${panel} p-3 flex flex-col min-w-0`}>
                {f.cover_url
                  ? <img src={f.cover_url} alt="" className="w-full aspect-square rounded-lg object-cover bg-neutral-100" />
                  : <span className="w-full aspect-square rounded-lg bg-neutral-100" />}
                <p className="mt-2 text-sm font-semibold text-neutral-900 truncate">{f.title}</p>
                <p className="text-xs text-neutral-500 truncate mb-2">{f.artist}</p>
                <div className="mt-auto"><ListenButtons deezerId={f.deezer_id} spotifyId={f.spotify_id} compact /></div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
        <div className="min-w-0">
          {/* Same title spacing as "Dernières parties" so both columns line up. */}
          <h2 className="text-sm font-semibold text-neutral-500 mb-3">Statistiques</h2>
          <div className="space-y-6">
            <GameSection title="Songless" color={GAME_COLOR.songless}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatTile label="Points" value={stats.songless.points} />
                <StatTile label="Réussite" value={pct(stats.songless.won, stats.songless.played)} sub={`${stats.songless.won}/${stats.songless.played} trouvés`} />
                <StatTile label="Moy. essais" value={stats.songless.avg_attempts ?? '–'} sub={`${stats.songless.first_try} au 1er essai`} />
                <StatTile label="Meilleure série" value={stats.songless.best_streak} sub="trouvés d'affilée" />
              </div>
              {stats.songless.played > 0 && (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold text-neutral-500 mb-2">Répartition des essais</h3>
                  <DistributionBars distribution={stats.songless.distribution} lost={stats.songless.lost} color={GAME_COLOR.songless} />
                </div>
              )}
            </GameSection>

            <GameSection title="Blind test" color={GAME_COLOR.blindtest}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatTile label="Points" value={stats.blindtest.points} sub={`${stats.blindtest.played} partie${stats.blindtest.played > 1 ? 's' : ''}`} />
                <StatTile label="Record" value={stats.blindtest.best} sub="en une partie" />
                <StatTile label="Bonnes réponses" value={pct(stats.blindtest.found, stats.blindtest.tracks)} sub={`${stats.blindtest.per_track ?? '–'} pts/morceau`} />
                <StatTile
                  label="Réflexe"
                  value={stats.blindtest.fastest_ms !== null ? `${(stats.blindtest.fastest_ms / 1000).toFixed(1)} s` : '–'}
                  sub={`série de ${stats.blindtest.best_streak}`}
                />
              </div>
            </GameSection>

            <GameSection title="Soirée" color={GAME_COLOR.party}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatTile label="Victoires" value={stats.party.wins} />
                <StatTile label="Podiums" value={stats.party.podiums} />
                <StatTile label="Soirées" value={stats.party.played} />
                <StatTile label="Points" value={stats.party.points} />
              </div>
            </GameSection>

            <ProgressSection playerId={player.id} period={period} />
          </div>
        </div>

        <aside className="space-y-6 min-w-0">
          <section>
            <h2 className="text-sm font-semibold text-neutral-500 mb-3">Dernières parties</h2>
            <RecentGames items={recent.slice(0, 5)} linkable={isMe} empty="Aucune partie terminée pour l'instant." />
          </section>
        </aside>
      </div>
    </Page>
  );
}

function GameSection({ title, color, children }: { title: string; color: string; children: React.ReactNode }) {
  return (
    <section className={`${panel} p-5`}>
      <h3 className="flex items-center gap-2 font-semibold text-neutral-900 mb-3">
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />{title}
      </h3>
      {children}
    </section>
  );
}

function ProgressSection({ playerId, period }: { playerId: number; period: BoardPeriod }) {
  const [game, setGame] = useState<BoardGame>('songless');
  const [curve, setCurve] = useState<DayPoints[] | null>(null);

  useEffect(() => {
    playersApi.progress(playerId, game, period).then(setCurve).catch(() => setCurve([]));
  }, [playerId, game, period]);

  return (
    <section className={`${panel} p-5`}>
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="font-semibold text-neutral-900">Progression</h3>
        <Segmented<BoardGame>
          options={(['songless', 'blindtest', 'party'] as const).map((g) => ({ value: g, label: GAME_LABEL[g] }))}
          value={game}
          onChange={setGame}
        />
      </div>
      {!curve ? <div className="h-[180px]" /> : curve.length === 0
        ? <p className="text-sm text-neutral-400 py-10 text-center">Pas de points en {GAME_LABEL[game]} sur cette période.</p>
        : <ProgressChart data={curve} period={period} color={GAME_COLOR[game]} height={180} />}
    </section>
  );
}
