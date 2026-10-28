/**
 * A runtime check that tells the compiler what it found out.
 *
 * Nothing in this library asserts a type with `as`: a value from the network, or
 * from a caller who is not bound by types, is narrowed with a guard, and the
 * compiler takes the guard's word for exactly what it has checked.
 */
export type Guard<T> = (value: unknown) => value is T

/**
 * A list of things nothing is known about. `Array.isArray` says `any[]`, so the
 * compiler would let anything be done with an item; this says `unknown`.
 */
export const isArray: Guard<readonly unknown[]> = (
  value
): value is readonly unknown[] => Array.isArray(value)

/** An object whose keys and values nothing is known about (not an array, not null). */
export const isRecord: Guard<Record<string, unknown>> = (
  value
): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !isArray(value)

export const isString: Guard<string> = (value): value is string =>
  typeof value === 'string'

/** A finite number: `NaN` and the infinities are no amount. */
export const isNumber: Guard<number> = (value): value is number =>
  typeof value === 'number' && Number.isFinite(value)

/**
 * A list of which every item passes `item`. An empty slot of a sparse list is
 * `undefined`, and checked as such.
 */
export function isListOf<T>(item: Guard<T>): Guard<T[]> {
  return (value): value is T[] => {
    if (!isArray(value)) return false
    for (let index = 0; index < value.length; index++) {
      if (!item(value[index])) return false
    }
    return true
  }
}

type Shape = Readonly<Record<string, Guard<unknown>>>

/** What the guards of a shape have found out, key by key. */
type Checked<S extends Shape> = {
  [K in keyof S]: S[K] extends Guard<infer T> ? T : never
}

/**
 * A guard for an object with the keys `required` (each must be there and pass its
 * guard) and the keys `optional` (each may be missing, but if it is there it must
 * pass). Keys it does not know are let through: LINE Pay adds fields.
 *
 * The type it vouches for is the one its two shapes describe. Give it where a
 * `Guard<Interface>` is expected, and the compiler checks that every required
 * field of the interface is among the keys that are checked.
 */
export function hasShape<
  R extends Shape,
  O extends Shape = Record<never, never>
>(required: R, optional?: O): Guard<Checked<R> & Partial<Checked<O>>> {
  // Taken once, when the guard is made, not on every call.
  const mustHave = Object.entries<Guard<unknown>>(required)
  const mayHave = Object.entries<Guard<unknown>>(optional ?? {})
  return (value): value is Checked<R> & Partial<Checked<O>> => {
    if (!isRecord(value)) return false
    for (const [key, guard] of mustHave) {
      if (!guard(value[key])) return false
    }
    for (const [key, guard] of mayHave) {
      const present = value[key]
      if (present !== undefined && !guard(present)) return false
    }
    return true
  }
}
