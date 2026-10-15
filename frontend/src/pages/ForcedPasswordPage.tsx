import { useAuth } from '../contexts/AuthContext';
import { PasswordForm } from '../components/shared/PasswordForm';
import { LockIcon } from '../components/shared/icons';

// Shown instead of the app while the account still has the password the admin
// generated: the server refuses everything else until it is replaced.
export function ForcedPasswordPage() {
  const { me, refresh, logout } = useAuth();
  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
      <div className="max-w-sm w-full bg-white rounded-2xl border border-neutral-200 shadow-sm p-8">
        <div className="text-center mb-6">
          <span className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-neutral-900 text-emerald-400 flex items-center justify-center">
            <LockIcon className="w-7 h-7" />
          </span>
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">Choisis ton mot de passe</h1>
          <p className="text-sm text-neutral-600">
            Bienvenue {me?.display_name}. Le mot de passe que tu as reçu a été généré par l'admin : remplace-le par le tien
            pour accéder au site.
          </p>
        </div>
        <PasswordForm onDone={refresh} submitLabel="Valider et continuer" />
        <button onClick={logout} className="mt-4 w-full text-center text-sm text-neutral-500 hover:text-neutral-900">
          Se déconnecter
        </button>
      </div>
    </div>
  );
}
