import type { AppointmentStatus } from '../lib/types';

const STYLES: Record<AppointmentStatus, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  CONFIRMED: { label: 'Confirmed', className: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  COMPLETED: { label: 'Completed', className: 'bg-slate-100 text-slate-700 ring-slate-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-rose-50 text-rose-700 ring-rose-200' },
  NO_SHOW: { label: 'No-show', className: 'bg-orange-50 text-orange-800 ring-orange-200' },
};

/**
 * Status badge — colour AND text (never colour alone, per accessibility
 * guidance in the blueprint).
 */
export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const style = STYLES[status] ?? STYLES.PENDING;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${style.className}`}
    >
      {style.label}
    </span>
  );
}
