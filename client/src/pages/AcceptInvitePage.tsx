import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { HOME_FOR_ROLE, useAuth } from '../auth/AuthContext';
import { ApiError } from '../lib/api';

export function AcceptInvitePage() {
  const { acceptInvite } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const [form, setForm] = useState({ name: '', password: '', phone: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const user = await acceptInvite({
        token,
        name: form.name.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
      });
      navigate(HOME_FOR_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : 'Could not accept this invitation. Please try again.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="mx-auto max-w-md card text-center">
        <h1>Invitation link incomplete</h1>
        <p className="mt-2 text-sm text-slate-600">
          This page needs an invitation token. Ask the clinic admin to send you a fresh invite link.
        </p>
        <Link to="/" className="btn-secondary mt-4">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h1>Accept your invitation</h1>
        <p className="mt-1 text-sm text-slate-500">Set your name and password to activate your account.</p>

        <form className="mt-6 space-y-4" onSubmit={(e) => void handleSubmit(e)}>
          {error && (
            <div role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 ring-1 ring-rose-200">
              {error}
            </div>
          )}

          <div>
            <label className="label" htmlFor="invite-name">
              Full name
            </label>
            <input
              id="invite-name"
              className="input"
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
          </div>

          <div>
            <label className="label" htmlFor="invite-password">
              Password
            </label>
            <input
              id="invite-password"
              type="password"
              className="input"
              required
              minLength={8}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            />
            <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
          </div>

          <div>
            <label className="label" htmlFor="invite-phone">
              Phone (optional)
            </label>
            <input
              id="invite-phone"
              type="tel"
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </div>

          <button type="submit" className="btn-primary w-full" disabled={submitting}>
            {submitting ? 'Activating…' : 'Activate account'}
          </button>
        </form>
      </div>
    </div>
  );
}
