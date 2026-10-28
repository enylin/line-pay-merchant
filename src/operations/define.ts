import type { Guard } from '../core/guard'
import type { QueryParams } from '../core/query'
import type { Checker } from '../core/validate'
import type { ReconcileContext } from '../errors'
import type { OperationEffect } from './names'

/** The identifying fields kept on an error so that `reconcile` can look it up. */
export type ReconcileFields = Omit<ReconcileContext, 'operation' | 'startedAt'>

/** What every operation says about itself, whatever its HTTP method. */
interface Common<Input, Output> {
  /** Milliseconds; the read timeout LINE Pay recommends for the call. */
  readonly defaultTimeout: number
  readonly effect: OperationEffect
  /**
   * The effect of this very call, for an operation whose effect depends on its
   * input: the retry decision is made on it. Defaults to `effect`.
   */
  readonly effectOf?: (input: Input) => OperationEffect
  /**
   * The operation answers with status codes (`0xxx` other than `0000`) that are
   * results, not failures. Only the status check of a payment does.
   */
  readonly statusCodes?: boolean
  /**
   * The URL path. Path parameters are validated and encoded here, so this check
   * runs even when `validate` is `false`.
   */
  readonly path: (input: Input) => string
  /**
   * Rules about what the request MEANS: a field that is left out, or misspelled,
   * or has a value that JSON turns into `null`, must not silently change the
   * effect of the call (a refund without an amount is a refund of everything).
   * These run even when the client is created with `validate: false`, like the
   * checks of the path.
   */
  readonly invariants?: (input: Input, checker: Checker) => void
  /** Business rules; skipped when the client is created with `validate: false`. */
  readonly check?: (input: Input, checker: Checker) => void
  /**
   * Whether a body that LINE Pay sent is the response this operation promises.
   * The response is typed by this check, never by an assertion: a body that fails
   * it is an `unexpected-shape` with an unknown outcome.
   */
  readonly response: Guard<Output>
  /** Only for operations that `reconcile` supports. */
  readonly reconcileFields?: (input: Input) => ReconcileFields
}

/**
 * Everything the executor needs to know about one API call. The V4 specifics of
 * the library live here and in the input and response types, nowhere else.
 *
 * A GET has a query and no body, a POST has a body and no query: the compiler
 * sees to it, so the executor has nothing to fall back on.
 */
export type OperationDefinition<Input, Output> = Common<Input, Output> &
  (
    | {
        readonly method: 'GET'
        /** The query of the request. */
        readonly query: (input: Input) => QueryParams
        readonly body?: undefined
      }
    | {
        readonly method: 'POST'
        /** The JSON body of the request. */
        readonly body: (input: Input) => unknown
        readonly query?: undefined
      }
  )
