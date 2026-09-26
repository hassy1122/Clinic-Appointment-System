import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DoctorProfile } from '../lib/types';
import { ErrorState, Spinner } from '../components/Feedback';
import { formatFee, formatWallTime, WEEKDAY_FULL } from '../lib/format';
import { useAuth } from '../auth/AuthContext';

export function DoctorProfilePage() {
  const { doctorId = '' } = useParams();
  const { user } = useAuth();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['doctor', doctorId],
    queryFn: () => api<{ doctor: DoctorProfile }>(`/doctors/${doctorId}`),
    enabled: Boolean(doctorId),
  });

  if (isLoading) {
    return (
      <div className="py-16 text-center">
        <Spinner label="Loading profile…" />
      </div>
    );
  }
  if (isError || !data) {
    return <ErrorState message={(error as Error)?.message ?? 'Doctor not found'} onRetry={() => void refetch()} />;
  }

  const d = data.doctor;
  const initials = d.user.name.replace(/^Dr\.\s*/, '').charAt(0);

  // Group windows by weekday for the hours table
  const hoursByDay = new Map<number, string[]>();
  for (const w of d.availability ?? []) {
    const list = hoursByDay.get(w.dayOfWeek) ?? [];
    list.push(`${formatWallTime(w.startTime)} – ${formatWallTime(w.endTime)}`);
    hoursByDay.set(w.dayOfWeek, list);
  }
  const daysWithHours = [...hoursByDay.keys()].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="text-sm text-slate-500">
        <Link to="/doctors" className="hover:text-brand-700 hover:underline">
          ← All doctors
        </Link>
      </nav>

      <section className="card sm:flex sm:gap-6">
        <span
          aria-hidden
          className="mx-auto grid h-20 w-20 shrink-0 place-items-center rounded-full bg-brand-100 text-3xl font-bold text-brand-700 sm:mx-0"
        >
          {initials}
        </span>
        <div className="mt-4 flex-1 sm:mt-0">
          <h1>{d.user.name}</h1>
          <p className="mt-1 font-medium text-brand-700">{d.specialty}</p>
          <p className="mt-3 max-w-2xl text-slate-600">{d.bio}</p>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-800">
              Consultation fee: Rs {formatFee(d.consultationFee)}
            </span>
          </div>
          <div className="mt-5">
            {user?.role === 'PATIENT' ? (
              <Link to={`/book/${d.id}`} className="btn-primary">
                Book an appointment
              </Link>
            ) : user ? (
              <p className="text-sm text-slate-500">Sign in with a patient account to book.</p>
            ) : (
              <Link to={`/login?next=${encodeURIComponent(`/book/${d.id}`)}`} className="btn-primary">
                Sign in to book
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section aria-labelledby="hours" className="card">
          <h2 id="hours">Working hours</h2>
          {daysWithHours.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No working hours published yet.</p>
          ) : (
            <dl className="mt-3 divide-y divide-slate-100">
              {daysWithHours.map((day) => (
                <div key={day} className="flex items-center justify-between gap-4 py-2">
                  <dt className="text-sm font-medium text-slate-700">{WEEKDAY_FULL[day]}</dt>
                  <dd className="text-sm text-slate-600">
                    {(hoursByDay.get(day) ?? []).join(' · ')}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section aria-labelledby="good-to-know" className="card">
          <h2 id="good-to-know">Good to know</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-600">
            <li>Slots shown in the booking calendar are live — no waiting for confirmation calls.</li>
            <li>You can reschedule or cancel free of charge from your dashboard.</li>
            <li>You&apos;ll receive email confirmation and reminders before your visit.</li>
            <li>Please arrive 10 minutes early with any previous reports.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
