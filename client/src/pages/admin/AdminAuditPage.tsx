import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { AuditLogEntry, Paginated } from '../../lib/types';
import { ErrorState, Spinner } from '../../components/Feedback';
import { formatDateTime } from '../../lib/format';
import { useDisplayTz } from '../../lib/useClinic';

export function AdminAuditPage() {
  const [params, setParams] = useSearchParams();
  const tz = useDisplayTz();
  const patientId = params.get('subjectPatientId') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [input, setInput] = useState(patientId);

  const query = new URLSearchParams();
  if (patientId) query.set('subjectPatientId', patientId);
  query.set('page', String(page));
  query.set('pageSize', '30');

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['audit-logs', patientId, page],
    queryFn: () => api<Paginated<AuditLogEntry>>(`/admin/audit-logs?${query.toString()}`),
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
        <h1>Audit log</h1>
        <p className="mt-1 text-slate-600">
          Every access to medical notes and every admin change is recorded here — who, what and when.
        </p>
      </div>

      <form
        role="search"
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          setParam('subjectPatientId', input.trim());
        }}
      >
        <label htmlFor="audit-patient" className="sr-only">
          Filter by patient ID
        </label>
        <input
          id="audit-patient"
          className="input max-w-md flex-1"
          placeholder="Filter by patient ID…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
        />
        <button type="submit" className="btn-primary">
          Filter
        </button>
        {patientId && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setInput('');
              setParam('subjectPatientId', '');
            }}
          >
            Clear
          </button>
        )}
      </form>

      {isLoading && (
        <div className="py-12 text-center">
          <Spinner label="Loading audit log…" />
        </div>
      )}
      {isError && <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />}

      {data && (
        <>
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[680px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    When
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Actor
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Action
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Entity
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    IP
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {formatDateTime(entry.createdAt, tz)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{entry.actor?.name ?? 'System'}</div>
                      <div className="text-xs uppercase text-slate-500">{entry.actor?.role ?? ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
                        {entry.action}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{entry.entityType}</div>
                      {entry.entityId && <div className="truncate text-xs text-slate-400">{entry.entityId}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{entry.ip ?? '—'}</td>
                  </tr>
                ))}
                {data.items.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      No audit entries match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-slate-500">
              {data.total} entr{data.total === 1 ? 'y' : 'ies'} · page {data.page} of{' '}
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
