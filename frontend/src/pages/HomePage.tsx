import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { blindtestApi, leaderboardApi, songlessApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { Segmented } from '../components/shared/Segmented';
import { SourcePicker, type SourceSelection } from '../components/sources/SourcePicker';
import { BoltIcon, CalendarIcon, FlameIcon, HeadphonesIcon, ShuffleIcon, UsersIcon } from '../components/shared/icons';
import { Badge, card, ErrorText, IconTile, Page, PageHeader, panel, primaryButton, SectionTitle, secondaryButton } from '../components/shared/ui';
import { accent, GAME_ACCENT, type Accent } from '../utils/theme';
import type { Blindtest, GameState, MyStats, TodayStatus } from '../types';

export function HomePage() {
  const { me } = useAuth();
  const navigate = useNavigate();
  const [today, setToday] = useState<TodayStatus | null>(null);
  const [stats, setStats] = useState<MyStats | null>(null);
  const [source, setSource] = useState<SourceSelection>({ id: '', ready: true });
  const sourceId = source.id;
  const [starting, setStarting] = useState<GameState['mode'] | 'blindtest' | null>(null);
  const [rounds, setRounds] = useState(10);
  const [answerMode, setAnswerMode] = useState<Blindtest['answer_mode']>('mcq');
  const [hits, setHits] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    songlessApi.today().then(setToday).catch(() => undefined);
    leaderboardApi.me().then(setStats).catch(() => undefined);
  }, []);

  const run = async (key: GameState['mode'] | 'blindtest', fn: () => Promise<string>) => {
    setStarting(key);
    setError('');
    try {
      navigate(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setStarting(null);
    }
  };

  const startSongless = (mode: GameState['mode']) => run(mode, async () => {
    const game = await songlessApi.start(mode, mode === 'free' && sourceId ? sourceId : undefined);
    return `/songless/${game.id}`;
  });

  const startBlindtest = () => run('blindtest', async () => {
    const test = await blindtestApi.start({ source_id: sourceId || undefined, rounds, answer_mode: answerMode, hits });
    return `/blindtest/${test.id}`;
  });

  const gameFor = (mode: GameState['mode']) => today?.games.find((g) => g.mode === mode);
  const steps = today?.steps ?? 7;

  return (
    <Page width="lg">
      <PageHeader
        title={`Salut ${me?.display_name ?? ''}`}
        subtitle="Trouve le morceau avec le moins d'écoute possible."
        actions={stats && stats.played > 0 && (
          <div className={`${panel} px-3 py-2 flex items-center gap-2`} title={`Record : ${stats.best} jours`}>
            <FlameIcon className={`w-5 h-5 ${stats.current > 0 ? 'text-orange-500' : 'text-neutral-300'}`} />
            <span className="text-sm">
              <span className="font-bold text-neutral-900 tabular-nums">{stats.current}</span>
              <span className="text-neutral-500"> jour{stats.current > 1 ? 's' : ''} de suite</span>
            </span>
          </div>
        )}
      />

      <SectionTitle>Aujourd'hui</SectionTitle>
      <div className="grid sm:grid-cols-2 gap-4">
        <DailyCard
          accentName={GAME_ACCENT.daily}
          icon={<CalendarIcon />}
          title="Songless du jour"
          description="Le même morceau pour tout le monde, une partie par jour."
          game={gameFor('daily')}
          steps={steps}
          loading={starting === 'daily'}
          onStart={() => startSongless('daily')}
        />
        <DailyCard
          accentName={GAME_ACCENT.daily_personal}
          icon={<HeadphonesIcon />}
          title="Mon Spotify du jour"
          description="Un morceau tiré de tes titres les plus écoutés et de tes likes."
          game={gameFor('daily_personal')}
          steps={steps}
          loading={starting === 'daily_personal'}
          onStart={() => startSongless('daily_personal')}
          locked={!me?.spotify}
        />
      </div>

      <SectionTitle
        aside={<SourcePicker onChange={setSource} />}
      >
        Jouer librement
      </SectionTitle>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className={`${card} p-5 flex flex-col`}>
          <div className="flex items-start gap-3 mb-4">
            <IconTile icon={<ShuffleIcon />} accent={GAME_ACCENT.free} />
            <div>
              <h3 className="font-semibold text-neutral-900">Songless libre</h3>
              <p className="text-sm text-neutral-500">Extraits de 0,1 s à 16 s, autant de parties que tu veux.</p>
            </div>
          </div>
          <div className="mt-auto flex justify-end">
            <button onClick={() => startSongless('free')} disabled={starting !== null || !source.ready} className={primaryButton}>
              {starting === 'free' ? '…' : 'Jouer'}
            </button>
          </div>
        </div>

        <div className={`${card} p-5 flex flex-col`}>
          <div className="flex items-start gap-3 mb-4">
            <IconTile icon={<BoltIcon />} accent={GAME_ACCENT.blindtest} />
            <div>
              <h3 className="font-semibold text-neutral-900">Blind test</h3>
              <p className="text-sm text-neutral-500">15 s par morceau : plus tu réponds vite, plus tu marques.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <Segmented<number>
              options={[{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 20, label: '20' }]}
              value={rounds}
              onChange={setRounds}
            />
            <Segmented<Blindtest['answer_mode']>
              options={[{ value: 'mcq', label: '4 choix' }, { value: 'type', label: 'Saisie' }]}
              value={answerMode}
              onChange={setAnswerMode}
            />
          </div>
          <div className="mt-auto flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              <input type="checkbox" checked={hits} onChange={(e) => setHits(e.target.checked)} className="accent-violet-600" />
              Tubes uniquement
            </label>
            <button onClick={startBlindtest} disabled={starting !== null || !source.ready} className={primaryButton}>
              {starting === 'blindtest' ? '…' : 'Jouer'}
            </button>
          </div>
        </div>
      </div>
      <p className="text-xs text-neutral-400 mt-3">
        Choisis une de tes playlists Spotify ou tes likes dans la liste ci-dessus, ou ajoute une playlist Deezer dans <Link to="/playlists" className="underline hover:text-neutral-600">Playlists</Link>.
      </p>

      <div className="mt-4"><ErrorText>{error}</ErrorText></div>

      <SectionTitle>Entre amis</SectionTitle>
      <Link to="/party/new" className={`${card} p-5 flex items-center gap-4 group`}>
        <IconTile icon={<UsersIcon />} accent={GAME_ACCENT.party} size="lg" />
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-neutral-900">Soirée</h3>
          <p className="text-sm text-neutral-500">
            Un écran joue la musique, les invités scannent un QR code et répondent depuis leur téléphone.
            Blind test, Songless ou « Qui a liké ça ? ».
          </p>
        </div>
        <span className={`${secondaryButton} hidden sm:inline-flex group-hover:bg-neutral-50`}>Créer un salon</span>
      </Link>
    </Page>
  );
}

interface DailyCardProps {
  accentName: Accent;
  icon: React.ReactNode;
  title: string;
  description: string;
  game: TodayStatus['games'][number] | undefined;
  steps: number;
  loading: boolean;
  onStart: () => void;
  locked?: boolean;
}

function DailyCard({ accentName, icon, title, description, game, steps, loading, onStart, locked }: DailyCardProps) {
  const done = game && game.status !== 'playing';
  const won = game?.status === 'won';

  return (
    <div className={`${card} p-5 flex flex-col`}>
      <div className="flex items-start gap-3 mb-4">
        <IconTile icon={icon} accent={accentName} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-neutral-900">{title}</h3>
            {done ? (
              <Badge accent={won ? 'emerald' : 'rose'}>{won ? `Trouvé en ${game.step + 1}/${steps}` : 'Raté'}</Badge>
            ) : game ? (
              <Badge accent="amber">En cours</Badge>
            ) : !locked && (
              <Badge accent={accentName}>À jouer</Badge>
            )}
          </div>
          <p className="text-sm text-neutral-500">{description}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between gap-3">
        <StepBars steps={steps} game={game} color={accent(accentName).solid} />
        {locked ? (
          <Link to="/profile" className={secondaryButton}>Lier Spotify</Link>
        ) : done ? (
          <Link to={`/songless/${game.id}`} className={secondaryButton}>Revoir</Link>
        ) : (
          <button onClick={onStart} disabled={loading} className={primaryButton}>
            {loading ? '…' : game ? 'Continuer' : 'Jouer'}
          </button>
        )}
      </div>
    </div>
  );
}

// Seven little bars, one per clip length: filled up to where the song was found.
function StepBars({ steps, game, color }: { steps: number; game: TodayStatus['games'][number] | undefined; color: string }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {Array.from({ length: steps }, (_, i) => {
        let cls = 'bg-neutral-100';
        if (game?.status === 'won') cls = i < game.step ? 'bg-neutral-300' : i === game.step ? color : 'bg-neutral-100';
        else if (game?.status === 'lost') cls = 'bg-rose-200';
        else if (game) cls = i < game.step ? 'bg-neutral-300' : 'bg-neutral-100';
        return <span key={i} className={`h-2 w-4 rounded-full ${cls}`} />;
      })}
    </div>
  );
}
