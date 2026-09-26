import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { AvailabilityWindow, TimeOff } from '../../lib/types';
import { ErrorState, Spinner, ConfirmButton } from '../../components/Feedback';
import { WEEKDAY_FULL, WEEKDAY_LABELS } from '../../lib/format';

interface AvailabilityResponse {
  availability: (AvailabilityWindow & { id: string })[];
  timeOff: TimeOff[];
}

type DraftWindow = Omit<AvailabilityWindow, 'isActive' | 'id' | 'doctorId'> & { id: string };

let rowCounter = 0;
const newRowId = () => `new-${rowCounter++}`;

const EMPTY_WINDOW = (): DraftWindow => ({
  id: newRowId(),
  dayOfWeek: 1,
  startTime: '09:00',
  endTime: '17:00',
  slotDurationMinutes: 20,
  bufferMinutes: 0,
});

export function DoctorAvailabilityPage() {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DraftWindow[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [timeOffForm, setTimeOffForm] = useState({
    date: '',
    startTime: '',
    endTime: '',
    reason: '',
  });
  const [timeOffBusy, setTimeOffBusy] = useState(false);

  const query = useQuery({
    queryKey: ['my-availability'],
    queryFn: () => api<AvailabilityResponse>('/doctors/me/availability'),
  });

  useEffect(() => {
    if (query.data && draft === null) {
      setDraft(
        query.data.availability.map((w) => ({
          id: w.id,
          dayOfWeek: w.dayOfWeek,
          startTime: w.startTime,
          endTime: w.endTime,
          slotDurationMinutes: w.slotDurationMinutes,
          bufferMinutes: w.bufferMinutes,
        }))
      );
    }
  }, [query.data, draft]);

  const setRow = (id: string, patch: Partial<DraftWindow>) => {
    setDraft((rows) => (rows ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    setMessage(null);
    try {
      await api('/doctors/me/availability', {
        method: 'PUT',
        body: {
          windows: draft.map((w) => ({
            dayOfWeek: w.dayOfWeek,
            startTime: w.startTime,
            endTime: w.endTime,
            slotDurationMinutes: Number(w.slotDurationMinutes),
            bufferMinutes: Number(w.bufferMinutes),
          })),
        },
      });
      setMessage({ kind: 'ok', text: 'Schedule saved. New slots are available to patients immediately.' });
      void queryClient.invalidateQueries({ queryKey: ['my-availability'] });
      void queryClient.invalidateQueries({ queryKey: ['doctor'] });
    } catch (err) {
      setMessage({
        kind: 'err',
        text: err instanceof ApiError ? err.message : 'Could not save the schedule.',
      });
    } finally {
      setSaving(false);
    }
  };

  const addTimeOff = async () => {
    if (!timeOffForm.date) return;
    setTimeOffBusy(true);
    setMessage(null);
    try {
      await api('/doctors/me/time-off', {
        method: 'POST',
        body: {
          date: timeOffForm.date,
          startTime: timeOffForm.startTime || undefined,
          endTime: timeOffForm.endTime || undefined,
          reason: timeOffForm.reason || undefined,
        },
      });
      setTimeOffForm({ date: '', startTime: '', endTime: '', reason: '' });
      setMessage({ kind: 'ok', text: 'Time off added.' });
      void queryClient.invalidateQueries({ queryKey: ['my-availability'] });
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Could not add time off.' });
    } finally {
      setTimeOffBusy(false);
    }
  };

  const removeTimeOff = async (id: string) => {
    try {
      await api(`/doctors/me/time-off/${id}`, { method: 'DELETE' });
      void queryClient.invalidateQueries({ queryKey: ['my-availability'] });
      void queryClient.invalidateQueries({ queryKey: ['slots'] });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Could not remove time off.' });
    }
  };

  if (query.isLoading) {
    return (
      <div className="py-16 text-center">
        <Spinner label="Loading schedule…" />
      </div>
    );
  }
  if (query.isError) {
    return <ErrorState message={(query.error as Error).message} onRetry={() => void query.refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>My working hours</h1>
        <p className="mt-1 text-slate-600">
          Patients only see slots inside these windows. Changes apply immediately.
        </p>
      </div>

      {message && (
        <div
          role={message.kind === 'err' ? 'alert' : 'status'}
          className={`rounded-xl px-4 py-3 text-sm ring-1 ${
            message.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
              : 'bg-rose-50 text-rose-800 ring-rose-200'
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="card" aria-labelledby="hours-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="hours-title">Weekly schedule</h2>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setDraft([...(draft ?? []), EMPTY_WINDOW()])}
          >
            + Add window
          </button>
        </div>

        {draft !== null && draft.length === 0 && (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-center text-sm text-slate-600">
            No working hours yet — patients won&apos;t see any slots until you add a window.
          </p>
        )}

        <ul className="space-y-3">
          {(draft ?? []).map((w) => (
            <li
              key={w.id}
              className="grid items-end gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200 sm:grid-cols-6"
            >
              <div className="sm:col-span-2">
                <label className="label" htmlFor={`day-${w.id}`}>
                  Day
                </label>
                <select
                  id={`day-${w.id}`}
                  className="input"
                  value={w.dayOfWeek}
                  onChange={(e) => setRow(w.id, { dayOfWeek: Number(e.target.value) })}
                >
                  {WEEKDAY_FULL.map((name, idx) => (
                    <option key={name} value={idx}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor={`start-${w.id}`}>
                  From
                </label>
                <input
                  id={`start-${w.id}`}
                  type="time"
                  className="input"
                  value={w.startTime}
                  onChange={(e) => setRow(w.id, { startTime: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor={`end-${w.id}`}>
                  To
                </label>
                <input
                  id={`end-${w.id}`}
                  type="time"
                  className="input"
                  value={w.endTime}
                  onChange={(e) => setRow(w.id, { endTime: e.target.value })}
                />
              </div>
              <div>
                <label className="label" htmlFor={`dur-${w.id}`}>
                  Slot (min)
                </label>
                <input
                  id={`dur-${w.id}`}
                  type="number"
                  min={5}
                  max={240}
                  className="input"
                  value={w.slotDurationMinutes}
                  onChange={(e) => setRow(w.id, { slotDurationMinutes: Number(e.target.value) })}
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="label" htmlFor={`buf-${w.id}`}>
                    Buffer (min)
                  </label>
                  <input
                    id={`buf-${w.id}`}
                    type="number"
                    min={0}
                    max={120}
                    className="input"
                    value={w.bufferMinutes}
                    onChange={(e) => setRow(w.id, { bufferMinutes: Number(e.target.value) })}
                  />
                </div>
                <button
                  type="button"
                  className="btn-danger"
                  onClick={() => setDraft((rows) => (rows ?? []).filter((r) => r.id !== w.id))}
                  aria-label={`Remove ${WEEKDAY_LABELS[w.dayOfWeek]} window`}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-4 flex justify-end">
          <button type="button" className="btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : 'Save schedule'}
          </button>
        </div>
      </section>

      <section className="card" aria-labelledby="timeoff-title">
        <h2 id="timeoff-title">Time off</h2>
        <p className="mt-1 text-sm text-slate-600">
          Block specific days (leave, holidays) — those slots disappear from booking instantly.
        </p>

        <form
          className="mt-4 grid items-end gap-3 sm:grid-cols-5"
          onSubmit={(e) => {
            e.preventDefault();
            void addTimeOff();
          }}
        >
          <div>
            <label className="label" htmlFor="to-date">
              Date
            </label>
            <input
              id="to-date"
              type="date"
              required
              className="input"
              value={timeOffForm.date}
              onChange={(e) => setTimeOffForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="to-start">
              From (optional)
            </label>
            <input
              id="to-start"
              type="time"
              className="input"
              value={timeOffForm.startTime}
              onChange={(e) => setTimeOffForm((f) => ({ ...f, startTime: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="to-end">
              To (optional)
            </label>
            <input
              id="to-end"
              type="time"
              className="input"
              value={timeOffForm.endTime}
              onChange={(e) => setTimeOffForm((f) => ({ ...f, endTime: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="to-reason">
              Reason (optional)
            </label>
            <input
              id="to-reason"
              className="input"
              placeholder="Conference, leave…"
              value={timeOffForm.reason}
              onChange={(e) => setTimeOffForm((f) => ({ ...f, reason: e.target.value }))}
            />
          </div>
          <button type="submit" className="btn-primary" disabled={timeOffBusy || !timeOffForm.date}>
            {timeOffBusy ? 'Adding…' : 'Add time off'}
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {(query.data?.timeOff ?? []).map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
              <div className="text-sm">
                <span className="font-medium text-slate-800">{t.date.slice(0, 10)}</span>
                {t.startTime && t.endTime ? (
                  <span className="text-slate-600"> · {t.startTime}–{t.endTime}</span>
                ) : (
                  <span className="text-slate-600"> · Full day</span>
                )}
                {t.reason && <span className="text-slate-500"> · {t.reason}</span>}
              </div>
              <ConfirmButton
                label="Remove"
                confirmLabel="Confirm remove?"
                danger
                onConfirm={() => void removeTimeOff(t.id)}
              />
            </li>
          ))}
          {(query.data?.timeOff ?? []).length === 0 && (
            <li className="text-sm text-slate-500">No upcoming time off.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
