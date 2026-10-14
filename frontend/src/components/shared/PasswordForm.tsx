import { useState } from 'react';
import { authApi } from '../../utils/api';
import { Field, inputClass } from './Field';
import { primaryButton } from './ui';

export function PasswordForm({ onDone, submitLabel = 'Changer le mot de passe' }: { onDone: () => void; submitLabel?: string }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (next.length < 10) return setError('Le nouveau mot de passe doit faire au moins 10 caractères.');
    if (next !== confirm) return setError('Les deux mots de passe ne correspondent pas.');
    setSaving(true);
    try {
      await authApi.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      onDone();
    } catch (err) {
      setError(err instanceof Error && err.message === 'Current password is wrong'
        ? 'Le mot de passe actuel est incorrect.'
        : err instanceof Error ? err.message : 'Échec du changement');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="Mot de passe actuel">
        <input type="password" autoComplete="current-password" value={current}
          onChange={(e) => setCurrent(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Nouveau mot de passe" hint="10 caractères minimum">
        <input type="password" autoComplete="new-password" value={next}
          onChange={(e) => setNext(e.target.value)} className={inputClass} />
      </Field>
      <Field label="Confirmation">
        <input type="password" autoComplete="new-password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} className={inputClass} />
      </Field>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={saving || !current || !next} className={primaryButton}>
        {saving ? 'Enregistrement…' : submitLabel}
      </button>
    </form>
  );
}
