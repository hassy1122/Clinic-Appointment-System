import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});
    try {
      await signup({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        consent,
      });
      navigate('/patient/appointments', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
          const map: Record<string, string> = {};
          for (const d of err.details as { path: string; message: string }[]) map[d.path] = d.message;
          setFieldErrors(map);
        }
        setError(err.message);
      } else {
        setError('Sign up failed. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h1>Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Book, reschedule and track your appointments in one place.
        </p>

        <form className="mt-6 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          {error && (
            <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          <div>
            <label className="label" htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              className="input"
              required
              autoComplete="name"
              value={form.name}
              onChange={set('name')}
              aria-invalid={Boolean(fieldErrors.name)}
            />
            {fieldErrors.name && <p className="mt-1 text-xs text-rose-600">{fieldErrors.name}</p>}
          </div>

          <div>
            <label className="label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              className="input"
              required
              autoComplete="email"
              value={form.email}
              onChange={set('email')}
              aria-invalid={Boolean(fieldErrors.email)}
            />
            {fieldErrors.email && <p className="mt-1 text-xs text-rose-600">{fieldErrors.email}</p>}
          </div>

          <div>
            <label className="label" htmlFor="phone">
              Phone (optional)
            </label>
            <input
              id="phone"
              type="tel"
              className="input"
              autoComplete="tel"
              value={form.phone}
              onChange={set('phone')}
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              className="input"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={set('password')}
              aria-invalid={Boolean(fieldErrors.password)}
            />
            <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
            {fieldErrors.password && <p className="mt-1 text-xs text-rose-600">{fieldErrors.password}</p>}
          </div>

          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <label className="flex gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                required
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5 h-5 w-5 rounded border-slate-300 text-brand-600 focus:ring-brand-600"
              />
              <span>
                I consent to the clinic storing my personal and health information for the purpose of
                managing my appointments, as described in the clinic&apos;s privacy policy. I can request
                deletion of my data at any time.
              </span>
            </label>
            {fieldErrors.consent && (
              <p className="mt-1 text-xs text-rose-600">{fieldErrors.consent}</p>
            )}
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
