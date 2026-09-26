export type Role = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export type AppointmentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'COMPLETED'
  | 'NO_SHOW';

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: Role;
  mustChangePassword?: boolean;
  createdAt?: string;
}

export interface AvailabilityWindow {
  id?: string;
  doctorId?: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  slotDurationMinutes: number;
  bufferMinutes: number;
  isActive: boolean;
}

export interface TimeOff {
  id: string;
  doctorId: string;
  date: string;
  startTime?: string | null;
  endTime?: string | null;
  reason?: string | null;
}

export interface DoctorProfile {
  id: string;
  userId: string;
  specialty: string;
  bio?: string | null;
  consultationFee: number;
  photoUrl?: string | null;
  isActive: boolean;
  user: { id: string; name: string; email?: string; phone?: string | null; isActive?: boolean };
  availability?: AvailabilityWindow[];
  timeOff?: TimeOff[];
  _count?: { appointments: number };
}

export interface AppointmentPatient {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
}

export interface Appointment {
  id: string;
  patientId: string;
  doctorId: string;
  startsAt: string;
  durationMinutes: number;
  status: AppointmentStatus;
  reasonForVisit: string;
  symptoms?: string | null;
  canceledAt?: string | null;
  cancelReason?: string | null;
  rescheduledFromId?: string | null;
  createdAt: string;
  patient?: AppointmentPatient;
  doctor?: DoctorProfile;
}

export interface ConsultationNote {
  id: string;
  appointmentId: string;
  notes: string;
  prescriptions: PrescriptionItem[];
  createdAt: string;
  updatedAt: string;
}

export interface PrescriptionItem {
  medication: string;
  dosage: string;
  instructions?: string;
}

export interface ClinicInfo {
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone: string;
}

export interface AdminStats {
  todayTotal: number;
  todayCompleted: number;
  upcoming: number;
  doctors: number;
  last30Days: {
    byStatus: Record<string, number>;
    noShowRate: number;
  };
  todaysAppointments: Appointment[];
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  subjectPatientId?: string | null;
  ip?: string | null;
  metadata?: unknown;
  createdAt: string;
  actor?: { id: string; name: string; role: Role } | null;
}
