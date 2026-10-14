import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Header } from './components/layout/Header';
import { LoadingState } from './components/shared/ui';
import { LoginPage } from './pages/LoginPage';
import { HomePage } from './pages/HomePage';
import { SonglessPage } from './pages/SonglessPage';
import { LeaderboardPage } from './pages/LeaderboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { AdminPage } from './pages/AdminPage';
import { BlindTestPage } from './pages/BlindTestPage';
import { PlaylistsPage } from './pages/PlaylistsPage';
import { PartyNewPage } from './pages/PartyNewPage';
import { PartyHostPage } from './pages/PartyHostPage';
import { JoinPage } from './pages/JoinPage';

function Shell() {
  const { me, loading } = useAuth();

  if (loading) return <LoadingState />;
  if (!me) return <LoginPage />;

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
        <Route path="/profile" element={<ProfilePage />} />
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
