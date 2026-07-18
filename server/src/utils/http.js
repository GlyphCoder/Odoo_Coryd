/** Wrap an async route handler so thrown errors hit the error middleware. */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Simple 400 helper. */
export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (msg) => new ApiError(400, msg);
export const notFound = (msg = 'Not found') => new ApiError(404, msg);
export const forbidden = (msg = 'Forbidden') => new ApiError(403, msg);
