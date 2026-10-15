import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Header } from './components/layout/Header';
import { LoadingState } from './components/shared/ui';
import { LoginPage } from './pages/LoginPage';
import { ForcedPasswordPage } from './pages/ForcedPasswordPage';
import { HomePage } from './pages/HomePage';
import { SonglessPage } from './pages/SonglessPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { PlayerPage } from './pages/PlayerPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { BlindTestPage } from './pages/BlindTestPage';
import { PlaylistsPage } from './pages/PlaylistsPage';
import { PartyNewPage } from './pages/PartyNewPage';
import { PartyHostPage } from './pages/PartyHostPage';
import { JoinPage } from './pages/JoinPage';
import { PROFILE_SETTINGS_PATH, profilePath } from './utils/paths';

// Redirect that keeps the query string (?spotify=… after linking Spotify).
function KeepQuery({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={`${to}${search}`} replace />;
}

// /joueur/<id>: the profile page resolves the id and switches to the username.
function LegacyProfile() {
  const { ref = '' } = useParams();
  return <Navigate to={profilePath(ref)} replace />;
}

function Shell() {
  const { me, loading } = useAuth();

  if (loading) return <LoadingState />;
  if (!me) return <LoginPage />;
  if (me.must_change_password) return <ForcedPasswordPage />;

  return (
    <div className="min-h-screen bg-neutral-50">
      <Header />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/songless/:id" element={<SonglessPage />} />
        <Route path="/blindtest/:id" element={<BlindTestPage />} />
        <Route path="/playlists" element={<PlaylistsPage />} />
        <Route path="/party/new" element={<PartyNewPage />} />
        <Route path="/party/:code" element={<PartyHostPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path={PROFILE_SETTINGS_PATH} element={<ProfilePage />} />
        <Route path="/profiles/:ref" element={<PlayerPage />} />
        {/* Older addresses. */}
        <Route path="/profile" element={<KeepQuery to={PROFILE_SETTINGS_PATH} />} />
        <Route path="/joueur/:ref" element={<LegacyProfile />} />
        {me.is_admin && <Route path="/admin" element={<AdminPage />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Party guests join from their phone without an account. */}
          <Route path="/join" element={<JoinPage />} />
          <Route path="/join/:code" element={<JoinPage />} />
          <Route path="*" element={<Shell />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
