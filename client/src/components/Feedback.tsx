import { useState, type ReactNode } from 'react';

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      <span className="text-sm">{label}</span>
    </span>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card border-rose-200 bg-rose-50 text-rose-800" role="alert">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-sm">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary mt-3 bg-white">
          Try again
        </button>
      )}
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="card text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

/** Two-step destructive button: click once arms it, click again confirms. */
export function ConfirmButton({
  label,
  confirmLabel = 'Confirm?',
  onConfirm,
  danger = false,
  disabled = false,
}: {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);

  const handleClick = async () => {
    if (!armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 4000);
      return;
    }
    setArmed(false);
    await onConfirm();
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void handleClick()}
      className={armed ? 'btn-danger !bg-rose-600 !text-white !ring-rose-600' : danger ? 'btn-danger' : 'btn-secondary'}
      aria-live="polite"
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
