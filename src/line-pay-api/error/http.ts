export class HttpError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public data: unknown
  ) {
    super(message)
  }
}

export function isHttpError(error: unknown): error is HttpError {
  return error instanceof HttpError
}
