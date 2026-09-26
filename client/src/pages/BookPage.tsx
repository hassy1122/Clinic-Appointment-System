import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import type { Appointment, DoctorProfile } from '../lib/types';
import { ErrorState, Spinner } from '../components/Feedback';
import { formatDateTime, formatTime, upcomingDays } from '../lib/format';
import { useDisplayTz } from '../lib/useClinic';

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
  1: 'Choose date & time',
  2: 'Your details',
  3: 'Confirm',
};

export function BookPage() {
  const { doctorId = '' } = useParams();
  const tz = useDisplayTz();
  const queryClient = useQueryClient();

  const days = useMemo(() => upcomingDays(14, tz), [tz]);
  const [date, setDate] = useState<string>('');
  const [slot, setSlot] = useState<string | null>(null);
  const [step, setStep] = useState<Step>(1);
  const [reasonForVisit, setReasonForVisit] = useState('');
  const [symptoms, setSymptoms] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [confirmed, setConfirmed] = useState<Appointment | null>(null);

  // Default to the first bookable day (re-assert once the timezone is known)
  useEffect(() => {
    if (!date && days.length > 0) setDate(days[0].dateISO);
  }, [days, date]);

  const doctorQuery = useQuery({
    queryKey: ['doctor', doctorId],
    queryFn: () => api<{ doctor: DoctorProfile }>(`/doctors/${doctorId}`),
    enabled: Boolean(doctorId),
  });

  const slotsQuery = useQuery({
    queryKey: ['slots', doctorId, date],
    queryFn: () =>
      api<{ slots: string[] }>(`/doctors/${doctorId}/slots?date=${date}`),
    enabled: Boolean(doctorId && date),
    staleTime: 30_000,
  });

  const slots = slotsQuery.data?.slots ?? [];

  // If our selection vanishes (someone else booked it), fall back to step 1
  useEffect(() => {
    if (slot && slotsQuery.isSuccess && !slots.includes(slot)) {
      setSlot(null);
      setStep(1);
    }
  }, [slots, slot, slotsQuery.isSuccess]);

  const doctor = doctorQuery.data?.doctor;

  if (doctorQuery.isLoading) {
    return (
      <div className="py-16 text-center">
        <Spinner label="Loading…" />
      </div>
    );
  }
  if (doctorQuery.isError || !doctor) {
    return <ErrorState message={(doctorQuery.error as Error)?.message ?? 'Doctor not found'} />;
  }

  const submitBooking = async () => {
    if (!slot) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api<{ appointment: Appointment }>('/appointments', {
        method: 'POST',
        body: { doctorId, startsAt: slot, reasonForVisit, symptoms: symptoms.trim() || undefined },
      });
      setConfirmed(res.appointment);
      void queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void queryClient.invalidateQueries({ queryKey: ['slots', doctorId] });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SLOT_TAKEN') {
        setError('That time slot was just taken by someone else. Please pick another time.');
        setSlot(null);
        setStep(1);
        void slotsQuery.refetch();
      } else {
        setError(err instanceof Error ? err.message : 'Booking failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  /* ------------------------------------------------------------ confirmed */

  if (confirmed) {
    return (
      <div className="mx-auto max-w-xl space-y-6 text-center">
        <div className="card">
          <span
            aria-hidden
            className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-emerald-100 text-3xl text-emerald-700"
          >
            ✓
          </span>
          <h1 className="mt-4">Appointment confirmed</h1>
          <p className="mt-2 text-slate-600">
            {doctor.user.name} · {formatDateTime(confirmed.startsAt, tz)}
          </p>
          <p className="mt-1 text-sm text-slate-500">
            A confirmation email is on its way. We&apos;ll remind you before your visit.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/patient/appointments" className="btn-primary">
              My appointments
            </Link>
            <Link to="/doctors" className="btn-secondary">
              Book another
            </Link>
          </div>
        </div>
      </div>
    );
  }

  /* ---------------------------------------------------------------- steps */

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1>Book with {doctor.user.name}</h1>
        <p className="mt-1 text-slate-600">
          {doctor.specialty} · Rs {doctor.consultationFee.toLocaleString()}
        </p>
      </div>

      {/* Stepper */}
      <ol aria-label="Booking progress" className="flex flex-wrap gap-2">
        {([1, 2, 3] as Step[]).map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => s < step && setStep(s)}
              aria-current={step === s ? 'step' : undefined}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ring-1 ring-inset ${
                step === s
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : s < step
                    ? 'bg-white text-brand-700 ring-brand-200 hover:bg-brand-50'
                    : 'bg-white text-slate-400 ring-slate-200'
              }`}
            >
              <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-white/25 text-xs">
                {s}
              </span>
              {STEP_LABELS[s]}
            </button>
          </li>
        ))}
      </ol>

      {error && (
        <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      {step === 1 && (
        <section className="space-y-5" aria-labelledby="step-time">
          <h2 id="step-time" className="sr-only">
            Choose date and time
          </h2>

          <div>
            <label className="label" htmlFor="booking-date">
              Choose a date
            </label>
            <div
              id="booking-date"
              role="group"
              aria-label="Appointment date"
              className="flex gap-2 overflow-x-auto pb-2"
            >
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
            <h3 className="mb-2 text-sm font-semibold text-slate-700">Available times</h3>
            {slotsQuery.isLoading && (
              <div className="py-6 text-center">
                <Spinner label="Loading times…" />
              </div>
            )}
            {slotsQuery.isError && (
              <ErrorState
                message={(slotsQuery.error as Error).message}
                onRetry={() => void slotsQuery.refetch()}
              />
            )}
            {slotsQuery.isSuccess && slots.length === 0 && (
              <div className="rounded-xl bg-slate-100 px-4 py-6 text-center text-sm text-slate-600">
                No open slots on this day. Try another date.
              </div>
            )}
            {slots.length > 0 && (
              <div role="group" aria-label="Available appointment times" className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSlot(s)}
                    aria-pressed={slot === s}
                    className={`min-h-11 rounded-xl px-2 py-2.5 text-sm font-semibold ring-1 ring-inset ${
                      slot === s
                        ? 'bg-brand-600 text-white ring-brand-600'
                        : 'bg-white text-slate-700 ring-slate-300 hover:bg-brand-50 hover:text-brand-700'
                    }`}
                  >
                    {formatTime(s, tz)}
                  </button>
                ))}
              </div>
            )}
            {slot && (
              <p className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
                Selected: {formatDateTime(slot, tz)}
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              disabled={!slot}
              onClick={() => setStep(2)}
            >
              Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="card space-y-4" aria-labelledby="step-details">
          <h2 id="step-details">Your details</h2>
          <div>
            <label className="label" htmlFor="reason">
              Reason for visit <span className="text-rose-600">*</span>
            </label>
            <input
              id="reason"
              className="input"
              required
              maxLength={500}
              placeholder="e.g. Follow-up after blood pressure check"
              value={reasonForVisit}
              onChange={(e) => setReasonForVisit(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-500">This helps the doctor prepare for your visit.</p>
          </div>
          <div>
            <label className="label" htmlFor="symptoms">
              Symptoms (optional)
            </label>
            <textarea
              id="symptoms"
              className="input min-h-24"
              maxLength={2000}
              placeholder="Briefly describe what you're experiencing…"
              value={symptoms}
              onChange={(e) => setSymptoms(e.target.value)}
            />
          </div>
          <div className="flex justify-between">
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={reasonForVisit.trim().length < 3}
              onClick={() => setStep(3)}
            >
              Review booking
            </button>
          </div>
        </section>
      )}

      {step === 3 && slot && (
        <section className="card space-y-4" aria-labelledby="step-confirm">
          <h2 id="step-confirm">Confirm your appointment</h2>
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">Doctor</dt>
              <dd className="text-right font-medium text-slate-900">
                {doctor.user.name} · {doctor.specialty}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">When</dt>
              <dd className="text-right font-medium text-slate-900">{formatDateTime(slot, tz)}</dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">Duration</dt>
              <dd className="text-right font-medium text-slate-900">
                {doctor.availability?.[0]?.slotDurationMinutes ?? 20} minutes
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">Fee</dt>
              <dd className="text-right font-medium text-slate-900">
                Rs {doctor.consultationFee.toLocaleString()}
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-2.5">
              <dt className="text-slate-500">Reason</dt>
              <dd className="text-right font-medium text-slate-900">{reasonForVisit}</dd>
            </div>
          </dl>
          <div className="flex justify-between">
            <button type="button" className="btn-secondary" onClick={() => setStep(2)}>
              ← Back
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={submitting}
              onClick={() => void submitBooking()}
            >
              {submitting ? 'Booking…' : 'Confirm booking'}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
