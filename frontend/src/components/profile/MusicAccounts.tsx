import { useState } from 'react';
import { deezerApi, spotifyApi } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { AppleMusicLogo, CheckIcon, DeezerLogo, SpotifyLogo } from '../shared/icons';
import { inputClass } from '../shared/Field';
import { panel, primaryButton, secondaryButton } from '../shared/ui';

export type Notice = { text: string; ok: boolean } | null;

// One card per music service, with its logo: what is linked, and
// the single action that changes it.
function ServiceCard({ logo, name, status, children }: {
  logo: React.ReactNode;
  name: string;
  status: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={`${panel} p-4 flex flex-col gap-3`}>
      <div className="flex items-center gap-3">
        <span className="shrink-0">{logo}</span>
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900">{name}</p>
          <div className="text-xs text-neutral-500 truncate">{status}</div>
        </div>
      </div>
      {children && <div className="mt-auto">{children}</div>}
    </div>
  );
}

const linked = (label: string) => (
  <span className="inline-flex items-center gap-1 text-emerald-700"><CheckIcon className="w-3.5 h-3.5" />{label}</span>
);

export function MusicAccounts({ notice, setNotice }: { notice: Notice; setNotice: (n: Notice) => void }) {
  const { me, refresh } = useAuth();
  const [deezerRef, setDeezerRef] = useState('');
  const [busy, setBusy] = useState(false);
  if (!me) return null;

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await fn();
      await refresh();
      setNotice({ text: done, ok: true });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erreur';
      setNotice({
        text: message === 'Not a Deezer profile link' ? "Ce n'est pas un lien de profil Deezer."
          : message === 'Deezer profile not found' ? 'Profil Deezer introuvable (est-il public ?).'
          : message,
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="grid sm:grid-cols-3 gap-3">
        <ServiceCard
          logo={<SpotifyLogo className="w-8 h-8 text-[#1db954]" />}
          name="Spotify"
          status={!me.spotify_available ? 'Pas configuré sur ce serveur' : me.spotify ? linked(me.spotify.name ?? 'Lié') : 'Non relié'}
        >
          {me.spotify_available && (me.spotify
            ? <button onClick={() => run(spotifyApi.unlink, 'Spotify a été délié.')} disabled={busy} className={`${secondaryButton} w-full`}>Délier</button>
            : <a href={spotifyApi.connectUrl} className={`${primaryButton} w-full inline-flex justify-center`}>Relier Spotify</a>)}
        </ServiceCard>

        <ServiceCard
          logo={<DeezerLogo className="w-8 h-8 text-[#a238ff]" />}
          name="Deezer"
          status={me.deezer ? linked(me.deezer.name) : ''}
        >
          {me.deezer ? (
            <button onClick={() => run(deezerApi.unlink, 'Deezer a été délié.')} disabled={busy} className={`${secondaryButton} w-full`}>Délier</button>
          ) : (
            <form
              onSubmit={(e) => { e.preventDefault(); run(() => deezerApi.link(deezerRef), 'Deezer est relié.').then(() => setDeezerRef('')); }}
              className="flex gap-2"
            >
              <input
                value={deezerRef}
                onChange={(e) => setDeezerRef(e.target.value)}
                placeholder="deezer.com/profile/…"
                className={`${inputClass} py-1.5 text-sm`}
                aria-label="Lien de ton profil Deezer"
              />
              <button type="submit" disabled={busy || !deezerRef.trim()} className={`${primaryButton} shrink-0 px-3`}>Relier</button>
            </form>
          )}
        </ServiceCard>

        <ServiceCard
          logo={<AppleMusicLogo className="w-8 h-8 text-[#fa243c]" />}
          name="Apple Music"
          status="Bientôt disponible"
        >
          <button disabled className={`${secondaryButton} w-full`}>Bientôt</button>
        </ServiceCard>
      </div>
      {notice && <p className={`text-sm mt-3 ${notice.ok ? 'text-emerald-700' : 'text-red-600'}`}>{notice.text}</p>}
    </section>
  );
}
