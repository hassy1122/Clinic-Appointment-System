import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { AdminStats } from '../../lib/types';
import { ErrorState, Spinner } from '../../components/Feedback';
import { StatusBadge } from '../../components/StatusBadge';
import { formatTime, relativeDayLabel } from '../../lib/format';
import { useDisplayTz } from '../../lib/useClinic';

export function AdminOverviewPage() {
  const tz = useDisplayTz();
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: () => api<{ stats: AdminStats }>('/admin/stats'),
  });

  if (isLoading) {
    return (
      <div className="py-16 text-center">
        <Spinner label="Loading overview…" />
      </div>
    );
  }
  if (isError || !data) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const s = data.stats;

  const cards = [
    { label: 'Appointments today', value: s.todayTotal },
    { label: 'Completed today', value: s.todayCompleted },
    { label: 'Upcoming (all time)', value: s.upcoming },
    { label: 'Active doctors', value: s.doctors },
    {
      label: 'No-show rate (30d)',
      value: `${s.last30Days.noShowRate}%`,
      hint: `${s.last30Days.byStatus.NO_SHOW ?? 0} no-shows / ${(s.last30Days.byStatus.COMPLETED ?? 0) + (s.last30Days.byStatus.NO_SHOW ?? 0)} finished`,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Clinic overview</h1>
          <p className="mt-1 text-slate-600">Today at a glance, plus the latest booking activity.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/appointments" className="btn-secondary">
            All appointments
          </Link>
          <Link to="/admin/doctors" className="btn-primary">
            Manage doctors
          </Link>
        </div>
      </div>

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="card">
            <p className="text-sm text-slate-500">{c.label}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{c.value}</p>
            {c.hint && <p className="mt-1 text-xs text-slate-500">{c.hint}</p>}
          </div>
        ))}
      </section>

      <section aria-labelledby="todays" className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="todays">Today&apos;s appointments</h2>
          <Link to="/admin/appointments" className="text-sm font-semibold text-brand-700 hover:underline">
            View all →
          </Link>
        </div>
        {s.todaysAppointments.length === 0 ? (
          <p className="rounded-xl bg-slate-100 px-4 py-6 text-center text-sm text-slate-600">
            No appointments scheduled for today.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {s.todaysAppointments.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium text-slate-90">
                    {formatTime(a.startsAt, tz)} · {a.patient?.name}
                  </p>
                  <p className="text-sm text-slate-500">
                    {a.doctor?.user.name} · {a.reasonForVisit}
                  </p>
                </div>
                <StatusBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
        {s.todaysAppointments.length > 0 && (
          <p className="mt-3 text-sm text-slate-500">
            {relativeDayLabel(s.todaysAppointments[0].startsAt, tz)} · times in {tz ?? 'local time'}
          </p>
        )}
      </section>
    </div>
  );
}
