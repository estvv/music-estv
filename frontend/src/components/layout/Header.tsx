import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { LogoutIcon, MusicIcon } from '../shared/icons';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `px-3 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
    isActive ? 'text-neutral-900 bg-neutral-100' : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-50'
  }`;

export function Header() {
  const { me, logout } = useAuth();

  return (
    <header className="bg-white border-b border-neutral-200 sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-2">
        <Link to="/" className="flex items-center gap-2 mr-3 shrink-0">
          <span className="w-8 h-8 rounded-lg bg-neutral-900 text-emerald-400 flex items-center justify-center">
            <MusicIcon className="w-4.5 h-4.5" />
          </span>
          <span className="font-bold text-neutral-900 hidden sm:inline">Music</span>
        </Link>
        {me && (
          <nav className="flex items-center gap-1 overflow-x-auto min-w-0">
            <NavLink to="/" end className={navClass}>Jouer</NavLink>
            <NavLink to="/playlists" className={navClass}>Playlists</NavLink>
            <NavLink to="/leaderboard" className={navClass}>Classement</NavLink>
            {me.is_admin && <NavLink to="/admin" className={navClass}>Admin</NavLink>}
          </nav>
        )}
        <div className="flex-1" />
        {me && (
          <div className="flex items-center gap-1 shrink-0">
            <NavLink
              to="/profile"
              className={({ isActive }) => `flex items-center gap-2 pl-1 pr-1 md:pr-3 py-1 rounded-full transition-colors ${isActive ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}
              title="Profil"
            >
              <span className="w-7 h-7 rounded-full bg-neutral-900 text-white text-xs font-bold flex items-center justify-center">
                {me.display_name.slice(0, 1).toUpperCase()}
              </span>
              <span className="text-sm font-medium text-neutral-700 hidden md:inline">{me.display_name}</span>
            </NavLink>
            <button onClick={logout} title="Déconnexion" aria-label="Déconnexion" className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-50 transition-colors">
              <LogoutIcon className="w-4.5 h-4.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
