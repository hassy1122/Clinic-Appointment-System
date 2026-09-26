import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../lib/api';
import type { DoctorProfile } from '../../lib/types';
import { ErrorState, Spinner, ConfirmButton } from '../../components/Feedback';
import { WEEKDAY_LABELS, formatFee, formatWallTime } from '../../lib/format';

type AdminDoctor = DoctorProfile & { _count?: { appointments: number } };

export function AdminDoctorsPage() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [invite, setInvite] = useState({ email: '', role: 'DOCTOR' as 'DOCTOR' | 'ADMIN' });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ specialty: '', consultationFee: 0, bio: '' });

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['admin-doctors'],
    queryFn: () => api<{ doctors: AdminDoctor[] }>('/admin/doctors'),
  });

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviting(true);
    setMessage(null);
    setInviteUrl(null);
    try {
      const res = await api<{ invite: { inviteUrl: string } }>('/auth/admin/invites', {
        method: 'POST',
        body: { email: invite.email.trim(), role: invite.role },
      });
      setInviteUrl(res.invite.inviteUrl);
      setInvite({ email: '', role: 'DOCTOR' });
      setMessage({ kind: 'ok', text: 'Invitation created (also queued as an email).' });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof ApiError ? err.message : 'Invite failed.' });
    } finally {
      setInviting(false);
    }
  };

  const toggleActive = async (doc: AdminDoctor) => {
    try {
      await api(`/admin/doctors/${doc.id}`, {
        method: 'PUT',
        body: { isActive: !doc.isActive },
      });
      setMessage({
        kind: 'ok',
        text: `${doc.user.name} ${doc.isActive ? 'deactivated' : 'activated'}.`,
      });
      void queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
      void queryClient.invalidateQueries({ queryKey: ['doctors'] });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Update failed.' });
    }
  };

  const saveProfile = async (id: string) => {
    try {
      await api(`/admin/doctors/${id}`, {
        method: 'PUT',
        body: {
          specialty: editForm.specialty,
          consultationFee: Number(editForm.consultationFee),
          bio: editForm.bio,
        },
      });
      setMessage({ kind: 'ok', text: 'Doctor profile updated.' });
      setEditingId(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-doctors'] });
      void queryClient.invalidateQueries({ queryKey: ['doctors'] });
    } catch (err) {
      setMessage({ kind: 'err', text: err instanceof Error ? err.message : 'Update failed.' });
    }
  };

  if (isLoading) {
    return (
      <div className="py-16 text-center">
        <Spinner label="Loading doctors…" />
      </div>
    );
  }
  if (isError) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Doctors</h1>
        <p className="mt-1 text-slate-600">Manage doctor accounts, profiles and clinic membership.</p>
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

      <section className="card" aria-labelledby="invite-title">
        <h2 id="invite-title">Invite staff</h2>
        <p className="mt-1 text-sm text-slate-600">
          Doctors and admins never self-register — send them an invitation link instead.
        </p>
        <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={(e) => void sendInvite(e)}>
          <div className="min-w-56 flex-1">
            <label className="label" htmlFor="invite-email">
              Email
            </label>
            <input
              id="invite-email"
              type="email"
              required
              className="input"
              placeholder="doctor@clinic.com"
              value={invite.email}
              onChange={(e) => setInvite((f) => ({ ...f, email: e.target.value }))}
            />
          </div>
          <div>
            <label className="label" htmlFor="invite-role">
              Role
            </label>
            <select
              id="invite-role"
              className="input"
              value={invite.role}
              onChange={(e) => setInvite((f) => ({ ...f, role: e.target.value as 'DOCTOR' | 'ADMIN' }))}
            >
              <option value="DOCTOR">Doctor</option>
              <option value="ADMIN">Admin</option>
            </select>
          </div>
          <button type="submit" className="btn-primary" disabled={inviting}>
            {inviting ? 'Creating…' : 'Create invite'}
          </button>
        </form>

        {inviteUrl && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 ring-1 ring-brand-200">
            <code className="min-w-0 flex-1 break-all text-sm text-brand-800">{inviteUrl}</code>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void navigator.clipboard.writeText(inviteUrl)}
            >
              Copy link
            </button>
          </div>
        )}
      </section>

      <section aria-label="Doctor accounts" className="space-y-4">
        {(data?.doctors ?? []).map((doc) => {
          const windows = doc.availability ?? [];
          return (
          <div key={doc.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-slate-900">{doc.user.name}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
                      doc.isActive && doc.user.isActive
                        ? 'bg-emerald-50 text-emerald-800 ring-emerald-200'
                        : 'bg-rose-50 text-rose-700 ring-rose-200'
                    }`}
                  >
                    {doc.isActive && doc.user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <p className="text-sm text-slate-600">
                  {doc.specialty} · Rs {formatFee(doc.consultationFee)} · {doc.user.email}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {windows.length} working window{windows.length === 1 ? '' : 's'} ·{' '}
                  {doc._count?.appointments ?? 0} appointments
                </p>
                {windows.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">
                    {windows
                      .map(
                        (w) =>
                          `${WEEKDAY_LABELS[w.dayOfWeek]} ${formatWallTime(w.startTime)}–${formatWallTime(w.endTime)}`
                      )
                      .join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  aria-expanded={editingId === doc.id}
                  onClick={() => {
                    if (editingId === doc.id) {
                      setEditingId(null);
                    } else {
                      setEditForm({
                        specialty: doc.specialty,
                        consultationFee: doc.consultationFee,
                        bio: doc.bio ?? '',
                      });
                      setEditingId(doc.id);
                    }
                  }}
                >
                  {editingId === doc.id ? 'Close' : 'Edit profile'}
                </button>
                <ConfirmButton
                  label={doc.isActive ? 'Deactivate' : 'Activate'}
                  confirmLabel={doc.isActive ? 'Confirm deactivate?' : 'Confirm activate?'}
                  danger={doc.isActive}
                  onConfirm={() => void toggleActive(doc)}
                />
              </div>
            </div>

            {editingId === doc.id && (
              <form
                className="mt-4 grid items-end gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveProfile(doc.id);
                }}
              >
                <div>
                  <label className="label" htmlFor={`spec-${doc.id}`}>
                    Specialty
                  </label>
                  <input
                    id={`spec-${doc.id}`}
                    className="input"
                    value={editForm.specialty}
                    onChange={(e) => setEditForm((f) => ({ ...f, specialty: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label" htmlFor={`fee-${doc.id}`}>
                    Fee (Rs)
                  </label>
                  <input
                    id={`fee-${doc.id}`}
                    type="number"
                    min={0}
                    className="input"
                    value={editForm.consultationFee}
                    onChange={(e) => setEditForm((f) => ({ ...f, consultationFee: Number(e.target.value) }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="label" htmlFor={`bio-${doc.id}`}>
                    Bio
                  </label>
                  <input
                    id={`bio-${doc.id}`}
                    className="input"
                    value={editForm.bio}
                    onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-4">
                  <button type="submit" className="btn-primary">
                    Save changes
                  </button>
                </div>
              </form>
            )}
          </div>
          );
        })}
      </section>
    </div>
  );
}
