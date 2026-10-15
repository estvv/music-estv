import { useEffect } from 'react';

interface ModalProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  // Sticks under the scrolling body: the main actions stay in reach.
  footer?: React.ReactNode;
  width?: 'sm' | 'md' | 'lg';
}

const WIDTHS = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl' };

export function Modal({ title, subtitle, onClose, children, footer, width = 'sm' }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // The page behind must not scroll along with the modal's list.
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-neutral-900/40 backdrop-blur-[2px] sm:p-4 animate-[fade-in_120ms_ease-out]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className={`w-full ${WIDTHS[width]} max-h-[90vh] flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-neutral-200 animate-[pop-in_160ms_ease-out]`}
      >
        <div className={`flex ${subtitle ? 'items-start' : 'items-center'} justify-between gap-4 px-6 pt-5 pb-4`}>
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-neutral-900 truncate">{title}</h2>
            {subtitle && <div className="text-sm text-neutral-500 mt-0.5">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            className="-mr-2 p-1.5 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
            title="Fermer"
            type="button"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 pb-6 overflow-y-auto min-h-0">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-neutral-100 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

// Replaces window.confirm: same look as the other dialogs.
export function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onClose }: {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-neutral-200 bg-white text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors">
            Annuler
          </button>
          <button
            type="button"
            autoFocus
            onClick={async () => { await onConfirm(); onClose(); }}
            className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-neutral-900 hover:bg-neutral-800'}`}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-neutral-600">{message}</div>
    </Modal>
  );
}
