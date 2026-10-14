import { useCallback, useEffect, useState } from 'react';
import { adminApi } from '../utils/api';
import { AddSourceModal } from '../components/sources/AddSourceModal';
import { sourceKindLabel } from '../components/sources/labels';
import { useAuth } from '../contexts/AuthContext';
import { Field, inputClass } from '../components/shared/Field';
import { Modal } from '../components/shared/Modal';
import { Badge, ErrorText, ghostButton, LoadingState, Page, PageHeader, panel, primaryButton, secondaryButton } from '../components/shared/ui';
import { ShieldIcon } from '../components/shared/icons';
import { SourceTile } from '../components/sources/SourceTile';
import type { AdminSource, AdminUser } from '../types';

export function AdminPage() {
  return (
    <Page width="lg">
      <PageHeader title="Admin" subtitle="Les comptes et les playlists du daily." icon={<ShieldIcon />} accent="neutral" />
      <UsersSection />
      <SourcesSection />
    </Page>
  );
}

// --- users -------------------------------------------------------------------

function UsersSection() {
  const { me } = useAuth();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [creating, setCreating] = useState(false);
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
        <button onClick={() => setCreating(true)} className={primaryButton}>Créer un compte</button>
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
                      <span className={`w-8 h-8 shrink-0 rounded-full text-sm font-semibold flex items-center justify-center ${u.is_admin ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-600'}`}>
                        {u.display_name.slice(0, 1).toUpperCase()}
                      </span>
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
                    {u.disabled ? <Badge>Désactivé</Badge> : <Badge accent="emerald">Actif</Badge>}
                  </td>
                  <td className="px-4 py-3">
                    {u.id !== me?.id && (
                      <div className="flex justify-end gap-1 whitespace-nowrap">
                        <button onClick={() => update(u, { reset_password: true })} className={ghostButton}>Réinitialiser</button>
                        <button onClick={() => update(u, { is_admin: !u.is_admin })} className={ghostButton}>
                          {u.is_admin ? 'Retirer admin' : 'Rendre admin'}
                        </button>
                        <button onClick={() => update(u, { disabled: !u.disabled })} className={ghostButton}>
                          {u.disabled ? 'Réactiver' : 'Désactiver'}
                        </button>
                        <button onClick={() => remove(u)} className={`${ghostButton} text-red-600 hover:text-red-700`}>Supprimer</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>

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
            Transmets ces identifiants à la personne. Le mot de passe ne sera plus affiché ; elle pourra le changer depuis son profil.
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

// --- sources -----------------------------------------------------------------

function SourcesSection() {
  const [sources, setSources] = useState<AdminSource[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => adminApi.sources().then(setSources).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  // Poll while a sync is running so the track count fills in.
  const syncing = sources?.some((s) => s.sync && !s.sync.error);
  useEffect(() => {
    if (!syncing) return;
    const timer = setInterval(load, 2000);
    return () => clearInterval(timer);
  }, [syncing, load]);

  const act = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    }
  };

  const poolSize = sources?.filter((s) => s.in_daily_pool).reduce((n, s) => n + s.track_count, 0) ?? 0;

  return (
    <section>
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-neutral-900">Playlists</h2>
        <button onClick={() => setAdding(true)} className={primaryButton}>Ajouter une playlist</button>
      </div>
      <p className="text-sm text-neutral-500 mb-3">
        Le daily commun tire un morceau par jour parmi les playlists cochées ({poolSize} morceaux). Toutes servent au mode libre.
      </p>

      {!sources ? <LoadingState /> : sources.length === 0 ? (
        <p className={`${panel} p-6 text-sm text-neutral-500 text-center`}>
          Aucune playlist : le daily ne peut pas démarrer. Ajoute une playlist Deezer publique, par exemple un top national.
        </p>
      ) : (
        <ul className={`${panel} divide-y divide-neutral-100`}>
          {sources.map((s) => (
            <li key={s.id} className="px-4 py-3 flex items-center gap-3">
              <input
                type="checkbox"
                checked={s.in_daily_pool}
                onChange={(e) => act(() => adminApi.setInPool(s.id, e.target.checked))}
                title="Dans le pool du daily"
                aria-label={`${s.name} dans le pool du daily`}
                className="accent-emerald-600 w-4 h-4"
              />
              <SourceTile kind={s.kind} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-neutral-900 truncate">{s.name}</div>
                <div className="text-xs text-neutral-500">
                  {sourceKindLabel(s.kind)}{s.owner_name ? ` de ${s.owner_name}` : ''}, {s.track_count} morceaux jouables
                  {s.sync && !s.sync.error && `, synchro ${s.sync.done}/${s.sync.total || '…'}`}
                  {s.sync?.error && <span className="text-red-600">, échec : {s.sync.error}</span>}
                </div>
              </div>
              <button onClick={() => act(() => adminApi.syncSource(s.id))} className={ghostButton}>Resynchroniser</button>
              <button
                onClick={() => window.confirm(`Retirer « ${s.name} » ?`) && act(() => adminApi.deleteSource(s.id))}
                className={`${ghostButton} text-red-600 hover:text-red-700`}
              >
                Retirer
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2"><ErrorText>{error}</ErrorText></div>

      {adding && (
        <AddSourceModal
          showDailyPool
          submit={(kind, ref, in_daily_pool) => adminApi.createSource({ kind, ref, in_daily_pool })}
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); load(); }}
        />
      )}
    </section>
  );
}
