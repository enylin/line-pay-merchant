/**
 * A date and a time of the day, and the offset from UTC (the year may be the
 * expanded one, `+002026`, that ISO 8601 and ECMAScript have). Nothing else is
 * read as a timestamp: `Date.parse` takes many more shapes than ISO 8601
 * (`10-27-2026` ends in what looks like an offset), and reads those in the local
 * zone.
 */
const ISO_WITH_OFFSET =
  /^(?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i

/**
 * The instant of an ISO 8601 timestamp, or `NaN` when it has no UTC offset: a
 * timestamp without one is read in the local zone of this process, which may not
 * be the one LINE Pay meant. Such a time is not trusted.
 */
// TODO(v4-spec): confirm that the timestamps of the API carry an offset.
export function instantOf(timestamp: string): number {
  return ISO_WITH_OFFSET.test(timestamp) ? Date.parse(timestamp) : Number.NaN
}

/**
 * Milliseconds since the epoch of 2001-09-09. Any moment in the life of this
 * library is later; an earlier one is most likely a count of seconds taken for
 * milliseconds, which would put the call in January 1970 and every payment since
 * then after it. A `Date` made from seconds (`new Date(1761523200)`), a `Date`
 * made from nothing (`new Date(null)`) and a timestamp of 1970 are the same
 * mistake in other forms.
 */
const EARLIEST_EPOCH_MS = 1e12

/**
 * A moment given as a `Date`, as an ISO 8601 string with a UTC offset, or as
 * milliseconds since the epoch. What comes back from JSON (a database row, a
 * queue message) is a string or a number, so those work as they are. A moment
 * that is too early to be the time of a call is refused, in whatever form it is
 * given.
 */
export function toDate(value: unknown): Date | undefined {
  let ms: number
  if (value instanceof Date) ms = value.getTime()
  else if (typeof value === 'string') ms = instantOf(value)
  else if (typeof value === 'number') ms = value
  else return undefined
  if (ms < EARLIEST_EPOCH_MS) return undefined
  // What is left is not a moment if it is NaN, an Infinity, or beyond what a Date
  // reaches (8.64e15 milliseconds either way): the Date made from it is invalid.
  const date = new Date(ms)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * Seconds since the epoch, rounded down. LINE Pay may report a time without a
 * fraction, so a call and the refund it made are compared by the second.
 */
export const wholeSeconds = (ms: number): number => Math.floor(ms / 1000)
