import { blindtestApi, songlessApi } from '../../utils/api';
import type { Blindtest } from '../../types';

export type SoloGame = 'songless' | 'blindtest';

// Everything needed to start a solo game again without the setup modal.
export interface GameSettings {
  game: SoloGame;
  sourceId: number;
  rounds: number;
  answerMode: Blindtest['answer_mode'];
  hits: boolean;
}

const KEY = 'music.lastGame';

// Per-browser convenience only: an empty or blocked storage just means no
// "Rejouer" bar.
export function loadLastGame(): GameSettings | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (raw && (raw.game === 'songless' || raw.game === 'blindtest') && Number.isInteger(raw.sourceId)) return raw;
  } catch {
    // Unreadable: ignore.
  }
  return null;
}

export function saveLastGame(settings: GameSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Not remembered, that is all.
  }
}

// Starts the game server-side and returns the page to open.
export async function launchGame(s: GameSettings): Promise<string> {
  saveLastGame(s);
  if (s.game === 'songless') return `/songless/${(await songlessApi.start(s.sourceId)).id}`;
  const test = await blindtestApi.start({ source_id: s.sourceId, rounds: s.rounds, answer_mode: s.answerMode, hits: s.hits });
  return `/blindtest/${test.id}`;
}
