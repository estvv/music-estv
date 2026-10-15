import { Router } from 'express';
import { randomToken } from '../auth/crypto.js';
import { requireUser } from '../auth/session.js';
import { config, spotifyEnabled } from '../config.js';
import { route } from '../http.js';
import { authorizeUrl, getAccessToken, getMyPlaylists, getSpotifyLink, linkAccount, unlinkAccount } from '../services/spotify.js';

const router = Router();
const STATE_COOKIE = 'spotify_oauth_state';

router.use((_req, res, next) => {
  if (!spotifyEnabled()) return void res.status(503).json({ success: false, error: 'Spotify is not configured' });
  next();
});

// Spotify always redirects back to PUBLIC_URL, so the session and state cookies
// must live on that host. A site opened as localhost while PUBLIC_URL says
// 127.0.0.1 would come back without them: send the user to the right host first.
router.get('/connect', (req, res, next) => {
  const publicHost = new URL(config.publicUrl).host;
  if (req.get('host') !== publicHost) return res.redirect(`${config.publicUrl}/profiles/update`);
  next();
});

// Full-page navigation (not fetch): the user lands on a page, never on JSON.
router.get('/callback', (req, res, next) => {
  if (!req.user) return res.redirect('/profiles/update?spotify=session');
  next();
});

router.use(requireUser);

// Full-page navigation (not fetch): the browser follows the redirect to Spotify.
router.get('/connect', (_req, res) => {
  const state = randomToken();
  res.cookie(STATE_COOKIE, state, {
    httpOnly: true, sameSite: 'lax', secure: config.cookieSecure, path: '/api/spotify', maxAge: 10 * 60 * 1000,
  });
  res.redirect(authorizeUrl(state));
});

router.get('/callback', async (req, res) => {
  const expected = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: '/api/spotify' });
  const back = (status: string) => res.redirect(`/profiles/update?spotify=${status}`);

  if (typeof req.query.error === 'string') return back('denied');
  if (!expected || req.query.state !== expected || typeof req.query.code !== 'string') return back('invalid');

  try {
    await linkAccount(req.user!.id, req.query.code);
    back('linked');
  } catch (e) {
    console.error('Spotify link failed:', e);
    back('error');
  }
});

router.delete('/', route(async (req, res) => {
  await unlinkAccount(req.user!.id);
  res.json({ success: true });
}));

router.get('/playlists', async (req, res, next) => {
  try {
    res.json({ success: true, data: await getMyPlaylists(req.user!.id) });
  } catch (e) {
    next(e);
  }
});

// Short-lived access token for the Web Playback SDK on the party host screen.
// It is the user's own token, handed to their own browser.
router.get('/token', async (req, res, next) => {
  const link = await getSpotifyLink(req.user!.id).catch(() => undefined);
  if (!link?.scope.split(' ').includes('streaming')) {
    return res.status(409).json({ success: false, error: 'Spotify playback not available' });
  }
  try {
    res.json({ success: true, data: { access_token: await getAccessToken(req.user!.id) } });
  } catch (e) {
    next(e);
  }
});

export default router;
