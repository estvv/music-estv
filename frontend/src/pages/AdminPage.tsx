import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { Field, inputClass } from '../components/shared/Field';
import { Modal } from '../components/shared/Modal';
import { Badge, ErrorText, ghostButton, LoadingState, Page, PageHeader, panel, primaryButton, secondaryButton } from '../components/shared/ui';
import { PencilIcon, PlusIcon, ShieldIcon } from '../components/shared/icons';
import { Avatar } from '../components/shared/Avatar';
import type { AdminUser } from '../types';

export function AdminPage() {
  return (
    <Page width="lg">
      <UsersSection />
    </Page>
  );
}

// --- users -------------------------------------------------------------------

function UsersSection() {
  const { me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const { refresh } = useAuth();
  const [secret, setSecret] = useState<{ username: string; password: string } | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(() => adminApi.users().then(setUsers).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const update = async (u: AdminUser, body: Parameters<typeof adminApi.updateUser>[1]) => {
    setError('');
    try {
      const res = await adminApi.updateUser(u.id, body);
      if (res.password) setSecret({ username: u.username, password: res.password });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const remove = async (u: AdminUser) => {
    if (!window.confirm(`Supprimer définitivement ${u.display_name} et tout son historique ?`)) return;
    await adminApi.deleteUser(u.id).catch((e) => setError(e.message));
    await load();
  };

  return (
    <section className="mb-12">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-neutral-900">Comptes {users && <span className="text-neutral-400 font-normal tabular-nums">{users.length}</span>}</h2>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-1 text-sm font-medium text-neutral-500 hover:text-neutral-900 transition-colors"
        >
          <PlusIcon className="w-4 h-4" />Ajouter
        </button>
      </div>

      {!users ? <LoadingState /> : (
        <div className={`${panel} overflow-x-auto`}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-500 border-b border-neutral-100 bg-neutral-50/60">
                <th className="px-4 py-2.5 font-medium">Compte</th>
                <th className="px-3 py-2.5 font-medium">Spotify</th>
                <th className="px-3 py-2.5 font-medium">État</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {users.map((u) => (
                <tr key={u.id} className={u.disabled ? 'text-neutral-400' : ''}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar url={u.avatar_url} name={u.display_name} size="sm" />
                      <div>
                        <div className="font-medium text-neutral-900 flex items-center gap-2">{u.display_name}{u.is_admin && <Badge>Admin</Badge>}</div>
                        <div className="text-xs text-neutral-500">{u.username}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    {u.spotify_name ? <Badge accent="emerald">{u.spotify_name}</Badge> : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {u.disabled ? <Badge>Désactivé</Badge>
                      : u.must_change_password ? <Badge accent="amber">Mot de passe à changer</Badge>
                      : <Badge accent="emerald">Actif</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1 whitespace-nowrap">
                      <button onClick={() => setEditing(u)} className={`${ghostButton} inline-flex items-center gap-1.5`}>
                        <PencilIcon className="w-3.5 h-3.5" />Modifier
                      </button>
                      {u.id !== me?.id && (
                        <>
                          <button onClick={() => update(u, { reset_password: true })} className={ghostButton}>Réinitialiser</button>
                          <button onClick={() => update(u, { is_admin: !u.is_admin })} className={ghostButton}>
                            {u.is_admin ? 'Retirer admin' : 'Rendre admin'}
                          </button>
                          <button onClick={() => update(u, { disabled: !u.disabled })} className={ghostButton}>
                            {u.disabled ? 'Réactiver' : 'Désactiver'}
                          </button>
                          <button onClick={() => remove(u)} className={`${ghostButton} text-red-600 hover:text-red-700`}>Supprimer</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>

      {editing && (
        <EditUserModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            // Renaming oneself also changes the header.
            if (editing.id === me?.id) refresh();
            setEditing(null);
            load();
          }}
        />
      )}
      {creating && (
        <CreateUserModal
          onClose={() => setCreating(false)}
          onCreated={(username, password) => {
            setCreating(false);
            setSecret({ username, password });
            load();
          }}
        />
      )}
      {secret && (
        <Modal title="Identifiants du compte" onClose={() => setSecret(null)}>
          <p className="text-sm text-neutral-600 mb-4">
            Transmets ces identifiants à la personne, en privé. Le mot de passe ne sera plus affiché ; elle devra le remplacer par le sien à sa première connexion.
          </p>
          <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-4 text-sm space-y-1 select-all">
            <div>Identifiant : <span className="font-semibold">{secret.username}</span></div>
            <div>Mot de passe : <span className="font-semibold font-mono">{secret.password}</span></div>
          </div>
          <div className="mt-4 flex justify-end">
            <button
              onClick={() => navigator.clipboard.writeText(`${window.location.origin}\nIdentifiant : ${secret.username}\nMot de passe : ${secret.password}`)}
              className={secondaryButton}
            >
              Copier
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

// Login name and display name of any account, the admin's own included.
function EditUserModal({ user, onClose, onSaved }: { user: AdminUser; onClose: () => void; onSaved: () => void }) {
  const [username, setUsername] = useState(user.username);
  const [displayName, setDisplayName] = useState(user.display_name);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await adminApi.updateUser(user.id, { username: username.trim(), display_name: displayName.trim() });
      onSaved();
    } catch (err) {
      setError(err instanceof Error && err.message === 'Username already taken' ? 'Cet identifiant est déjà pris.'
        : err instanceof Error ? err.message : 'Erreur');
      setSaving(false);
    }
  };

  const changedLogin = username.trim().toLowerCase() !== user.username.toLowerCase();

  return (
    <Modal title={`Modifier ${user.display_name}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Identifiant de connexion" hint="Lettres, chiffres, _ . -">
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} autoFocus />
        </Field>
        <Field label="Nom affiché" hint="Visible dans les classements, les profils et les soirées.">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
        </Field>
        {changedLogin && (
          <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            La personne devra se connecter avec « {username.trim()} ». Son mot de passe ne change pas.
          </p>
        )}
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Annuler</button>
          <button
            type="submit"
            disabled={saving || username.trim().length < 2 || !displayName.trim()}
            className={primaryButton}
          >
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: (u: string, p: string) => void }) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await adminApi.createUser({ username: username.trim(), display_name: displayName.trim() || username.trim(), is_admin: isAdmin });
      onCreated(res.user.username, res.password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur');
      setSaving(false);
    }
  };

  return (
    <Modal title="Créer un compte" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Identifiant" hint="Lettres, chiffres, _ . -">
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} autoFocus />
        </Field>
        <Field label="Nom affiché">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={username} className={inputClass} />
        </Field>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="checkbox" checked={isAdmin} onChange={(e) => setIsAdmin(e.target.checked)} />
          Administrateur
        </label>
        <ErrorText>{error}</ErrorText>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={secondaryButton}>Annuler</button>
          <button type="submit" disabled={saving || username.trim().length < 2} className={primaryButton}>Créer</button>
        </div>
      </form>
    </Modal>
  );
}
