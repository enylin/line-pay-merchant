/**
 * The item at `index`, which the test knows to be there: when it is not, the test
 * fails with a message instead of going on with `undefined`. (Reading `items[i]`
 * gives `T | undefined`, and an item may itself be `undefined`, so the item is
 * looked for rather than checked against `undefined`.)
 */
export function at<T>(items: readonly T[], index: number): T {
  for (const [i, item] of items.entries()) {
    if (i === index) return item
  }
  throw new RangeError(
    `expected an item at index ${index}, but there are ${items.length}`
  )
}
