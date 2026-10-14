import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { spotifyApi } from '../utils/api';
import { useAuth } from '../contexts/AuthContext';
import { PasswordForm } from '../components/shared/PasswordForm';
import { Badge, IconTile, Page, panel, primaryButton, secondaryButton } from '../components/shared/ui';
import { HeadphonesIcon, LockIcon } from '../components/shared/icons';

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
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const [passwordSaved, setPasswordSaved] = useState(false);

  // One-shot message after the OAuth redirect, then clean the URL.
  useEffect(() => {
    const status = params.get('spotify');
    if (status && SPOTIFY_MESSAGES[status]) {
      setMessage(SPOTIFY_MESSAGES[status]);
      refresh();
      setParams({}, { replace: true });
    }
  }, [params, setParams, refresh]);

  const unlink = async () => {
    await spotifyApi.unlink();
    await refresh();
    setMessage({ text: 'Spotify a été délié.', ok: true });
  };

  if (!me) return null;

  return (
    <Page>
      <div className="flex items-center gap-4 mb-8">
        <span className="w-14 h-14 rounded-full bg-neutral-900 text-white text-xl font-bold flex items-center justify-center">
          {me.display_name.slice(0, 1).toUpperCase()}
        </span>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-neutral-900">{me.display_name}</h1>
          <p className="text-neutral-500">Identifiant : {me.username}{me.is_admin ? ', administrateur' : ''}</p>
        </div>
      </div>

      <section className={`${panel} p-5 mb-4`}>
        <div className="flex items-center gap-3 mb-3">
          <IconTile icon={<HeadphonesIcon />} accent="emerald" />
          <h2 className="font-semibold text-neutral-900">Spotify</h2>
          {me.spotify && <Badge accent="emerald">Lié</Badge>}
        </div>
        {!me.spotify_available ? (
          <p className="text-sm text-neutral-500">Spotify n'est pas encore configuré sur ce serveur.</p>
        ) : me.spotify ? (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-neutral-600">
              Lié au compte <span className="font-medium text-neutral-900">{me.spotify.name}</span>. Tes titres
              les plus écoutés et tes likes alimentent ton daily perso.
            </p>
            <button onClick={unlink} className={secondaryButton}>Délier</button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-neutral-600">
              Lie ton compte pour jouer sur tes propres goûts. L'audio vient toujours de Deezer, donc pas besoin de Premium.
            </p>
            <a href={spotifyApi.connectUrl} className={`${primaryButton} shrink-0`}>Lier Spotify</a>
          </div>
        )}
        {message && (
          <p className={`text-sm mt-3 ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>{message.text}</p>
        )}
      </section>

      <section className={`${panel} p-5`}>
        <div className="flex items-center gap-3 mb-4">
          <IconTile icon={<LockIcon />} accent="neutral" />
          <h2 className="font-semibold text-neutral-900">Mot de passe</h2>
        </div>
        <PasswordForm onDone={() => setPasswordSaved(true)} />
        {passwordSaved && <p className="text-sm text-emerald-700 mt-3">Mot de passe changé. Tes autres sessions ont été déconnectées.</p>}
      </section>
    </Page>
  );
}
