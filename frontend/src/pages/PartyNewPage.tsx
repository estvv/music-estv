import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { roomsApi, sourcesApi } from '../utils/api';
import { Field, inputClass } from '../components/shared/Field';
import { Segmented } from '../components/shared/Segmented';
import { ErrorText, IconTile, Page, PageHeader, panel, primaryButton } from '../components/shared/ui';
import { BoltIcon, HeartIcon, ShuffleIcon, UsersIcon } from '../components/shared/icons';
import { accent, GAME_ACCENT, type Accent } from '../utils/theme';
import type { RoomAnswerMode, RoomGame, UserSource } from '../types';

const GAMES: { value: RoomGame; label: string; detail: string; icon: React.ReactNode; accent: Accent }[] = [
  { value: 'blindtest', label: 'Blind test', detail: '15 s par morceau, QCM, saisie ou buzzer', icon: <BoltIcon />, accent: GAME_ACCENT.blindtest },
  { value: 'songless', label: 'Songless', detail: 'Extraits de plus en plus longs', icon: <ShuffleIcon />, accent: GAME_ACCENT.songless },
  { value: 'wholiked', label: 'Qui a liké ça ?', detail: 'Devine à qui est le morceau', icon: <HeartIcon />, accent: GAME_ACCENT.wholiked },
];

export function PartyNewPage() {
  const navigate = useNavigate();
  const [game, setGame] = useState<RoomGame>('blindtest');
  const [mode, setMode] = useState<RoomAnswerMode>('mcq');
  const [rounds, setRounds] = useState(10);
  const [hits, setHits] = useState(false);
  const [sourceId, setSourceId] = useState<number | ''>('');
  const [sources, setSources] = useState<UserSource[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    sourcesApi.list().then((list) => setSources(list.filter((s) => s.track_count > 0))).catch(() => undefined);
  }, []);

  const create = async () => {
    setCreating(true);
    setError('');
    try {
      const { code } = await roomsApi.create({
        game,
        answer_mode: game === 'wholiked' ? 'mcq' : game === 'songless' ? 'type' : mode,
        rounds,
        source_id: game === 'wholiked' ? undefined : sourceId || undefined,
        hits,
      });
      navigate(`/party/${code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setCreating(false);
    }
  };

  return (
    <Page>
      <PageHeader
        title="Nouvelle soirée"
        subtitle="Affiche l'écran de jeu sur une TV ou un PC : c'est lui qui joue la musique. Les invités scannent le QR code et répondent depuis leur téléphone, sans compte."
        icon={<UsersIcon />}
        accent={GAME_ACCENT.party}
      />

      <div className="grid sm:grid-cols-3 gap-3 mb-4" role="radiogroup" aria-label="Jeu">
        {GAMES.map((g) => {
          const selected = game === g.value;
          return (
            <button
              key={g.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setGame(g.value)}
              className={`${panel} p-4 text-left transition-all ${selected ? `ring-2 ${accent(g.accent).ring} border-transparent` : 'hover:shadow-md hover:-translate-y-0.5'}`}
            >
              <IconTile icon={g.icon} accent={g.accent} />
              <div className="font-semibold text-neutral-900 mt-3">{g.label}</div>
              <div className="text-sm text-neutral-500">{g.detail}</div>
            </button>
          );
        })}
      </div>

      <div className={`${panel} p-5 space-y-5`}>
        {game !== 'wholiked' ? (
          <>
            {game === 'songless' ? (
              <p className="text-sm text-neutral-500">
                Extraits de plus en plus longs (0,1 s, 0,5 s, 1 s… jusqu'à 16 s). Chacun tape sa réponse sur son téléphone,
                une tentative par extrait : plus tu trouves tôt, plus tu marques.
              </p>
            ) : (
              <>
                <Field label="Réponses">
                  <Segmented<RoomAnswerMode>
                    options={[{ value: 'mcq', label: '4 choix' }, { value: 'type', label: 'Saisie libre' }, { value: 'buzzer', label: 'Buzzer' }]}
                    value={mode}
                    onChange={setMode}
                  />
                </Field>
                {mode === 'buzzer' && (
                  <p className="text-sm text-neutral-500 -mt-3">Le premier qui buzze répond à voix haute, et tu valides ou refuses depuis l'écran de jeu.</p>
                )}
              </>
            )}
            <Field label="Playlist">
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value ? Number(e.target.value) : '')} className={inputClass}>
                <option value="">Playlists du daily</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.track_count})</option>)}
              </select>
            </Field>
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input type="checkbox" checked={hits} onChange={(e) => setHits(e.target.checked)} />
              Tubes uniquement (la moitié la plus populaire de la playlist)
            </label>
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            Les morceaux viennent des titres les plus écoutés et des likes des joueurs. Il faut au moins deux joueurs
            connectés à leur compte avec Spotify lié : ils rejoignent avec le QR code en étant connectés sur leur téléphone.
          </p>
        )}

        <Field label="Nombre de morceaux">
          <Segmented<number>
            options={[{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 15, label: '15' }, { value: 20, label: '20' }]}
            value={rounds}
            onChange={setRounds}
          />
        </Field>

        <ErrorText>{error}</ErrorText>
        <div className="flex justify-between items-center">
          <Link to="/" className="text-sm text-neutral-500 hover:text-neutral-900">Annuler</Link>
          <button onClick={create} disabled={creating} className={primaryButton}>Créer le salon</button>
        </div>
      </div>
    </Page>
  );
}
