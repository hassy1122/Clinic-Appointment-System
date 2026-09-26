import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { Appointment, ConsultationNote, PrescriptionItem } from '../../lib/types';
import { EmptyState, ErrorState, Spinner, ConfirmButton } from '../../components/Feedback';
import { StatusBadge } from '../../components/StatusBadge';
import { dayISO, formatTime, relativeDayLabel } from '../../lib/format';
import { useDisplayTz } from '../../lib/useClinic';

type Tab = 'today' | 'upcoming' | 'past';

export function DoctorDashboardPage() {
  const [tab, setTab] = useState<Tab>('today');
  const [openNotesFor, setOpenNotesFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const tz = useDisplayTz();
  const queryClient = useQueryClient();

  const scope = tab === 'past' ? 'past' : 'upcoming';
  const { data, isLoading, isError, error: loadError, refetch } = useQuery({
    queryKey: ['appointments', 'doctor', scope],
    queryFn: () => api<{ appointments: Appointment[] }>(`/appointments/mine?scope=${scope}`),
  });

  const setStatus = async (id: string, status: 'COMPLETED' | 'NO_SHOW') => {
    setError(null);
    try {
      await api(`/appointments/${id}/status`, { method: 'PUT', body: { status } });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the appointment.');
    }
  };

  const all = data?.appointments ?? [];
  const todayISO = dayISO(new Date().toISOString(), tz);
  const appointments =
    tab === 'today' ? all.filter((a) => dayISO(a.startsAt, tz) === todayISO) : all;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Today&apos;s schedule</h1>
          <p className="mt-1 text-slate-600">Your visits, notes and outcomes in one place.</p>
        </div>
        <Link to="/doctor/availability" className="btn-secondary">
          Edit my working hours
        </Link>
      </div>

      <div role="tablist" aria-label="Schedule view" className="flex gap-2">
        {(['today', 'upcoming', 'past'] as Tab[]).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              setOpenNotesFor(null);
            }}
            className={`min-h-11 rounded-xl px-4 py-2 text-sm font-semibold capitalize ring-1 ring-inset ${
              tab === t
                ? 'bg-brand-600 text-white ring-brand-600'
                : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-100'
            }`}
          >
            {t}
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
          <Spinner label="Loading schedule…" />
        </div>
      )}
      {isError && <ErrorState message={(loadError as Error).message} onRetry={() => void refetch()} />}

      {data && appointments.length === 0 && (
        <EmptyState
          title={tab === 'today' ? 'No appointments today' : `No ${tab} appointments`}
          hint={
            tab === 'today'
              ? 'Enjoy the quiet — new bookings appear here instantly.'
              : 'Appointments will appear here as patients book.'
          }
        />
      )}

      <ul className="space-y-4">
        {appointments.map((a) => (
          <li key={a.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{a.patient?.name}</p>
                  <StatusBadge status={a.status} />
                  {a.patient?.phone && <span className="text-sm text-slate-500">{a.patient.phone}</span>}
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="font-medium text-slate-800">{relativeDayLabel(a.startsAt, tz)}</span> ·{' '}
                  {formatTime(a.startsAt, tz)} · {a.durationMinutes} min
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  <span className="text-slate-500">Reason:</span> {a.reasonForVisit}
                </p>
                {a.symptoms && (
                  <p className="mt-1 text-sm text-slate-600">
                    <span className="text-slate-500">Symptoms:</span> {a.symptoms}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {(a.status === 'CONFIRMED' || a.status === 'PENDING') && (
                  <>
                    <ConfirmButton
                      label="Mark completed"
                      confirmLabel="Confirm completed"
                      onConfirm={() => void setStatus(a.id, 'COMPLETED')}
                    />
                    <ConfirmButton
                      label="No-show"
                      confirmLabel="Confirm no-show?"
                      danger
                      onConfirm={() => void setStatus(a.id, 'NO_SHOW')}
                    />
                  </>
                )}
                <button
                  type="button"
                  className="btn-secondary"
                  aria-expanded={openNotesFor === a.id}
                  onClick={() => setOpenNotesFor(openNotesFor === a.id ? null : a.id)}
                >
                  {openNotesFor === a.id ? 'Close notes' : 'Consultation notes'}
                </button>
              </div>
            </div>

            {openNotesFor === a.id && <NotesPanel appointmentId={a.id} onSaved={() => setOpenNotesFor(null)} />}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ notes panel */

function NotesPanel({ appointmentId, onSaved }: { appointmentId: string; onSaved: () => void }) {
  const [notes, setNotes] = useState<string | null>(null);
  const [prescriptions, setPrescriptions] = useState<PrescriptionItem[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['note', appointmentId],
    queryFn: async () => {
      try {
        const res = await api<{ note: ConsultationNote }>(`/appointments/${appointmentId}/notes`);
        return res.note;
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
  });

  // Seed the form once the existing note loads (without clobbering edits)
  useEffect(() => {
    if (notes === null && query.data !== undefined) {
      setNotes(query.data?.notes ?? '');
      setPrescriptions(query.data?.prescriptions ?? []);
    }
  }, [query.data, notes]);

  const rows = prescriptions ?? [];
  const loaded = notes !== null && prescriptions !== null;

  const setRow = (index: number, patch: Partial<PrescriptionItem>) => {
    setPrescriptions(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    if (!loaded) return;
    setSaving(true);
    setError(null);
    try {
      await api(`/appointments/${appointmentId}/notes`, {
        method: 'PUT',
        body: { notes: notes!.trim() || '—', prescriptions: rows.filter((r) => r.medication.trim()) },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save notes.');
    } finally {
      setSaving(false);
    }
  };

  if (query.isLoading) {
    return (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <Spinner label="Loading notes…" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="mt-4 border-t border-slate-100 pt-4">
        <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
      <div>
        <label className="label" htmlFor={`notes-${appointmentId}`}>
          Consultation notes (stored encrypted)
        </label>
        <textarea
          id={`notes-${appointmentId}`}
          className="input min-h-28"
          placeholder="Findings, advice, follow-up plan…"
          value={notes ?? ''}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">Prescriptions</span>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setPrescriptions([...rows, { medication: '', dosage: '', instructions: '' }])}
          >
            + Add medication
          </button>
        </div>
        {rows.length === 0 && <p className="text-sm text-slate-500">No medications added yet.</p>}
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="grid gap-2 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-[1fr_1fr_1fr_auto]">
              <label className="sr-only" htmlFor={`med-${i}`}>
                Medication
              </label>
              <input
                id={`med-${i}`}
                className="input"
                placeholder="Medication"
                value={r.medication}
                onChange={(e) => setRow(i, { medication: e.target.value })}
              />
              <label className="sr-only" htmlFor={`dosage-${i}`}>
                Dosage
              </label>
              <input
                id={`dosage-${i}`}
                className="input"
                placeholder="Dosage (e.g. 10ml twice daily)"
                value={r.dosage}
                onChange={(e) => setRow(i, { dosage: e.target.value })}
              />
              <label className="sr-only" htmlFor={`instructions-${i}`}>
                Instructions
              </label>
              <input
                id={`instructions-${i}`}
                className="input"
                placeholder="Instructions (optional)"
                value={r.instructions ?? ''}
                onChange={(e) => setRow(i, { instructions: e.target.value })}
              />
              <button
                type="button"
                className="btn-danger"
                onClick={() => setPrescriptions(rows.filter((_, idx) => idx !== i))}
                aria-label={`Remove ${r.medication || 'medication'}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      <div className="flex justify-end gap-2">
        <button type="button" className="btn-secondary" onClick={onSaved}>
          Close
        </button>
        <button type="button" className="btn-primary" disabled={saving || !loaded} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save notes'}
        </button>
      </div>
    </div>
  );
}
