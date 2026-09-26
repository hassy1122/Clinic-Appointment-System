import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DoctorProfile } from '../lib/types';
import { ErrorState, Spinner } from '../components/Feedback';
import { formatFee, WEEKDAY_LABELS } from '../lib/format';

export function DoctorsPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const specialty = params.get('specialty') ?? '';
  const [searchInput, setSearchInput] = useState(q);

  const { data: specialtiesRes } = useQuery({
    queryKey: ['specialties'],
    queryFn: () => api<{ specialties: string[] }>('/doctors/specialties'),
    staleTime: 60_000,
  });

  const query = new URLSearchParams();
  if (q) query.set('q', q);
  if (specialty) query.set('specialty', specialty);

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['doctors', { q, specialty }],
    queryFn: () => api<{ doctors: DoctorProfile[] }>(`/doctors?${query.toString()}`),
  });

  const updateParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  const doctors = data?.doctors ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1>Find a doctor</h1>
        <p className="mt-1 text-slate-600">Search by name or specialty, then book an open slot.</p>
      </div>

      <form
        role="search"
        className="flex flex-wrap gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          updateParam('q', searchInput.trim());
        }}
      >
        <label htmlFor="doctor-search" className="sr-only">
          Search doctors
        </label>
        <input
          id="doctor-search"
          className="input max-w-sm flex-1"
          placeholder="Search by name or condition…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
        <button type="submit" className="btn-primary">
          Search
        </button>
        {(q || specialty) && (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSearchInput('');
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            Clear filters
          </button>
        )}
      </form>

      {(specialtiesRes?.specialties.length ?? 0) > 0 && (
        <div aria-label="Filter by specialty" className="flex flex-wrap gap-2">
          {specialtiesRes!.specialties.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => updateParam('specialty', s === specialty ? '' : s)}
              aria-pressed={s === specialty}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium ring-1 ring-inset min-h-11 ${
                s === specialty
                  ? 'bg-brand-600 text-white ring-brand-600'
                  : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-100'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="py-10 text-center">
          <Spinner label="Loading doctors…" />
        </div>
      )}
      {isError && <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />}

      {data && doctors.length === 0 && (
        <div className="card text-center">
          <p className="font-medium text-slate-700">No doctors match your search.</p>
          <p className="mt-1 text-sm text-slate-500">Try a different name or clear the specialty filter.</p>
        </div>
      )}

      <ul className="grid gap-4 sm:grid-cols-2">
        {doctors.map((d) => (
          <li key={d.id}>
            <Link to={`/doctors/${d.id}`} className="card block h-full hover:ring-brand-300">
              <div className="flex items-start gap-4">
                <span
                  aria-hidden
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand-100 text-lg font-bold text-brand-700"
                >
                  {d.user.name.replace(/^Dr\.\s*/, '').charAt(0)}
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-slate-900">{d.user.name}</p>
                  <p className="text-sm font-medium text-brand-700">{d.specialty}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-slate-600">{d.bio}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-semibold text-slate-900">
                      Fee: Rs {formatFee(d.consultationFee)}
                    </span>
                    {d.availability && d.availability.length > 0 && (
                      <span className="text-slate-500">
                        {[
                          ...new Set(d.availability.map((a) => WEEKDAY_LABELS[a.dayOfWeek])),
                        ].join(', ')}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
