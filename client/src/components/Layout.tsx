import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useClinic } from '../lib/useClinic';

const NAV_BY_ROLE = {
  PATIENT: [
    { to: '/doctors', label: 'Find a doctor' },
    { to: '/patient/appointments', label: 'My appointments' },
  ],
  DOCTOR: [
    { to: '/doctor', label: 'Today' },
    { to: '/doctor/availability', label: 'My schedule' },
  ],
  ADMIN: [
    { to: '/admin', label: 'Overview' },
    { to: '/admin/doctors', label: 'Doctors' },
    { to: '/admin/appointments', label: 'Appointments' },
    { to: '/admin/audit', label: 'Audit log' },
  ],
  GUEST: [
    { to: '/doctors', label: 'Find a doctor' },
  ],
} as const;

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { data: clinic } = useClinic();

  const navItems = user ? NAV_BY_ROLE[user.role] : NAV_BY_ROLE.GUEST;

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:shadow"
      >
        Skip to content
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
            <span aria-hidden className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
              +
            </span>
            <span>{clinic?.name ?? 'Clinic'}</span>
          </Link>

          <nav aria-label="Main" className="flex flex-wrap items-center gap-1">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-medium min-h-11 flex items-center ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <>
                <span className="hidden text-sm text-slate-500 sm:inline">{user.name}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
                  {user.role}
                </span>
                <button type="button" onClick={() => void handleLogout()} className="btn-secondary">
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn-secondary">
                  Sign in
                </Link>
                <Link to="/signup" className="btn-primary">
                  Create account
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:py-8">
        <Outlet />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-6 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <p>
            {clinic?.name ?? 'Clinic'} · {clinic?.address ?? ''}
          </p>
          <p>
            {clinic?.phone ?? ''} <span className="mx-2 text-slate-300">|</span> Times shown in{' '}
            {clinic?.timezone ?? 'clinic time'}
          </p>
        </div>
      </footer>
    </div>
  );
}
