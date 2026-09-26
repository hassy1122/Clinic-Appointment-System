import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { DoctorProfile } from '../lib/types';
import { useClinic } from '../lib/useClinic';
import { formatFee } from '../lib/format';

const FEATURES = [
  {
    title: 'Real availability',
    body: 'Only genuinely open time slots are shown — what you see is what you can book, right now.',
  },
  {
    title: 'Instant confirmation',
    body: 'Bookings, cancellations and reschedules are confirmed immediately, by email.',
  },
  {
    title: 'Friendly reminders',
    body: 'We remind you 24 hours and 2 hours before your visit so nothing slips through.',
  },
];

export function HomePage() {
  const { data: clinic } = useClinic();
  const { data: doctorsRes } = useQuery({
    queryKey: ['doctors', { limit: 3 }],
    queryFn: () => api<{ doctors: DoctorProfile[] }>('/doctors'),
  });
  const featured = (doctorsRes?.doctors ?? []).slice(0, 3);

  return (
    <div className="space-y-10">
      <section className="card bg-gradient-to-br from-brand-50 to-white p-8 sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand-700">
          {clinic?.name ?? 'Your clinic'}
        </p>
        <h1 className="mt-3 max-w-2xl">
          Book a doctor appointment in under a minute — no phone calls, no waiting rooms queues.
        </h1>
        <p className="mt-4 max-w-xl text-slate-600">
          See which doctors are free this week, pick a time that works, and get instant confirmation.
          Reschedule or cancel any time.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/doctors" className="btn-primary">
            Find a doctor
          </Link>
          <Link to="/signup" className="btn-secondary">
            Create an account
          </Link>
        </div>
      </section>

      <section aria-labelledby="why" className="grid gap-4 sm:grid-cols-3">
        <h2 id="why" className="sr-only">
          Why book online
        </h2>
        {FEATURES.map((f) => (
          <div key={f.title} className="card">
            <h3 className="text-brand-700">{f.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{f.body}</p>
          </div>
        ))}
      </section>

      {featured.length > 0 && (
        <section aria-labelledby="doctors">
          <div className="mb-4 flex items-center justify-between">
            <h2 id="doctors">Our doctors</h2>
            <Link to="/doctors" className="text-sm font-semibold text-brand-700 hover:underline">
              View all →
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {featured.map((d) => (
              <Link key={d.id} to={`/doctors/${d.id}`} className="card hover:ring-brand-300">
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="grid h-11 w-11 place-items-center rounded-full bg-brand-100 font-bold text-brand-700"
                  >
                    {d.user.name.replace(/^Dr\.\s*/, '').charAt(0)}
                  </span>
                  <div>
                    <p className="font-semibold text-slate-900">{d.user.name}</p>
                    <p className="text-sm text-slate-500">{d.specialty}</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600 line-clamp-2">{d.bio}</p>
                <p className="mt-3 text-sm font-semibold text-slate-900">
                  Fee: Rs {formatFee(d.consultationFee)}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="visit" className="card sm:flex sm:items-center sm:justify-between">
        <div>
          <h2 id="visit">Visit us</h2>
          <p className="mt-1 text-slate-600">{clinic?.address}</p>
          <p className="text-slate-600">{clinic?.phone}</p>
        </div>
        <Link to="/doctors" className="btn-primary mt-4 sm:mt-0">
          Book now
        </Link>
      </section>
    </div>
  );
}
