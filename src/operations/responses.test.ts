import { describe, expect, it } from 'vitest'

import { isArray } from '../core/guard'
import { SAMPLES, TX } from '../test/helpers'
import type { PayInfo, ResponsePackage, SelectedShipping } from '../types'
import { type OperationOutput, operations } from './index'
import { OPERATION_NAMES, type OperationName } from './names'

/**
 * A response is given its type by the guard of its operation, so the guard has to
 * be exactly as strict as the type: every required field is there, every field
 * that is there has its type, and what the type does not know is let through.
 *
 * The compiler already sees to the required fields of the types. These tests see
 * to the rest: that the optional fields are checked as well, that none of them
 * is required by mistake, and that the guards agree with the table below.
 */

type Path = readonly (string | number)[]

const payInfo: PayInfo = {
  method: 'CREDIT_CARD',
  amount: 1000,
  creditCardNickname: 'my card',
  creditCardBrand: 'VISA',
  maskedCreditCardNumber: '**** **** **** 1234'
}

const shipping: SelectedShipping = {
  methodId: 'standard',
  feeAmount: 10,
  address: {
    country: 'TW',
    postalCode: '100',
    state: 'Taipei',
    city: 'Zhongzheng',
    detail: '1 Example Road',
    optional: '5F',
    recipient: {
      firstName: 'Ada',
      lastName: 'Lin',
      firstNameOptional: 'A',
      lastNameOptional: 'L',
      email: 'ada@example.com',
      phoneNo: '0912345678'
    }
  }
}

const pack: ResponsePackage = {
  id: 'p1',
  name: 'Tea',
  amount: 1000,
  userFeeAmount: 30,
  products: [
    {
      id: 'sku-1',
      name: 'Oolong',
      imageUrl: 'https://shop.example/oolong.png',
      quantity: 2,
      price: 500,
      originalPrice: 600
    }
  ]
}

const OK = { returnCode: '0000', returnMessage: 'Success.' }

/** A response of each operation with every field its type has. */
const RICH: { [K in OperationName]: OperationOutput<K> } = {
  request: {
    ...OK,
    info: {
      transactionId: TX,
      paymentAccessToken: '187568751124',
      paymentUrl: {
        web: 'https://web-pay.line.me/w/payments/wait',
        app: 'line://pay/payment/wait'
      }
    }
  },
  confirm: {
    ...OK,
    info: {
      orderId: 'order-1',
      transactionId: TX,
      authorizationExpireDate: '2026-11-27T00:00:00Z',
      regKey: 'RK9A2BA1937EQTO',
      payInfo: [payInfo],
      packages: [pack],
      shipping,
      paymentProvider: 'TSP'
    }
  },
  capture: {
    ...OK,
    info: {
      orderId: 'order-1',
      transactionId: TX,
      payInfo: [payInfo],
      paymentProvider: 'TSP'
    }
  },
  void: OK,
  refund: {
    ...OK,
    info: {
      refundTransactionId: '2021121300698360312',
      refundTransactionDate: '2026-10-27T00:05:00Z'
    }
  },
  paymentDetails: {
    ...OK,
    info: [
      {
        transactionId: TX,
        transactionType: 'PAYMENT',
        orderId: 'order-1',
        transactionDate: '2026-10-27T00:00:10Z',
        payStatus: 'CAPTURE',
        productName: 'Tea',
        merchantName: 'Tea Shop',
        currency: 'TWD',
        authorizationExpireDate: '2026-11-27T00:00:00Z',
        payInfo: [payInfo],
        refundList: [
          {
            refundTransactionId: '2021121300698360312',
            transactionType: 'PARTIAL_REFUND',
            refundAmount: 20,
            refundTransactionDate: '2026-10-27T00:05:00Z'
          }
        ],
        originalTransactionId: '2021121300698360300',
        packages: [pack],
        shipping,
        events: [{ code: 'EVENT1', totalAmount: 5, productQuantity: 1 }],
        paymentProvider: 'TSP'
      }
    ]
  },
  checkPaymentStatus: {
    ...OK,
    info: [{ shipping: { methodId: 'standard', feeAmount: 10 } }]
  },
  checkRegKey: OK,
  payPreapproved: {
    ...OK,
    info: {
      orderId: 'order-1',
      transactionId: TX,
      transactionDate: '2026-10-27T00:00:10Z',
      authorizationExpireDate: '2026-11-27T00:00:00Z',
      paymentProvider: 'EPI'
    }
  },
  expireRegKey: OK
}

const field = (...path: (string | number)[]): Path => path

const inPayInfo = (...prefix: (string | number)[]): Path[] => [
  field(...prefix, 'method'),
  field(...prefix, 'amount')
]
const inPackage = (...prefix: (string | number)[]): Path[] => [
  field(...prefix, 'id'),
  field(...prefix, 'amount'),
  field(...prefix, 'products', 0, 'name'),
  field(...prefix, 'products', 0, 'quantity'),
  field(...prefix, 'products', 0, 'price')
]
const inShipping = (...prefix: (string | number)[]): Path[] => [
  field(...prefix, 'methodId'),
  field(...prefix, 'feeAmount')
]

/**
 * The fields that must be there, and so the only ones. Everything else the types
 * list is optional. (A product is required in a package only for its name,
 * quantity and price; a package, a pay info and a shipping have these fields.)
 */
const REQUIRED: { [K in OperationName]: readonly Path[] } = {
  request: [
    field('returnCode'),
    field('returnMessage'),
    field('info'),
    field('info', 'transactionId'),
    field('info', 'paymentUrl'),
    field('info', 'paymentUrl', 'web')
  ],
  confirm: [
    field('returnCode'),
    field('returnMessage'),
    field('info'),
    field('info', 'orderId'),
    field('info', 'transactionId'),
    field('info', 'payInfo'),
    ...inPayInfo('info', 'payInfo', 0),
    ...inPackage('info', 'packages', 0),
    ...inShipping('info', 'shipping')
  ],
  capture: [
    field('returnCode'),
    field('returnMessage'),
    field('info'),
    field('info', 'orderId'),
    field('info', 'transactionId'),
    field('info', 'payInfo'),
    ...inPayInfo('info', 'payInfo', 0)
  ],
  void: [field('returnCode'), field('returnMessage')],
  refund: [
    field('returnCode'),
    field('returnMessage'),
    field('info'),
    field('info', 'refundTransactionId'),
    field('info', 'refundTransactionDate')
  ],
  paymentDetails: [
    field('returnCode'),
    field('returnMessage'),
    field('info'),
    field('info', 0, 'transactionId'),
    field('info', 0, 'transactionType'),
    ...inPayInfo('info', 0, 'payInfo', 0),
    field('info', 0, 'refundList', 0, 'refundTransactionId'),
    field('info', 0, 'refundList', 0, 'transactionType'),
    field('info', 0, 'refundList', 0, 'refundAmount'),
    field('info', 0, 'refundList', 0, 'refundTransactionDate'),
    ...inPackage('info', 0, 'packages', 0),
    ...inShipping('info', 0, 'shipping'),
    field('info', 0, 'events', 0, 'code'),
    field('info', 0, 'events', 0, 'totalAmount'),
    field('info', 0, 'events', 0, 'productQuantity')
  ],
  checkPaymentStatus: [
    field('returnCode'),
    field('returnMessage'),
    ...inShipping('info', 0, 'shipping')
  ],
  checkRegKey: [field('returnCode'), field('returnMessage')],
  payPreapproved: [
    field('returnCode'),
    field('returnMessage'),
    field('info'),
    field('info', 'transactionId'),
    field('info', 'transactionDate')
  ],
  expireRegKey: [field('returnCode'), field('returnMessage')]
}

const key = (path: Path): string => path.join('.')

/** The object or array that holds the last step of the path. */
function parentOf(root: unknown, path: Path): object {
  let current: unknown = root
  for (const step of path.slice(0, -1)) {
    if (typeof current !== 'object' || current === null) {
      throw new Error(`there is nothing at ${key(path)}`)
    }
    current = Reflect.get(current, step)
  }
  if (typeof current !== 'object' || current === null) {
    throw new Error(`there is nothing at ${key(path)}`)
  }
  return current
}

function lastStep(path: Path): string | number {
  const step = path.at(-1)
  if (step === undefined) throw new Error('the path is empty')
  return step
}

/** A copy of the response with the value at `path` replaced. */
function replaced(response: unknown, path: Path, value: unknown): unknown {
  const copy: unknown = structuredClone(response)
  Reflect.set(parentOf(copy, path), lastStep(path), value)
  return copy
}

/** A copy of the response without the field at `path`. */
function without(response: unknown, path: Path): unknown {
  const copy: unknown = structuredClone(response)
  Reflect.deleteProperty(parentOf(copy, path), lastStep(path))
  return copy
}

/** Every field of an object, and every item of a list, at any depth. */
function pathsIn(value: unknown, prefix: Path = []): Path[] {
  if (typeof value !== 'object' || value === null) return []
  const steps: (string | number)[] = isArray(value)
    ? value.map((_item: unknown, index) => index)
    : Object.keys(value)
  return steps.flatMap(step => {
    const path = [...prefix, step]
    return [path, ...pathsIn(Reflect.get(value, step), path)]
  })
}

/** Every object (not list) at any depth, as a path. */
function objectPaths(value: unknown, prefix: Path = []): Path[] {
  if (typeof value !== 'object' || value === null) return []
  const here: Path[] = isArray(value) ? [] : [prefix]
  const steps: (string | number)[] = isArray(value)
    ? value.map((_item: unknown, index) => index)
    : Object.keys(value)
  return [
    ...here,
    ...steps.flatMap(step =>
      objectPaths(Reflect.get(value, step), [...prefix, step])
    )
  ]
}

/** What `value` is not: a value of another type, for each type there is. */
function wrongTypesFor(value: unknown): unknown[] {
  if (typeof value === 'string') return [1, null, true, {}, []]
  if (typeof value === 'number') {
    return ['1', null, Number.NaN, Number.POSITIVE_INFINITY, {}, []]
  }
  if (isArray(value)) return [null, 'x', 1, {}]
  return [null, 'x', 1, [], true]
}

describe.each(OPERATION_NAMES)('the response of %s', name => {
  const accepts = (value: unknown): boolean => operations[name].response(value)
  const rich = RICH[name]
  const required = REQUIRED[name].map(key)

  it('is accepted in the smallest form its type allows', () => {
    expect(accepts(SAMPLES[name])).toBe(true)
  })

  it('is accepted with every field its type has', () => {
    expect(accepts(rich)).toBe(true)
  })

  it('describes every required field of the table, and each is in the sample', () => {
    const present = pathsIn(rich).map(key)
    for (const path of REQUIRED[name]) {
      expect(present, key(path)).toContain(key(path))
    }
  })

  it.each([undefined, null, 'text', 5, true, [], [rich], () => rich])(
    'is refused when it is %j',
    value => {
      expect(accepts(value)).toBe(false)
    }
  )

  it('lets through the fields it does not know, at every level', () => {
    const richer: unknown = structuredClone(rich)
    for (const path of objectPaths(richer)) {
      const target: unknown =
        path.length === 0
          ? richer
          : Reflect.get(parentOf(richer, path), lastStep(path))
      if (typeof target === 'object' && target !== null) {
        Reflect.set(target, 'aFieldOfTheFuture', { deep: [1, 2, 3] })
      }
    }
    expect(accepts(richer)).toBe(true)
  })

  it.each(REQUIRED[name].map(path => [key(path), path] as const))(
    'is refused without %s',
    (_name, path) => {
      expect(accepts(without(rich, path))).toBe(false)
    }
  )

  it.each(REQUIRED[name].map(path => [key(path), path] as const))(
    'is refused with %s set to undefined or null',
    (_name, path) => {
      expect(accepts(replaced(rich, path, undefined))).toBe(false)
      expect(accepts(replaced(rich, path, null))).toBe(false)
    }
  )

  it('is accepted without any field that is not required', () => {
    // A field that is optional may be missing, whatever it holds: a list of
    // packages without packages in it is as good as a response without the list.
    const optional = pathsIn(rich).filter(
      path =>
        !required.includes(key(path)) && typeof lastStep(path) === 'string'
    )
    for (const path of optional) {
      expect(accepts(without(rich, path)), `without ${key(path)}`).toBe(true)
    }
  })

  it('is refused when any field has the wrong type', () => {
    for (const path of pathsIn(rich)) {
      const current: unknown = Reflect.get(parentOf(rich, path), lastStep(path))
      for (const wrong of wrongTypesFor(current)) {
        expect(
          accepts(replaced(rich, path, wrong)),
          `${key(path)} = ${String(wrong)}`
        ).toBe(false)
      }
    }
  })
})
