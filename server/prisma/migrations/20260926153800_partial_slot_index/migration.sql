-- Double-booking guard: at most one non-cancelled appointment per (doctorId, startsAt).
-- Partial index so a CANCELLED appointment releases its slot for rebooking.
-- Prisma cannot express partial indexes in schema.prisma, hence raw SQL.
CREATE UNIQUE INDEX "appointment_doctor_slot_active"
ON "Appointment"("doctorId", "startsAt")
WHERE "status" <> 'CANCELLED';
