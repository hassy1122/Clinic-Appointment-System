import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { Appointment, AppointmentStatus, Paginated } from '../../lib/types';
import { ErrorState, Spinner } from '../../components/Feedback';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../lib/format';
import { useDisplayTz } from '../../lib/useClinic';

const STATUSES: (AppointmentStatus | 'ALL')[] = [
  'ALL',
  'CONFIRMED',
  'PENDING',
  'COMPLETED',
  'CANCELLED',
  'NO_SHOW',
];

export function AdminAppointmentsPage() {
  const [params, setParams] = useSearchParams();
  const tz = useDisplayTz();

  const status = params.get('status') ?? '';
  const date = params.get('date') ?? '';
  const q = params.get('q') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [searchInput, setSearchInput] = useState(q);

  const query = new URLSearchParams();
  if (status) query.set('status', status);
  if (date) query.set('date', date);
  if (q) query.set('q', q);
  query.set('page', String(page));
  query.set('pageSize', '25');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-appointments', status, date, q, page],
    queryFn: () => api<Paginated<Appointment>>(`/admin/appointments?${query.toString()}`),
  });

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setParams(next, { replace: true });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1>All appointments</h1>
        <p className="mt-1 text-slate-600">Clinic-wide view — search, filter and inspect any booking.</p>
      </div>

      <form
        role="search"
        className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setParam('q', searchInput.trim());
        }}
      >
        <div>
          <label htmlFor="appt-search" className="sr-only">
            Search by patient, doctor or reason
          </label>
          <input
            id="appt-search"
            className="input"
            placeholder="Search patient, doctor or reason…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="appt-status" className="sr-only">
            Status
          </label>
          <select
            id="appt-status"
            className="input"
            value={status}
            onChange={(e) => setParam('status', e.target.value === 'ALL' ? '' : e.target.value)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s === 'ALL' ? '' : s}>
                {s === 'ALL' ? 'All statuses' : s.replace('_', '-').toLowerCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="appt-date" className="sr-only">
            Date
          </label>
          <input
            id="appt-date"
            type="date"
            className="input"
            value={date}
            onChange={(e) => setParam('date', e.target.value)}
          />
        </div>
        <button type="submit" className="btn-primary">
          Search
        </button>
      </form>

      {isLoading && (
        <div className="py-12 text-center">
          <Spinner label="Loading appointments…" />
        </div>
      )}
      {isError && <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />}

      {data && (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    When
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Patient
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Doctor
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Reason
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                      {formatDateTime(a.startsAt, tz)}
                    </td>
                    <td className="px-4 py-3">
                      <div>{a.patient?.name}</div>
                      <div className="text-xs text-slate-500">{a.patient?.email}</div>
                    </td>
                    <td className="px-4 py-3">{a.doctor?.user.name}</td>
                    <td className="max-w-[240px] truncate px-4 py-3 text-slate-600" title={a.reasonForVisit}>
                      {a.reasonForVisit}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={a.status} />
                    </td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No appointments match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              {data.total} appointment{data.total === 1 ? '' : 's'} · page {data.page} of{' '}
              {Math.max(1, data.totalPages)}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={data.page <= 1}
                onClick={() => setParam('page', String(data.page - 1))}
              >
                ← Previous
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={data.page >= data.totalPages}
                onClick={() => setParam('page', String(data.page + 1))}
              >
                Next →
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
