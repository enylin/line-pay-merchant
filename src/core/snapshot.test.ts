import { describe, expect, it } from 'vitest'

import {
  isLinePayValidationError,
  type LinePayValidationError
} from '../errors'
import { inheriting } from '../test/helpers'
import { isArray } from './guard'
import { isPlainObject, snapshotOf } from './snapshot'

function refusal(input: unknown): LinePayValidationError {
  try {
    snapshotOf(input, 'refund')
  } catch (error) {
    if (isLinePayValidationError(error)) return error
    throw error
  }
  throw new Error('the input was accepted')
}

/** An array that is a subclass of Array. */
class Listy extends Array<unknown> {}
const listy = (): unknown[] => Listy.from([1, 2])

/** What a class that keeps its amount behind a name of its own looks like. */
class RefundRequest {
  #cents: number
  transactionId: string
  constructor(transactionId: string, cents: number) {
    this.transactionId = transactionId
    this.#cents = cents
  }
  get refundAmount(): number {
    return this.#cents / 100
  }
}

describe('isPlainObject', () => {
  it('knows an object made with {} or JSON.parse, and one with no prototype', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject(JSON.parse('{"a":1}'))).toBe(true)
    expect(isPlainObject(inheriting(null))).toBe(true)
  })

  it('does not know an array, not even one that has lost its prototype', () => {
    const bare: unknown[] = [1]
    Reflect.setPrototypeOf(bare, null)
    expect(isArray(bare)).toBe(true)
    expect(isPlainObject(bare)).toBe(false)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['an array', []],
    ['a class instance', new RefundRequest('1', 1)],
    ['an object with a prototype of its own', inheriting({ a: 1 })],
    ['a Date', new Date(0)],
    ['a Map', new Map<string, number>()],
    ['a function', () => 1]
  ])('does not know %s', (_name, value) => {
    expect(isPlainObject(value)).toBe(false)
  })
})

describe('snapshotOf', () => {
  it('copies what is plain, and what is not an object is passed on as it is', () => {
    const input = {
      transactionId: '1',
      list: [{ a: 1 }, 'b', null],
      nothing: undefined
    }
    const copy = snapshotOf(input, 'refund')

    expect(copy).toEqual(input)
    expect(copy).not.toBe(input)
    expect(copy.list).not.toBe(input.list)
    expect(Object.keys(copy)).toEqual(['transactionId', 'list', 'nothing'])
    for (const value of [undefined, null, 'x', 42, true]) {
      expect(snapshotOf(value, 'refund')).toBe(value)
    }
  })

  it('accepts an object with no prototype, a frozen one and a symbol key', () => {
    const bare = inheriting(null, { transactionId: '1' })
    const hidden = Symbol('hidden')
    const marked = { transactionId: '1' }
    Object.defineProperty(marked, hidden, { value: 1, enumerable: false })
    const frozen = Object.freeze({ transactionId: '1', list: [1] })

    expect(snapshotOf(bare, 'refund')).toEqual({ transactionId: '1' })
    expect(snapshotOf(marked, 'refund')).toEqual({ transactionId: '1' })
    expect(snapshotOf(frozen, 'refund')).toEqual({
      transactionId: '1',
      list: [1]
    })
  })

  it('terminates on a value that refers to itself, and leaves it to the checks', () => {
    const loop: Record<string, unknown> = { a: 1 }
    loop.self = loop
    const copy = snapshotOf(loop, 'refund')
    expect(copy.self).toBe(copy)
  })

  describe('refuses what a copy would leave out, where it is', () => {
    it.each([
      [
        'a field that a class keeps behind a #private name',
        new RefundRequest('1', 2000),
        'input'
      ],
      [
        'an object that gets its fields from a prototype',
        inheriting({ refundAmount: 20 }),
        'input'
      ],
      [
        'a field that is not enumerable',
        Object.defineProperty({ transactionId: '1' }, 'refundAmount', {
          value: 20,
          enumerable: false
        }),
        'refundAmount'
      ],
      [
        'a getter of the object itself',
        {
          transactionId: '1',
          get refundAmount() {
            return 20
          }
        },
        'refundAmount'
      ],
      [
        'a setter of the object itself',
        Object.defineProperty({ transactionId: '1' }, 'refundAmount', {
          set() {},
          enumerable: true
        }),
        'refundAmount'
      ],
      ['a Date', { transactionId: '1', at: new Date(0) }, 'at'],
      ['a Map', { transactionId: '1', m: new Map([['a', 1]]) }, 'm'],
      [
        'a class instance in a list',
        { packages: [{ id: 'p' }, new RefundRequest('1', 1)] },
        'packages[1]'
      ],
      [
        'a class instance deep inside',
        { a: { b: [{ c: new RefundRequest('1', 1) }] } },
        'a.b[0].c'
      ],
      [
        'a subclass of Array',
        {
          list: listy()
        },
        'list'
      ]
    ])('%s', (_name, input, path) => {
      const error = refusal(input)

      expect(error.issues).toHaveLength(1)
      expect(error.issues[0]?.path).toBe(path)
      expect(error.issues[0]?.message).not.toBe('')
      expect(error).toMatchObject({ outcome: 'not-sent', operation: 'refund' })
      expect(error.message).toContain(path)
    })

    it('says in the message of an object what to give instead', () => {
      expect(refusal(new RefundRequest('1', 1)).issues[0]?.message).toMatch(
        /plain object .*not an instance of a class/
      )
      expect(
        refusal({
          list: listy()
        }).issues[0]?.message
      ).toMatch(/plain array/)
      expect(
        refusal(Object.defineProperty({}, 'a', { value: 1 })).issues[0]?.message
      ).toMatch(/not enumerable/)
      expect(
        refusal({
          get a() {
            return 1
          }
        }).issues[0]?.message
      ).toMatch(/getter or a setter/)
    })

    it('does not run the getter of a class to find out', () => {
      let read = 0
      class Counting {
        get refundAmount() {
          read++
          return 20
        }
      }
      refusal(new Counting())
      expect(read).toBe(0)
    })
  })

  describe('refuses what a copy cannot hold', () => {
    it.each([
      ['a function', { f() {} }],
      ['a symbol', { s: Symbol('x') }]
    ])('%s, with the reason it gives', (_name, input) => {
      const error = refusal(input)

      expect(error.issues).toHaveLength(1)
      expect(error.issues[0]?.path).toBe('input')
      expect(error.issues[0]?.message).toContain('plain data')
      expect(error.cause).toBeInstanceOf(Error)
    })

    it('a Proxy, which the copy refuses', () => {
      const error = refusal(new Proxy({ transactionId: '1' }, {}))

      expect(error.issues[0]?.path).toBe('input')
      expect(error.cause).toBeDefined()
    })

    it('a Proxy that says a property it lists is not there', () => {
      const hiding = new Proxy(
        { transactionId: '1' },
        { getOwnPropertyDescriptor: () => undefined }
      )

      const error = refusal(hiding)

      // The walk has nothing to find, and the copy then refuses the Proxy.
      expect(error.issues[0]?.path).toBe('input')
      expect(error.issues[0]?.message).toContain('plain data')
      expect(error.cause).toMatchObject({ name: 'DataCloneError' })
    })

    it('a Proxy that throws when it is asked', () => {
      const boom = new Error('trap')
      const trap = new Proxy(
        {},
        {
          getPrototypeOf() {
            throw boom
          }
        }
      )
      const error = refusal(trap)

      expect(error.issues[0]?.path).toBe('input')
      expect(error.cause).toBe(boom)
    })

    it('a value nested too deep for the walk, as a validation error and not a RangeError', () => {
      let deep: Record<string, unknown> = {}
      for (let level = 0; level < 200_000; level++) deep = { next: deep }

      const error = refusal(deep)

      expect(error.issues[0]?.path).toBe('input')
      expect(error.cause).toBeInstanceOf(RangeError)
    })
  })
})
