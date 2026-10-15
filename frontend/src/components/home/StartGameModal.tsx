import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal } from '../shared/Modal';
import { Segmented } from '../shared/Segmented';
import { ErrorText, LoadingState, primaryButton, secondaryButton } from '../shared/ui';
import { firstGroupTitle, GROUP_LABEL, SourceList, usePlayableSources } from '../sources/SourcePicker';
import { launchGame, loadLastGame, type SoloGame } from './lastGame';
import type { Blindtest } from '../../types';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-neutral-900 mb-2">{title}</h3>
      {children}
    </section>
  );
}

// Everything needed to start a solo game in one place: the playlist, then the
// game's own settings, then "Lancer".
export function StartGameModal({ game, onClose }: { game: SoloGame; onClose: () => void }) {
  const navigate = useNavigate();
  const { sources, last, remember } = usePlayableSources();
  const [sourceId, setSourceId] = useState<number | ''>('');
  // Blind test settings start from the last ones used in this browser.
  const [previous] = useState(loadLastGame);
  const [rounds, setRounds] = useState(previous?.rounds ?? 10);
  const [answerMode, setAnswerMode] = useState<Blindtest['answer_mode']>(previous?.answerMode ?? 'mcq');
  const [hits, setHits] = useState(previous?.hits ?? false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  // Preselect the playlist played last, once the list has loaded.
  useEffect(() => {
    if (last) setSourceId((current) => current || last);
  }, [last]);

  const start = async () => {
    if (!sourceId) return;
    setStarting(true);
    setError('');
    remember(sourceId);
    try {
      navigate(await launchGame({ game, sourceId, rounds, answerMode, hits }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setStarting(false);
    }
  };

  return (
    <Modal
      // The list's first group title sits in the header, level with the close button.
      title={<span className={`block ${GROUP_LABEL}`}>{sources ? firstGroupTitle(sources) : 'Mes playlists'}</span>}
      onClose={onClose}
      width="md"
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>Annuler</button>
          <button type="button" onClick={start} disabled={!sourceId || starting} className={primaryButton}>
            {starting ? 'Lancement…' : 'Lancer'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {!sources ? <LoadingState /> : (
          <div className="-mx-3 -mt-2 max-h-72 overflow-y-auto overscroll-contain">
            <SourceList sources={sources} value={sourceId} onPick={setSourceId} hideFirstTitle />
          </div>
        )}

        {game === 'blindtest' && (
          <Section title="Réglages">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-neutral-600">Morceaux</span>
                <Segmented<number>
                  options={[{ value: 5, label: '5' }, { value: 10, label: '10' }, { value: 20, label: '20' }]}
                  value={rounds}
                  onChange={setRounds}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-neutral-600">Réponses</span>
                <Segmented<Blindtest['answer_mode']>
                  options={[{ value: 'mcq', label: '4 choix' }, { value: 'type', label: 'Saisie' }]}
                  value={answerMode}
                  onChange={setAnswerMode}
                />
              </div>
              <label className="flex items-center justify-between gap-3 text-sm text-neutral-600">
                <span>Tubes uniquement <span className="text-neutral-400">(la moitié la plus populaire)</span></span>
                <input type="checkbox" checked={hits} onChange={(e) => setHits(e.target.checked)} className="w-4 h-4 accent-violet-600" />
              </label>
            </div>
          </Section>
        )}

        <ErrorText>{error}</ErrorText>
      </div>
    </Modal>
  );
}
