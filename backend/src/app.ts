import express from 'express';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import { config } from './config.js';
import { loadSession, requireAdmin, requireUser } from './auth/session.js';
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import spotifyRoutes from './routes/spotify.js';
import songlessRoutes from './routes/songless.js';
import leaderboardRoutes from './routes/leaderboard.js';
import blindtestRoutes from './routes/blindtest.js';
import sourcesRoutes from './routes/sources.js';
import roomsRoutes from './routes/rooms.js';
import { HttpError } from './errors.js';
import { DeezerError } from './services/deezer.js';

// A browser request is same-origin when its Origin names the host it was sent
// to (nginx and Caddy pass the Host through), or the configured public URL.
// No Origin header means a non-browser client: SameSite cookies cover those.
export function isSameOrigin(origin: string | undefined, host: string | undefined): boolean {
  if (!origin) return true;
  if (origin === new URL(config.publicUrl).origin) return true;
  try {
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

export function createApp() {
  const app = express();

  // Caddy -> nginx -> here: two proxies, so req.ip is the real client for the
  // rate limiters. Keep in sync with the proxy chain.
  app.set('trust proxy', 2);
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(compression());
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api', rateLimit({
    windowMs: 60 * 1000,
    limit: 240,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, slow down' },
  }));

  // CSRF: SameSite=Lax already blocks cross-site POSTs carrying the cookie; the
  // Origin check is the second lock for any state-changing request.
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    if (!isSameOrigin(req.get('origin'), req.get('host'))) {
      return void res.status(403).json({ success: false, error: 'Bad origin' });
    }
    next();
  });

  app.use('/api', loadSession);
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', requireAdmin, adminRoutes);
  app.use('/api/spotify', spotifyRoutes);
  app.use('/api/songless', requireUser, songlessRoutes);
  app.use('/api/blindtest', requireUser, blindtestRoutes);
  app.use('/api/sources', requireUser, sourcesRoutes);
  app.use('/api/leaderboard', requireUser, leaderboardRoutes);
  // Mixed access: creating needs an account, joining/searching only a room token.
  app.use('/api/rooms', roomsRoutes);

  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, error: 'Not found' });
  });

  // Known errors carry their own status and a safe message; anything else is
  // logged server-side and answered with a generic 500.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err instanceof HttpError) {
      return void res.status(err.status).json({ success: false, error: err.message });
    }
    if (err instanceof DeezerError) {
      console.error('Deezer error:', err.message);
      return void res.status(502).json({ success: false, error: 'Deezer is unavailable, try again' });
    }
    console.error('Unhandled error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  });

  return app;
}
