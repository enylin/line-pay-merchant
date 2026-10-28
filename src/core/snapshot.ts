import { LinePayValidationError } from '../errors'
import type { OperationName } from '../operations/names'
import { type Guard, isArray } from './guard'

/**
 * Where a copy would leave something out, or fail, and what it is. The path is
 * relative to the input, like the path of every other problem with an input; the
 * input itself is the empty path.
 */
interface Loss {
  readonly path: string
  readonly message: string
  readonly cause?: unknown
}

const NOT_PLAIN_OBJECT =
  'must be a plain object (an object literal, or the result of JSON.parse), not an instance of a class or an object with a prototype of its own: what is kept there is not copied, and so not sent'
const NOT_PLAIN_ARRAY = 'must be a plain array, not a subclass of Array'
const NOT_ENUMERABLE =
  'is not enumerable, so a copy leaves it out and it would not be sent'
const NOT_A_VALUE =
  'is a getter or a setter: give the value itself, so that what is sent is what the call was given'
const NOT_COPYABLE =
  'must be plain data: strings, numbers, booleans, and arrays and objects of them'

const child = (path: string, key: string) =>
  path === '' ? key : `${path}.${key}`

/** An object made with `{}` or `JSON.parse`, or one with no prototype at all. */
export const isPlainObject: Guard<Record<string, unknown>> = (
  value
): value is Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || isArray(value)) {
    return false
  }
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * The first place in `value` where a copy (`structuredClone`) would not carry
 * what the caller sees. A copy takes the own, enumerable, plain properties and
 * nothing else, and an input is read by the name of a field: a field that a
 * class keeps in a getter, behind a `#private` name, on a prototype or out of the
 * enumeration is missing from the copy, and for an operation that reads "no
 * `refundAmount`" as a full refund that is not a detail.
 */
function lossIn(
  value: unknown,
  path: string,
  seen: Set<object>
): Loss | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  if (seen.has(value)) return undefined
  seen.add(value)

  if (isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) {
      return { path, message: NOT_PLAIN_ARRAY }
    }
    for (let index = 0; index < value.length; index++) {
      const loss = lossIn(value[index], `${path}[${index}]`, seen)
      if (loss !== undefined) return loss
    }
    return undefined
  }
  if (!isPlainObject(value)) return { path, message: NOT_PLAIN_OBJECT }
  for (const key of Reflect.ownKeys(value)) {
    // No field of an operation is named by a symbol: a copy may leave it out.
    if (typeof key === 'symbol') continue
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (descriptor === undefined) continue
    if (!descriptor.enumerable) {
      return { path: child(path, key), message: NOT_ENUMERABLE }
    }
    if (!('value' in descriptor)) {
      return { path: child(path, key), message: NOT_A_VALUE }
    }
    const loss = lossIn(descriptor.value, child(path, key), seen)
    if (loss !== undefined) return loss
  }
  return undefined
}

function findLoss(input: object): Loss | undefined {
  try {
    return lossIn(input, '', new Set())
  } catch (cause) {
    // Nested too deep for the walk, or an object (a Proxy) that throws when asked.
    return { path: '', message: NOT_COPYABLE, cause }
  }
}

/**
 * The input as it is at the moment of the call. The call reads it again for every
 * attempt of a retry and, if it fails, for the context that `reconcile` works
 * from; a caller that reuses its object for the next call in the meantime must
 * not change which payment either of them is about.
 *
 * Only plain data is copied. What a copy would leave out is refused, with the
 * place where it is, instead of being left out: the money moves by what the copy
 * says.
 */
export function snapshotOf<T>(input: T, operation: OperationName): T {
  if (typeof input !== 'object' || input === null) return input
  const loss = findLoss(input)
  if (loss !== undefined) {
    throw new LinePayValidationError({
      issues: [
        {
          path: loss.path === '' ? 'input' : loss.path,
          message: loss.message
        }
      ],
      operation,
      cause: loss.cause
    })
  }
  try {
    return structuredClone(input)
  } catch (cause) {
    throw new LinePayValidationError({
      issues: [{ path: 'input', message: NOT_COPYABLE }],
      operation,
      cause
    })
  }
}
