import { useState } from 'react';
import { authApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { inputClass } from '../components/shared/Field';

export function LoginPage() {
  const { refresh } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authApi.login(username, password);
      await refresh();
    } catch (err) {
      setError(err instanceof Error && err.message !== 'Invalid credentials'
        ? err.message
        : 'Identifiant ou mot de passe incorrect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-neutral-200 shadow-sm p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-neutral-900 mb-2">Music</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Identifiant"
            autoComplete="username"
            className={`${inputClass} py-3 px-4 text-base`}
            autoFocus
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            autoComplete="current-password"
            className={`${inputClass} py-3 px-4 text-base`}
          />

          {error && <p className="text-sm text-red-600 text-center">{error}</p>}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full px-4 py-3 bg-neutral-900 text-white rounded-lg font-medium hover:bg-neutral-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
