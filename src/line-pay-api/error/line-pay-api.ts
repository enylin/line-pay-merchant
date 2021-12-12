import { GeneralResponseBody } from '../type'

export class LinePayApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public data: GeneralResponseBody
  ) {
    super(message)
  }
}

export function isLinePayApiError(error: unknown): error is LinePayApiError {
  return error instanceof LinePayApiError
}
