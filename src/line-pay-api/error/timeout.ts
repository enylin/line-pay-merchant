export class TimeoutError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export function isTimeoutError(error: unknown): error is TimeoutError {
  return error instanceof TimeoutError
}
