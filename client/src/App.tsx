import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { DoctorsPage } from './pages/DoctorsPage';
import { DoctorProfilePage } from './pages/DoctorProfilePage';
import { BookPage } from './pages/BookPage';
import { LoginPage } from './pages/LoginPage';
import { SignupPage } from './pages/SignupPage';
import { AcceptInvitePage } from './pages/AcceptInvitePage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PatientAppointmentsPage } from './pages/patient/PatientAppointmentsPage';
import { DoctorDashboardPage } from './pages/doctor/DoctorDashboardPage';
import { DoctorAvailabilityPage } from './pages/doctor/DoctorAvailabilityPage';
import { AdminOverviewPage } from './pages/admin/AdminOverviewPage';
import { AdminAppointmentsPage } from './pages/admin/AdminAppointmentsPage';
import { AdminDoctorsPage } from './pages/admin/AdminDoctorsPage';
import { AdminAuditPage } from './pages/admin/AdminAuditPage';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="doctors" element={<DoctorsPage />} />
        <Route path="doctors/:doctorId" element={<DoctorProfilePage />} />
        <Route
          path="book/:doctorId"
          element={
            <ProtectedRoute roles={['PATIENT']}>
              <BookPage />
            </ProtectedRoute>
          }
        />
        <Route path="login" element={<LoginPage />} />
        <Route path="signup" element={<SignupPage />} />
        <Route path="accept-invite" element={<AcceptInvitePage />} />

        <Route
          path="patient/appointments"
          element={
            <ProtectedRoute roles={['PATIENT']}>
              <PatientAppointmentsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="doctor"
          element={
            <ProtectedRoute roles={['DOCTOR']}>
              <DoctorDashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="doctor/availability"
          element={
            <ProtectedRoute roles={['DOCTOR']}>
              <DoctorAvailabilityPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="admin"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminOverviewPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/appointments"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminAppointmentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/doctors"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminDoctorsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/audit"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <AdminAuditPage />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
