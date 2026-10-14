import { describe, expect, it } from 'vitest';
import { isSameSong, normalizeTitle } from './services/tracks.js';
import { scoreFor, seededOrder, sliceLength, today } from './services/songless.js';
import { streaks } from './routes/leaderboard.js';
import { pointsFor } from './services/blindtest.js';
import { isSameOrigin } from './app.js';

describe('normalizeTitle', () => {
  it('drops accents, case, brackets and version suffixes', () => {
    expect(normalizeTitle('Bohemian Rhapsody - Remastered 2011')).toBe('bohemian rhapsody');
    expect(normalizeTitle('Alors On Danse (Radio Edit)')).toBe('alors on danse');
    expect(normalizeTitle('Je veux - Édition Spéciale')).toBe('je veux');
    expect(normalizeTitle('Él Mató feat. Someone')).toBe('el mato');
  });
});

describe('isSameSong', () => {
  const answer = { deezer_id: 1, title: 'Bohemian Rhapsody', artist: 'Queen' };

  it('accepts another release of the same song', () => {
    expect(isSameSong({ deezer_id: 2, title: 'Bohemian Rhapsody (Remastered 2011)', artist: 'Queen' }, answer)).toBe(true);
  });

  it('rejects a cover by another artist', () => {
    expect(isSameSong({ deezer_id: 3, title: 'Bohemian Rhapsody', artist: 'Panic! At The Disco' }, answer)).toBe(false);
  });

  it('rejects another song by the same artist', () => {
    expect(isSameSong({ deezer_id: 4, title: 'Somebody to Love', artist: 'Queen' }, answer)).toBe(false);
  });
});

describe('songless helpers', () => {
  it('scores 7 at the first step down to 1 at the last', () => {
    expect(scoreFor(0)).toBe(7);
    expect(scoreFor(6)).toBe(1);
  });

  it('orders deterministically for a given seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(seededOrder(items, String, 'global:2026-10-14')).toEqual(seededOrder(items, String, 'global:2026-10-14'));
    expect(seededOrder(items, String, 'global:2026-10-14')).not.toEqual(seededOrder(items, String, 'global:2026-10-15'));
  });

  it('slices the preview proportionally and never past its end', () => {
    expect(sliceLength(480_000, 1000)).toBe(16_000 + 2048);
    expect(sliceLength(480_000, 30_000)).toBe(480_000);
  });

  it('uses Paris time for the day boundary', () => {
    expect(today(new Date('2026-10-14T22:30:00Z'))).toBe('2026-10-15');
  });
});

describe('streaks', () => {
  it('counts the current run up to yesterday when today is not played yet', () => {
    expect(streaks(['2026-10-11', '2026-10-12', '2026-10-13'], '2026-10-14')).toEqual({ current: 3, best: 3 });
  });

  it('breaks the current run on a gap and keeps the best one', () => {
    expect(streaks(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-13', '2026-10-14'], '2026-10-14'))
      .toEqual({ current: 2, best: 3 });
  });

  it('is zero when the last win is older than yesterday', () => {
    expect(streaks(['2026-10-10'], '2026-10-14')).toEqual({ current: 0, best: 1 });
  });
});

describe('blind test points', () => {
  it('rewards speed, and a third for the artist only', () => {
    expect(pointsFor('right', 0)).toBe(1000);
    expect(pointsFor('right', 15000)).toBe(500);
    expect(pointsFor('artist', 0)).toBe(333);
    expect(pointsFor('wrong', 0)).toBe(0);
  });
});

describe('isSameOrigin', () => {
  it('accepts the host the request was sent to, whatever its name', () => {
    expect(isSameOrigin('http://localhost:8094', 'localhost:8094')).toBe(true);
    expect(isSameOrigin('http://127.0.0.1:8094', '127.0.0.1:8094')).toBe(true);
  });

  it('rejects another site', () => {
    expect(isSameOrigin('https://evil.example', 'music.example.org')).toBe(false);
    expect(isSameOrigin('http://localhost:9999', 'localhost:8094')).toBe(false);
  });
});
