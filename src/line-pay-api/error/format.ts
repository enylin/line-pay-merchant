export class FormatError extends Error {
  constructor(message: string) {
    super(message)
  }
}

export function isFormatError(error: unknown): error is FormatError {
  return error instanceof FormatError
}
