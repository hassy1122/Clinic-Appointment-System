export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    Error.captureStackTrace?.(this, ApiError);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'Authentication required') =>
  new ApiError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'You do not have access to this resource') =>
  new ApiError(403, 'FORBIDDEN', message);

export const notFound = (message = 'Resource not found') =>
  new ApiError(404, 'NOT_FOUND', message);

export const conflict = (code: string, message: string) => new ApiError(409, code, message);

export const SLOT_TAKEN = () =>
  new ApiError(409, 'SLOT_TAKEN', 'This slot was just taken by another booking. Please pick another time.');
