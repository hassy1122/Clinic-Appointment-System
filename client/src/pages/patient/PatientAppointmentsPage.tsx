import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Appointment } from '../../lib/types';
import { EmptyState, ErrorState, Spinner, ConfirmButton } from '../../components/Feedback';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime, formatTime, upcomingDays, relativeDayLabel } from '../../lib/format';
import { useDisplayTz } from '../../lib/useClinic';

type Scope = 'upcoming' | 'past';

export function PatientAppointmentsPage() {
  const [scope, setScope] = useState<Scope>('upcoming');
  const tz = useDisplayTz();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState<Appointment | null>(null);

  const { data, isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey: ['appointments', scope],
    queryFn: () => api<{ appointments: Appointment[] }>(`/appointments/mine?scope=${scope}`),
  });

  const appointments = data?.appointments ?? [];

  const cancelAppointment = async (id: string) => {
    setError(null);
    try {
      await api(`/appointments/${id}/cancel`, { method: 'PUT', body: { reason: 'Cancelled by patient' } });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel the appointment.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>My appointments</h1>
          <p className="mt-1 text-slate-600">Manage your upcoming visits and review your history.</p>
        </div>
        <Link to="/doctors" className="btn-primary">
          Book new appointment
        </Link>
      </div>

      <div role="tablist" aria-label="Appointment scope" className="flex gap-2">
        {(['upcoming', 'past'] as Scope[]).map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={scope === s}
            type="button"
            onClick={() => setScope(s)}
            className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-inset capitalize ${
              scope === s
                ? 'bg-brand-600 text-white ring-brand-600'
                : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-100'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="py-12 text-center">
          <Spinner label="Loading appointments…" />
        </div>
      )}
      {isError && <ErrorState message={(loadError as Error).message} onRetry={() => void refetch()} />}

      {data && appointments.length === 0 && (
        <EmptyState
          title={scope === 'upcoming' ? 'No upcoming appointments' : 'No past appointments yet'}
          hint={
            scope === 'upcoming'
              ? 'When you book a visit, it will show up here with live status updates.'
              : 'Your visit history will appear here after your first appointment.'
          }
          action={
            scope === 'upcoming' ? (
              <Link to="/doctors" className="btn-primary">
                Find a doctor
              </Link>
            ) : undefined
          }
        />
      )}

      <ul className="space-y-4">
        {appointments.map((a) => {
          const canManage = scope === 'upcoming' && (a.status === 'CONFIRMED' || a.status === 'PENDING');
          return (
            <li key={a.id} className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{a.doctor?.user.name}</p>
                    <span className="text-sm text-slate-500">· {a.doctor?.specialty}</span>
                    <StatusBadge status={a.status} />
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="font-medium text-slate-800">{relativeDayLabel(a.startsAt, tz)}</span>{' '}
                    · {formatDateTime(a.startsAt, tz)} · {a.durationMinutes} min
                  </p>
                  <p className="mt-2 text-sm text-slate-600">
                    <span className="text-slate-500">Reason:</span> {a.reasonForVisit}
                  </p>
                  {a.status === 'CANCELLED' && a.cancelReason && (
                    <p className="mt-1 text-sm text-rose-600">
                      {a.cancelReason === 'rescheduled' ? 'Superseded by a rescheduled booking' : `Cancelled — ${a.cancelReason}`}
                    </p>
                  )}
                </div>

                {canManage && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => setRescheduling(a)}
                    >
                      Reschedule
                    </button>
                    <ConfirmButton
                      label="Cancel"
                      confirmLabel="Confirm cancel?"
                      danger
                      onConfirm={() => void cancelAppointment(a.id)}
                    />
                  </div>
                )}
                {scope === 'past' && (a.status === 'COMPLETED' || a.status === 'NO_SHOW') && (
                  <Link to={`/doctors/${a.doctorId}`} className="btn-secondary">
                    Book again
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {rescheduling && (
        <RescheduleDialog
          appointment={rescheduling}
          onClose={() => setRescheduling(null)}
          onDone={() => {
            setRescheduling(null);
            void queryClient.invalidateQueries({ queryKey: ['appointments'] });
            void queryClient.invalidateQueries({ queryKey: ['slots'] });
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------ reschedule */

function RescheduleDialog({
  appointment,
  onClose,
  onDone,
}: {
  appointment: Appointment;
  onClose: () => void;
  onDone: () => void;
}) {
  const tz = useDisplayTz();
  const days = upcomingDays(14, tz);
  const [date, setDate] = useState(days[0]?.dateISO ?? '');
  const [slot, setSlot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const slotsQuery = useQuery({
    queryKey: ['slots', appointment.doctorId, date],
    queryFn: () => api<{ slots: string[] }>(`/doctors/${appointment.doctorId}/slots?date=${date}`),
    enabled: Boolean(date),
    staleTime: 15_000,
  });
  const slots = slotsQuery.data?.slots ?? [];

  const submit = async () => {
    if (!slot) return;
    setSubmitting(true);
    setError(null);
    try {
      await api(`/appointments/${appointment.id}/reschedule`, {
        method: 'PUT',
        body: { startsAt: slot },
      });
      onDone();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') {
        setError('That slot was just taken. Please pick another time.');
        setSlot(null);
        void slotsQuery.refetch();
      } else {
        setError(err instanceof Error ? err.message : 'Reschedule failed.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reschedule-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="reschedule-title">Reschedule appointment</h2>
            <p className="mt-1 text-sm text-slate-500">
              {appointment.doctor?.user.name} · currently {formatDateTime(appointment.startsAt, tz)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="btn-secondary min-h-11" aria-label="Close dialog">
            ✕
          </button>
        </div>

        <div className="mt-5 space-y-4">
          <div>
            <span className="label">New date</span>
            <div role="group" aria-label="New appointment date" className="flex gap-2 overflow-x-auto pb-2">
              {days.map((d) => (
                <button
                  key={d.dateISO}
                  type="button"
                  onClick={() => {
                    setDate(d.dateISO);
                    setSlot(null);
                  }}
                  aria-pressed={date === d.dateISO}
                  className={`min-h-11 shrink-0 rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-inset ${
                    date === d.dateISO
                      ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-100'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="label">New time</span>
            {slotsQuery.isLoading && <Spinner label="Loading times…" />}
            {slotsQuery.isSuccess && slots.length === 0 && (
              <p className="rounded-xl bg-slate-100 px-4 py-4 text-center text-sm text-slate-600">
                No open slots on this day.
              </p>
            )}
            <div role="group" aria-label="Available times" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSlot(s)}
                  aria-pressed={slot === s}
                  className={`min-h-11 rounded-xl px-2 py-2.5 text-sm font-semibold ring-1 ring-inset ${
                    slot === s
                      ? 'bg-brand-600 text-white ring-brand-600'
                      : 'bg-white text-slate-700 ring-slate-300 hover:bg-brand-50'
                  }`}
                >
                  {formatTime(s, tz)}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Keep current time
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!slot || submitting}
              onClick={() => void submit()}
            >
              {submitting ? 'Rescheduling…' : 'Confirm new time'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
