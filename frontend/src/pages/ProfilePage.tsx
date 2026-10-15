import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PasswordForm } from '../components/shared/PasswordForm';
import { PresentationSection, type Favorite } from '../components/profile/PresentationSection';
import { PhotoPicker } from '../components/profile/PhotoPicker';
import { ProfilePreview } from '../components/profile/ProfilePreview';
import { MusicAccounts, type Notice } from '../components/profile/MusicAccounts';
import { Page, panel } from '../components/shared/ui';
import { ChevronDownIcon, EyeIcon, LockIcon } from '../components/shared/icons';
import { profilePath } from '../utils/paths';

const SPOTIFY_MESSAGES: Record<string, { text: string; ok: boolean }> = {
  linked: { text: 'Spotify est lié à ton compte.', ok: true },
  denied: { text: "Tu as refusé l'accès sur Spotify : rien n'a été lié.", ok: false },
  invalid: { text: 'Le retour de Spotify était invalide ou expiré. Recommence.', ok: false },
  session: { text: "Ta session n'a pas suivi le retour de Spotify. Reconnecte-toi ici puis recommence.", ok: false },
  error: {
    text: "Spotify a refusé la liaison. Si ton compte Spotify n'a pas été ajouté par l'admin dans le dashboard Spotify, demande-lui.",
    ok: false,
  },
};

export function ProfilePage() {
  const { me, refresh } = useAuth();
  const [params, setParams] = useSearchParams();
  const [notice, setNotice] = useState<Notice>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [draft, setDraft] = useState<{ bio: string; favorites: Favorite[] }>({ bio: '', favorites: [] });
  const onDraft = useCallback((d: { bio: string; favorites: Favorite[] }) => setDraft(d), []);

  // One-shot message after the Spotify redirect, then clean the URL.
  useEffect(() => {
    const status = params.get('spotify');
    if (status && SPOTIFY_MESSAGES[status]) {
      setNotice(SPOTIFY_MESSAGES[status]);
      refresh();
      setParams({}, { replace: true });
    }
  }, [params, setParams, refresh]);

  if (!me) return null;

  return (
    <Page width="lg">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <PhotoPicker />
        <Link
          to={profilePath(me.username)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-neutral-100 text-sm font-medium text-neutral-700 hover:bg-neutral-200 hover:text-neutral-900 transition-colors"
        >
          <EyeIcon className="w-4 h-4" />Voir mon profil public
        </Link>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
        <PresentationSection userId={me.id} onDraft={onDraft} />
        <div className="lg:sticky lg:top-20">
          <ProfilePreview me={me} bio={draft.bio} favorites={draft.favorites} />
        </div>
      </div>

      <div className="mt-10">
        <MusicAccounts notice={notice} setNotice={setNotice} />
      </div>

      {/* Rarely needed: folded away. */}
      <details className={`${panel} mt-10 group`}>
        <summary className="flex items-center gap-3 px-5 py-4 cursor-pointer list-none select-none">
          <span className="w-9 h-9 rounded-lg bg-neutral-100 text-neutral-600 flex items-center justify-center"><LockIcon className="w-4 h-4" /></span>
          <span className="flex-1">
            <span className="block font-semibold text-neutral-900">Mot de passe</span>
            <span className="block text-xs text-neutral-500">Changer le mot de passe de connexion</span>
          </span>
          <ChevronDownIcon className="w-5 h-5 text-neutral-400 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5 pt-1 max-w-md">
          <PasswordForm onDone={() => setPasswordSaved(true)} />
          {passwordSaved && <p className="text-sm text-emerald-700 mt-3">Mot de passe changé. Tes autres sessions ont été déconnectées.</p>}
        </div>
      </details>
    </Page>
  );
}
