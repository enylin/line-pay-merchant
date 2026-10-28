import { describe, expect, it } from 'vitest'

import { hasShape, isListOf, isNumber, isRecord, isString } from './guard'

describe('isRecord', () => {
  it.each([
    ['an empty object', {}],
    ['an object', { a: 1 }],
    ['an object without a prototype', { __proto__: null }],
    ['a class instance', new Date()]
  ])('accepts %s', (_name, value) => {
    expect(isRecord(value)).toBe(true)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
    ['an array with items', [{ a: 1 }]],
    ['a string', 'text'],
    ['a number', 1],
    ['a boolean', true],
    ['a function', () => 1]
  ])('refuses %s', (_name, value) => {
    expect(isRecord(value)).toBe(false)
  })
})

describe('isString and isNumber', () => {
  it('take strings, and only strings', () => {
    expect(isString('')).toBe(true)
    expect(isString('x')).toBe(true)
    for (const value of [1, null, undefined, {}, [], ['x'], true]) {
      expect(isString(value)).toBe(false)
    }
  })

  it('take finite numbers, and only those', () => {
    for (const value of [0, -0, 1, -1.5, 1e300, Number.MAX_SAFE_INTEGER]) {
      expect(isNumber(value)).toBe(true)
    }
    for (const value of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      '1',
      null,
      undefined,
      1n,
      {}
    ]) {
      expect(isNumber(value)).toBe(false)
    }
  })
})

describe('isListOf', () => {
  const strings = isListOf(isString)

  it('accepts a list of which every item passes, an empty list included', () => {
    expect(strings([])).toBe(true)
    expect(strings(['a'])).toBe(true)
    expect(strings(['a', 'b', ''])).toBe(true)
  })

  it('refuses a list with one item that does not pass', () => {
    expect(strings(['a', 1])).toBe(false)
    expect(strings([1, 'a'])).toBe(false)
    expect(strings(['a', undefined])).toBe(false)
    expect(strings([null])).toBe(false)
  })

  it('refuses what is not a list', () => {
    for (const value of ['a', { 0: 'a', length: 1 }, null, undefined, 1]) {
      expect(strings(value)).toBe(false)
    }
  })

  it('does not skip the empty slots of a sparse list', () => {
    const sparse: unknown[] = ['a', 'b']
    sparse.length = 4
    expect(strings(sparse)).toBe(false)
    expect(isListOf((_item): _item is unknown => true)(sparse)).toBe(true)
  })

  it('looks at every item, not only the first or the last', () => {
    const seen: unknown[] = []
    isListOf((item): item is unknown => {
      seen.push(item)
      return true
    })([1, 2, 3])
    expect(seen).toEqual([1, 2, 3])
  })
})

describe('hasShape', () => {
  const shape = hasShape(
    { id: isString, amount: isNumber },
    { note: isString, tags: isListOf(isString) }
  )

  it('accepts an object with the required fields', () => {
    expect(shape({ id: 'a', amount: 1 })).toBe(true)
  })

  it('accepts the optional fields when they are right', () => {
    expect(shape({ id: 'a', amount: 1, note: 'n', tags: ['t'] })).toBe(true)
  })

  it('lets through fields it does not know: LINE Pay adds them', () => {
    expect(shape({ id: 'a', amount: 1, brandNew: { deep: [1] } })).toBe(true)
  })

  it('refuses an object without a required field, whichever it is', () => {
    expect(shape({ amount: 1 })).toBe(false)
    expect(shape({ id: 'a' })).toBe(false)
    expect(shape({})).toBe(false)
  })

  it('refuses a required field of the wrong type, undefined and null included', () => {
    expect(shape({ id: 1, amount: 1 })).toBe(false)
    expect(shape({ id: 'a', amount: '1' })).toBe(false)
    expect(shape({ id: undefined, amount: 1 })).toBe(false)
    expect(shape({ id: 'a', amount: null })).toBe(false)
  })

  it('takes an optional field that is missing or undefined', () => {
    expect(shape({ id: 'a', amount: 1, note: undefined })).toBe(true)
    expect(shape({ id: 'a', amount: 1, tags: undefined })).toBe(true)
  })

  it('refuses an optional field that is there with the wrong type, null included', () => {
    expect(shape({ id: 'a', amount: 1, note: 5 })).toBe(false)
    expect(shape({ id: 'a', amount: 1, note: null })).toBe(false)
    expect(shape({ id: 'a', amount: 1, tags: ['t', 5] })).toBe(false)
    expect(shape({ id: 'a', amount: 1, tags: 'tag' })).toBe(false)
  })

  it('refuses what is not an object', () => {
    for (const value of [
      null,
      undefined,
      'a',
      1,
      [],
      [{ id: 'a', amount: 1 }]
    ]) {
      expect(shape(value)).toBe(false)
    }
  })

  it('works without optional fields, and with none at all', () => {
    expect(hasShape({ id: isString })({ id: 'a' })).toBe(true)
    expect(hasShape({ id: isString })({})).toBe(false)
    expect(hasShape({})({})).toBe(true)
    expect(hasShape({})({ anything: 1 })).toBe(true)
    expect(hasShape({}, { note: isString })({ note: 1 })).toBe(false)
  })

  it('nests', () => {
    const outer = hasShape({ inner: shape })
    expect(outer({ inner: { id: 'a', amount: 1 } })).toBe(true)
    expect(outer({ inner: { id: 'a' } })).toBe(false)
    expect(outer({})).toBe(false)
  })
})
