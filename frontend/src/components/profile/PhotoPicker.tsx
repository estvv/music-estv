import { useRef, useState } from 'react';
import { authApi } from '../../utils/api';
import { useAuth } from '../../contexts/AuthContext';
import { Avatar } from '../shared/Avatar';

const SIZE = 256;

// Centre-crops the picked image to a square and shrinks it to 256 px, so the
// upload stays a few dozen KB whatever the original was.
async function squareThumbnail(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.getContext('2d')!.drawImage(
    bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE,
  );
  bitmap.close();
  const encode = (type: string) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.85));
  // WebP where the browser can encode it, JPEG otherwise.
  const webp = await encode('image/webp');
  const blob = webp?.type === 'image/webp' ? webp : await encode('image/jpeg');
  if (!blob) throw new Error("Impossible de lire l'image");
  return blob;
}

// The account picture: an uploaded one wins over the Spotify one; removing it
// falls back to Spotify, or to the user icon.
export function PhotoPicker() {
  const { me, refresh } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!me) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return setError('Choisis une image (JPEG, PNG, WebP…).');
    run(async () => authApi.uploadAvatar(await squareThumbnail(file)));
  };

  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => input.current?.click()} disabled={busy} title="Changer la photo" className="relative group rounded-full">
        <Avatar url={me.avatar_url} name={me.display_name} size="lg" />
        <span className="absolute inset-0 rounded-full bg-neutral-900/50 text-white text-[10px] font-semibold flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          {busy ? '…' : 'Changer'}
        </span>
      </button>
      <div className="min-w-0">
        <h1 className="text-2xl md:text-3xl font-bold text-neutral-900 truncate">{me.display_name}</h1>
        {/* Same line as on the public profile. */}
        <p className="flex items-center gap-2 text-xs text-neutral-400">
          <span className="text-neutral-500 font-medium">@{me.username}</span>
          {me.is_admin && <span className="px-1.5 py-0.5 rounded bg-neutral-100 text-[11px] font-medium text-neutral-600">Admin</span>}
        </p>
        <div className="flex items-center gap-3 mt-1 text-xs">
          {me.avatar_custom && (
            <button type="button" onClick={() => run(authApi.removeAvatar)} disabled={busy} className="font-medium text-neutral-500 hover:text-red-600">
              Retirer
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/*" onChange={onFile} className="hidden" />
    </div>
  );
}
