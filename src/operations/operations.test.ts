import { describe, expect, it } from 'vitest'

import { createLinePayClient } from '../client'
import { Checker } from '../core/validate'
import { isLinePayValidationError } from '../errors'
import {
  applyUntyped,
  CHANNEL_ID,
  ok,
  scriptedFetch,
  SECRET,
  untyped
} from '../test/helpers'
import { type OperationInput, operations, type OperationTypes } from './index'
import {
  OPERATION_NAMES,
  type OperationName,
  RECONCILABLE_OPERATIONS
} from './names'
import type { RequestPaymentInput, RequestPaymentOptions } from './request'

const TX = '2021121300698360310'
const REG_KEY = 'RK9A2BA1937EQTO'

const config = {
  channelId: CHANNEL_ID,
  channelSecretKey: SECRET,
  env: 'sandbox'
} as const

const validRequest: RequestPaymentInput = {
  amount: 1000,
  currency: 'TWD',
  orderId: '20211216003',
  packages: [
    {
      id: 'c99abc79-3b29-4f40-8851-bc618ca57856',
      amount: 1000,
      products: [{ name: 'Product Name', quantity: 2, price: 500 }]
    }
  ],
  redirectUrls: {
    confirmUrl: 'https://myshop.com/confirmUrl',
    cancelUrl: 'https://myshop.com/cancelUrl'
  }
}

interface Case<K extends OperationName> {
  name: K
  input: OperationInput<K>
  method: 'GET' | 'POST'
  path: string
  /** Expected body (POST) */
  body?: unknown
  /** Expected query (GET) */
  query?: unknown
  timeout: number
  effect: string
  reconcile?: unknown
}

const cases: { [K in OperationName]: Case<K> } = {
  request: {
    name: 'request',
    input: validRequest,
    method: 'POST',
    path: '/v4/payments/request',
    body: validRequest,
    timeout: 20_000,
    effect: 'create'
  },
  confirm: {
    name: 'confirm',
    input: { transactionId: TX, amount: 1000, currency: 'TWD' },
    method: 'POST',
    path: `/v4/payments/${TX}/confirm`,
    body: { amount: 1000, currency: 'TWD' },
    timeout: 40_000,
    effect: 'settle',
    reconcile: { transactionId: TX, amount: 1000, currency: 'TWD' }
  },
  capture: {
    name: 'capture',
    input: { transactionId: TX, amount: 1000, currency: 'TWD' },
    method: 'POST',
    path: `/v4/payments/authorizations/${TX}/capture`,
    body: { amount: 1000, currency: 'TWD' },
    timeout: 60_000,
    effect: 'settle',
    reconcile: { transactionId: TX, amount: 1000, currency: 'TWD' }
  },
  void: {
    name: 'void',
    input: { transactionId: TX },
    method: 'POST',
    path: `/v4/payments/authorizations/${TX}/void`,
    body: {},
    timeout: 20_000,
    effect: 'settle',
    reconcile: { transactionId: TX }
  },
  refund: {
    name: 'refund',
    input: { transactionId: TX, refundAmount: 20 },
    method: 'POST',
    path: `/v4/payments/${TX}/refund`,
    body: { refundAmount: 20 },
    timeout: 20_000,
    effect: 'refund',
    reconcile: { transactionId: TX, refundAmount: 20 }
  },
  paymentDetails: {
    name: 'paymentDetails',
    input: { transactionId: [TX], orderId: ['a', 'b'] },
    method: 'GET',
    path: '/v4/payments',
    query: { transactionId: [TX], orderId: ['a', 'b'] },
    timeout: 60_000,
    effect: 'read'
  },
  checkPaymentStatus: {
    name: 'checkPaymentStatus',
    input: { transactionId: TX },
    method: 'GET',
    path: `/v4/payments/requests/${TX}/check`,
    query: {},
    timeout: 20_000,
    effect: 'read'
  },
  checkRegKey: {
    name: 'checkRegKey',
    input: { regKey: REG_KEY, creditCardAuth: true },
    method: 'GET',
    path: `/v4/payments/preapprovedPay/${REG_KEY}/check`,
    query: { creditCardAuth: true },
    timeout: 20_000,
    effect: 'read'
  },
  payPreapproved: {
    name: 'payPreapproved',
    input: {
      regKey: REG_KEY,
      productName: 'Demo Product',
      amount: 100,
      currency: 'TWD',
      orderId: '20211221001'
    },
    method: 'POST',
    path: `/v4/payments/preapprovedPay/${REG_KEY}/payment`,
    body: {
      productName: 'Demo Product',
      amount: 100,
      currency: 'TWD',
      orderId: '20211221001'
    },
    timeout: 40_000,
    effect: 'settle',
    // Not the regKey: it is a credential, and the payment is found by its order ID.
    reconcile: {
      orderId: '20211221001',
      amount: 100,
      currency: 'TWD'
    }
  },
  expireRegKey: {
    name: 'expireRegKey',
    input: { regKey: REG_KEY },
    method: 'POST',
    path: `/v4/payments/preapprovedPay/${REG_KEY}/expire`,
    body: {},
    timeout: 20_000,
    effect: 'settle'
  }
}

/** Run the rules of an operation, as the executor does, and return the paths of the problems found. */
function problems<K extends OperationName>(
  name: K,
  input: OperationInput<K>
): string[] {
  const checker = new Checker()
  operations[name].invariants?.(input, checker)
  operations[name].check?.(input, checker)
  return checker.issues.map(issue => issue.path)
}

/** Like `problems`, for an input the types would refuse. */
function problemsOf(name: OperationName, input: unknown): string[] {
  const checker = new Checker()
  const { check, invariants } = operations[name]
  if (invariants !== undefined) applyUntyped(invariants, [input, checker])
  if (check !== undefined) applyUntyped(check, [input, checker])
  return checker.issues.map(issue => issue.path)
}

/** Only the rules that hold with `validate: false`. */
function invariantProblems(name: OperationName, input: unknown): string[] {
  const checker = new Checker()
  const { invariants } = operations[name]
  if (invariants !== undefined) applyUntyped(invariants, [input, checker])
  return checker.issues.map(issue => issue.path)
}

describe('registry', () => {
  it('defines every operation, and nothing else', () => {
    expect(Object.keys(operations).sort()).toEqual([...OPERATION_NAMES].sort())
    expect(Object.keys(cases).sort()).toEqual([...OPERATION_NAMES].sort())
  })

  it('keeps the two lists that every client reads frozen', () => {
    // They decide which calls are looked up, in every client of the process.
    expect(Object.isFrozen(OPERATION_NAMES)).toBe(true)
    expect(Object.isFrozen(RECONCILABLE_OPERATIONS)).toBe(true)
    expect(() => {
      Reflect.apply(Array.prototype.push, RECONCILABLE_OPERATIONS, ['request'])
    }).toThrow(TypeError)
  })

  it('supports reconcile for exactly the reconcilable operations', () => {
    const withFields = OPERATION_NAMES.filter(
      name => operations[name].reconcileFields !== undefined
    )
    expect(withFields.sort()).toEqual([...RECONCILABLE_OPERATIONS].sort())
  })
})

function describeOperation<K extends OperationName>(name: K) {
  describe(`operation ${name}`, () => {
    const spec = cases[name]
    const definition = operations[name]

    it('describes the HTTP call', () => {
      expect(definition.method).toBe(spec.method)
      expect(definition.path(spec.input)).toBe(spec.path)
      expect(definition.defaultTimeout).toBe(spec.timeout)
      expect(definition.effect).toBe(spec.effect)
    })

    it(spec.method === 'POST' ? 'builds the body' : 'builds the query', () => {
      if (spec.method === 'POST') {
        expect(definition.body?.(spec.input)).toEqual(spec.body)
      } else {
        expect(definition.query?.(spec.input)).toEqual(spec.query)
      }
    })

    it('keeps path parameters out of the body', () => {
      if (spec.method !== 'POST') return
      const body = definition.body?.(spec.input)
      expect(body).not.toHaveProperty('transactionId')
      expect(body).not.toHaveProperty('regKey')
    })

    it('reports what reconcile needs', () => {
      expect(definition.reconcileFields?.(spec.input)).toStrictEqual(
        spec.reconcile
      )
    })

    it('accepts a valid input', () => {
      const checker = new Checker()
      definition.invariants?.(spec.input, checker)
      definition.check?.(spec.input, checker)
      expect(checker.issues).toEqual([])
    })
  })
}

for (const name of OPERATION_NAMES) describeOperation(name)

// Regression A4: version 0.9 interpolated these straight into the signed path.
// A field that is misspelled is left out without a word, and an object that
// was passed on as it came from a user would have its own fields signed and sent.
describe('fields that an operation does not have', () => {
  it.each(OPERATION_NAMES.filter(name => name !== 'refund'))(
    '%s refuses one',
    name => {
      const input = { ...cases[name].input, isAdmin: true }
      expect(problemsOf(name, input)).toEqual(['isAdmin'])
    }
  )

  it('catches the typo of an optional field of each operation', () => {
    expect(
      problemsOf('payPreapproved', {
        ...cases.payPreapproved.input,
        captrue: false
      })
    ).toEqual(['captrue'])
    expect(
      problemsOf('checkRegKey', { regKey: REG_KEY, creditCardAuht: true })
    ).toEqual(['creditCardAuht'])
    expect(
      problemsOf('paymentDetails', { orderId: ['o'], feilds: 'ORDER' })
    ).toEqual(['feilds'])
  })

  it('still takes every field the types have', () => {
    for (const name of OPERATION_NAMES) {
      expect(problems(name, cases[name].input), name).toEqual([])
    }
  })

  it('lets them through when the business rules are switched off', async () => {
    const { fetch, calls } = scriptedFetch(ok)
    const client = createLinePayClient({
      ...config,
      validate: false,
      fetch,
      middleware: []
    })
    await untyped(client, 'confirm', { ...cases.confirm.input, extra: 1 })
    expect(calls).toHaveLength(1)
  })
})

describe('path parameters', () => {
  const evilIds = [
    '../../v3/payments/preapprovedPay/RK123/expire?x=',
    '123/../456',
    '',
    '12345678901234567890',
    undefined
  ]
  const evilKeys = ['RK/../request', 'RK?x=1', '', 'RK 1', undefined]

  const byTransactionId = [
    'confirm',
    'capture',
    'void',
    'refund',
    'checkPaymentStatus'
  ] as const
  const byRegKey = ['checkRegKey', 'payPreapproved', 'expireRegKey'] as const

  it.each(byTransactionId)('%s rejects a malicious transactionId', name => {
    for (const transactionId of evilIds) {
      const input = { ...cases[name].input, transactionId }
      try {
        applyUntyped(operations[name].path, [input])
        expect.unreachable(`${name} accepted ${String(transactionId)}`)
      } catch (error) {
        expect(isLinePayValidationError(error)).toBe(true)
      }
    }
  })

  it.each(byRegKey)('%s rejects a malicious regKey', name => {
    for (const regKey of evilKeys) {
      const input = { ...cases[name].input, regKey }
      try {
        applyUntyped(operations[name].path, [input])
        expect.unreachable(`${name} accepted ${String(regKey)}`)
      } catch (error) {
        expect(isLinePayValidationError(error)).toBe(true)
      }
    }
  })
})

describe('business rules', () => {
  describe('request', () => {
    const withPackages = (
      amount: number,
      packageAmount: number,
      extra: Partial<RequestPaymentInput> = {}
    ): RequestPaymentInput => ({
      ...validRequest,
      amount,
      packages: [
        {
          id: 'p1',
          amount: packageAmount,
          products: [{ name: 'item', quantity: 2, price: 500 }]
        }
      ],
      ...extra
    })

    it('refuses a fee that is not a number, instead of adding it as text', () => {
      const withFee = (userFee: unknown, feeAmount?: unknown) => ({
        ...withPackages(1000, 1000),
        packages: [
          {
            id: 'p1',
            amount: 1000,
            userFee,
            products: [{ name: 'item', quantity: 2, price: 500 }]
          }
        ],
        options:
          feeAmount === undefined ? undefined : { shipping: { feeAmount } }
      })
      for (const userFee of ['1', -1, Number.NaN, null, true]) {
        const found = problemsOf('request', withFee(userFee))
        expect(found, String(userFee)).toContain('packages[0].userFee')
      }
      for (const feeAmount of ['5', -5, Number.NaN, null]) {
        const found = problemsOf('request', withFee(undefined, feeAmount))
        expect(found, String(feeAmount)).toContain('options.shipping.feeAmount')
      }
      // The total that is asked for is a sum of numbers, never of text.
      const checker = new Checker()
      applyUntyped(operations.request.check ?? (() => undefined), [
        withFee('1'),
        checker
      ])
      const messages = checker.issues.map(issue => issue.message).join('\n')
      expect(messages).not.toMatch(/which is 0?1\d{3}/)
      expect(problemsOf('request', withFee(0, 0))).toEqual([])
    })

    it('checks what makes a payment authorize only, or register a regKey', () => {
      const withPayment = (payment: unknown) => ({
        ...validRequest,
        options: { payment }
      })
      expect(
        problemsOf(
          'request',
          withPayment({ capture: false, payType: 'NORMAL' })
        )
      ).toEqual([])
      expect(problemsOf('request', withPayment({ capture: 'false' }))).toEqual([
        'options.payment.capture'
      ])
      expect(
        problemsOf('request', withPayment({ payType: 'PREAPPROVE' }))
      ).toEqual(['options.payment.payType'])
      expect(problemsOf('request', withPayment({ captrue: false }))).toEqual([
        'options.payment.captrue'
      ])
      expect(problemsOf('request', withPayment('capture'))).toEqual([
        'options.payment'
      ])
    })

    it('adds user fees and shipping to the expected amount', () => {
      const input = withPackages(1130, 1000, {
        packages: [
          {
            id: 'p1',
            amount: 1000,
            userFee: 30,
            products: [{ name: 'item', quantity: 2, price: 500 }]
          }
        ],
        options: { shipping: { feeAmount: 100 } }
      })
      expect(problems('request', input)).toEqual([])
    })

    it('refuses unknown nested keys rather than sending user data', () => {
      const packageInput = {
        ...validRequest,
        packages: [{ ...validRequest.packages[0], customerEmail: 'private' }]
      }
      expect(problemsOf('request', packageInput)).toContain(
        'packages[0].customerEmail'
      )
      const productInput = {
        ...validRequest,
        packages: [
          {
            ...validRequest.packages[0],
            products: [
              {
                name: 'Product Name',
                quantity: 2,
                price: 500,
                customerEmail: 'private'
              }
            ]
          }
        ]
      }
      expect(problemsOf('request', productInput)).toContain(
        'packages[0].products[0].customerEmail'
      )
      expect(
        problemsOf('request', {
          ...validRequest,
          redirectUrls: { ...validRequest.redirectUrls, unexpected: 'secret' }
        })
      ).toContain('redirectUrls.unexpected')
      expect(
        problemsOf('request', {
          ...validRequest,
          options: { extra: { branchId: '1', hidden: 'secret' } }
        })
      ).toContain('options.extra.hidden')
      // V4's unpublished regPayRequest schema remains opaque.
      expect(
        problemsOf('request', {
          ...validRequest,
          options: { regPayRequest: { futureV4Field: true } }
        })
      ).toEqual([])
    })

    it('accepts V4 polling without callback URLs and rejects URLs in NONE mode', () => {
      const polling: RequestPaymentInput = {
        ...validRequest,
        redirectUrls: { confirmUrlType: 'NONE' }
      }
      expect(problems('request', polling)).toEqual([])
      expect(operations.request.body?.(polling)).toStrictEqual(polling)
      expect(
        problemsOf('request', {
          ...validRequest,
          redirectUrls: {
            confirmUrlType: 'NONE',
            confirmUrl: 'https://shop.example/confirm',
            cancelUrl: 'https://shop.example/cancel'
          }
        })
      ).toEqual(['redirectUrls.confirmUrl', 'redirectUrls.cancelUrl'])
      expect(
        problemsOf('request', {
          ...validRequest,
          redirectUrls: { confirmUrlType: 'CLIENT' }
        })
      ).toEqual(['redirectUrls.confirmUrl', 'redirectUrls.cancelUrl'])
    })

    it('refuses an unknown key at every depth of the options, and says where', () => {
      const found = (options: unknown) =>
        problemsOf('request', { ...validRequest, options })
      expect(found({ hidden: 1 })).toEqual(['options.hidden'])
      expect(found({ display: { locale: 'en', hidden: 1 } })).toEqual([
        'options.display.hidden'
      ])
      expect(found({ shipping: { type: 'NO_SHIPPING', hidden: 1 } })).toEqual([
        'options.shipping.hidden'
      ])
      expect(
        found({ shipping: { address: { country: 'TW', hidden: 1 } } })
      ).toEqual(['options.shipping.address.hidden'])
      expect(
        found({
          shipping: { address: { recipient: { firstName: 'A', hidden: 1 } } }
        })
      ).toEqual(['options.shipping.address.recipient.hidden'])
      expect(found({ familyService: { hidden: 1 } })).toEqual([
        'options.familyService.hidden'
      ])
      expect(
        found({
          familyService: {
            addFriends: [
              { type: 'lineAt', idList: ['@shop'] },
              { type: 'lineAt', hidden: 1 }
            ]
          }
        })
      ).toEqual(['options.familyService.addFriends[1].hidden'])
    })

    it('names the object that a refused key was found in', () => {
      const checker = new Checker()
      applyUntyped(operations.request.check ?? (() => undefined), [
        { ...validRequest, options: { display: { hidden: 1 } } },
        checker
      ])
      expect(checker.issues).toEqual([
        {
          path: 'options.display.hidden',
          message: 'is not a field of the options.display object'
        }
      ])
    })

    it('refuses an option group that is not an object, instead of sending it as it is', () => {
      const found = (options: unknown) =>
        problemsOf('request', { ...validRequest, options })
      for (const value of ['x', 5, true, null, []]) {
        const label = JSON.stringify(value)
        expect(found(value), label).toEqual(['options'])
        expect(found({ display: value }), label).toEqual(['options.display'])
        expect(found({ shipping: value }), label).toEqual(['options.shipping'])
        expect(found({ familyService: value }), label).toEqual([
          'options.familyService'
        ])
        expect(found({ extra: value }), label).toEqual(['options.extra'])
        expect(found({ shipping: { address: value } }), label).toEqual([
          'options.shipping.address'
        ])
        expect(
          found({ shipping: { address: { recipient: value } } }),
          label
        ).toEqual(['options.shipping.address.recipient'])
        expect(
          found({ familyService: { addFriends: [value] } }),
          label
        ).toEqual(['options.familyService.addFriends[0]'])
      }
      // A group that was left out is not a problem.
      expect(found({ display: undefined, shipping: undefined })).toEqual([])
    })

    it('takes every field that the options declare, so that the list of the check follows the type', () => {
      // Typed: a field added to the type and missing from the check fails here.
      const options: RequestPaymentOptions = {
        payment: { capture: false, payType: 'NORMAL' },
        display: { locale: 'zh_TW', checkConfirmUrlBrowser: true },
        shipping: {
          type: 'FIXED_ADDRESS',
          feeAmount: 0,
          feeInquiryUrl: 'https://shop.example/fee',
          feeInquiryType: 'FIXED',
          address: {
            country: 'TW',
            postalCode: '100',
            state: 'Taipei',
            city: 'Taipei',
            detail: 'No. 1',
            optional: 'Floor 2',
            recipient: {
              firstName: 'A',
              lastName: 'B',
              firstNameOptional: 'a',
              lastNameOptional: 'b',
              email: 'a@example.com',
              phoneNo: '0912345678'
            }
          }
        },
        familyService: { addFriends: [{ type: 'lineAt', idList: ['@shop'] }] },
        extra: { branchName: 'Main', branchId: '1' },
        regPayRequest: { anything: true }
      }
      expect(problems('request', { ...validRequest, options })).toEqual([])
    })

    it('rejects a total that does not add up', () => {
      expect(problems('request', withPackages(999, 1000))).toEqual(['amount'])
    })

    it('rejects a package amount that differs from its products', () => {
      expect(problems('request', withPackages(900, 900))).toEqual([
        'packages[0].amount'
      ])
    })

    it('tolerates floating point noise', () => {
      const input = withPackages(0.3, 0.3, {
        packages: [
          {
            id: 'p1',
            amount: 0.3,
            products: [
              { name: 'a', quantity: 1, price: 0.1 },
              { name: 'b', quantity: 1, price: 0.2 }
            ]
          }
        ]
      })
      expect(problems('request', input)).toEqual([])
    })

    it('reports every missing or invalid field', () => {
      const broken = {
        amount: -1,
        currency: 'JPY',
        orderId: '',
        packages: [],
        redirectUrls: {}
      }
      expect(problemsOf('request', broken)).toEqual([
        'amount',
        'currency',
        'orderId',
        'redirectUrls.confirmUrl',
        'redirectUrls.cancelUrl',
        'packages'
      ])
    })

    it('limits the order ID to 100 characters', () => {
      const input = { ...validRequest, orderId: 'x'.repeat(101) }
      expect(problems('request', input)).toEqual(['orderId'])
    })

    it('does not crash on a package without products', () => {
      const input = {
        ...validRequest,
        packages: [{ id: 'p1', amount: 1000 }]
      }
      expect(problemsOf('request', input)).toContain('packages[0].products')
    })

    // The caller of a plain JavaScript program (or `req.body`) may pass anything.
    // What is wrong is told, once, and the check does not throw on it.
    describe('an input of the wrong shape', () => {
      const issuesOf = (input: unknown): string[] => {
        const checker = new Checker()
        applyUntyped(operations.request.check ?? (() => undefined), [
          input,
          checker
        ])
        return checker.issues.map(issue => `${issue.path} ${issue.message}`)
      }
      const NON_EMPTY = 'must be a non-empty string'
      const NON_EMPTY_LIST = 'must be a non-empty array'
      const POSITIVE = 'must be a finite number greater than 0'
      const total = (sum: number) =>
        `amount must equal sum(packages[].amount) + sum(packages[].userFee) + options.shipping.feeAmount, which is ${sum}`
      const packageTotal = (sum: number) =>
        `packages[0].amount must equal sum(products[].quantity * products[].price), which is ${sum}`
      const withPackage = (patch: Record<string, unknown>) => ({
        ...validRequest,
        packages: [{ ...validRequest.packages[0], ...patch }]
      })
      const withProduct = (patch: Record<string, unknown> | null) =>
        withPackage({
          products: [
            patch === null
              ? null
              : { ...validRequest.packages[0]?.products[0], ...patch }
          ]
        })
      const urls = [
        `redirectUrls.confirmUrl ${NON_EMPTY}`,
        `redirectUrls.cancelUrl ${NON_EMPTY}`
      ]

      it.each([
        ['no redirectUrls', { ...validRequest, redirectUrls: undefined }, urls],
        [
          'redirectUrls that is null',
          { ...validRequest, redirectUrls: null },
          urls
        ],
        [
          'no packages',
          { ...validRequest, packages: undefined },
          [`packages ${NON_EMPTY_LIST}`]
        ],
        [
          'packages that is text',
          { ...validRequest, packages: 'abc' },
          [`packages ${NON_EMPTY_LIST}`]
        ],
        [
          'a package that is null',
          { ...validRequest, packages: [null] },
          [
            `packages[0].id ${NON_EMPTY}`,
            `packages[0].amount ${POSITIVE}`,
            `packages[0].products ${NON_EMPTY_LIST}`,
            total(0)
          ]
        ],
        [
          'a package with no products in the list',
          withPackage({ products: [] }),
          [`packages[0].products ${NON_EMPTY_LIST}`, total(0)]
        ],
        [
          'a product that is null',
          withProduct(null),
          [
            `packages[0].products[0].name ${NON_EMPTY}`,
            `packages[0].products[0].quantity ${POSITIVE}`,
            'packages[0].products[0].price must be a finite number',
            packageTotal(0)
          ]
        ],
        [
          'a product without a quantity',
          withProduct({ quantity: undefined }),
          [`packages[0].products[0].quantity ${POSITIVE}`, packageTotal(0)]
        ],
        [
          'a product without a price',
          withProduct({ price: undefined }),
          [
            'packages[0].products[0].price must be a finite number',
            packageTotal(0)
          ]
        ],
        [
          'a package amount that is text',
          withPackage({ amount: 'abc' }),
          [`packages[0].amount ${POSITIVE}`, total(0)]
        ],
        [
          'an amount that is text',
          { ...validRequest, amount: 'abc' },
          [`amount ${POSITIVE}`]
        ],
        [
          'no amount',
          { ...validRequest, amount: undefined },
          [`amount ${POSITIVE}`]
        ]
      ])('%s is told as it is', (_name, input, expected) => {
        expect(issuesOf(input)).toEqual(expected)
      })
    })
  })

  it('confirm and capture need a positive amount and a supported currency', () => {
    for (const name of ['confirm', 'capture'] as const) {
      const bad = { transactionId: TX, amount: 0, currency: 'JPY' }
      expect(problemsOf(name, bad)).toEqual(['amount', 'currency'])
    }
  })

  it('refund accepts a missing amount (a full refund) but not a bad one', () => {
    expect(problems('refund', { transactionId: TX })).toEqual([])
    expect(problems('refund', { transactionId: TX, refundAmount: -5 })).toEqual(
      ['refundAmount']
    )
    expect(operations.refund.body?.({ transactionId: TX })).toStrictEqual({})
  })

  describe('refund: leaving the amount out refunds everything', () => {
    it('refuses an amount that is there without a value', () => {
      // A variable that was never set must not turn into a full refund.
      expect(
        problems('refund', { transactionId: TX, refundAmount: undefined })
      ).toEqual(['refundAmount'])
    })

    it('refuses a field it does not know, such as a misspelled amount', () => {
      expect(
        problemsOf('refund', { transactionId: TX, refundAmout: 10 })
      ).toEqual(['refundAmout'])
      expect(
        problemsOf('refund', {
          transactionId: TX,
          refundAmount: 10,
          reason: 'x'
        })
      ).toEqual(['reason'])
    })

    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, '10', null])(
      'refuses an amount of %j',
      refundAmount => {
        expect(
          problemsOf('refund', { transactionId: TX, refundAmount })
        ).toEqual(['refundAmount'])
      }
    )

    it('tells reconcile of a full refund without an amount at all', () => {
      expect(
        operations.refund.reconcileFields?.({ transactionId: TX })
      ).toStrictEqual({ transactionId: TX })
    })

    it('takes an amount and a transaction ID, and nothing else', () => {
      expect(
        problems('refund', { transactionId: TX, refundAmount: 10 })
      ).toEqual([])
    })

    it('keeps these rules when the business rules are switched off', () => {
      // They are `invariants`, which run with `validate: false` as well.
      expect(
        invariantProblems('refund', {
          transactionId: TX,
          refundAmount: undefined
        })
      ).toEqual(['refundAmount'])
      expect(
        invariantProblems('refund', { transactionId: TX, refundAmout: 10 })
      ).toEqual(['refundAmout'])
      expect(
        invariantProblems('refund', {
          transactionId: TX,
          refundAmount: Number.NaN
        })
      ).toEqual(['refundAmount'])
      expect(invariantProblems('refund', { transactionId: TX })).toEqual([])
    })
  })

  describe('payPreapproved', () => {
    it('takes capture as a boolean only', () => {
      const input = cases.payPreapproved.input
      expect(problems('payPreapproved', { ...input, capture: false })).toEqual(
        []
      )
      for (const capture of ['false', 0, null, 'no']) {
        expect(
          problemsOf('payPreapproved', { ...input, capture }),
          String(capture)
        ).toEqual(['capture'])
      }
    })
  })

  describe('checkRegKey', () => {
    it('takes creditCardAuth as a boolean only', () => {
      expect(problems('checkRegKey', { regKey: REG_KEY })).toEqual([])
      for (const creditCardAuth of [true, false]) {
        expect(
          problems('checkRegKey', { regKey: REG_KEY, creditCardAuth })
        ).toEqual([])
      }
      for (const creditCardAuth of ['true', 1, null]) {
        expect(
          problemsOf('checkRegKey', { regKey: REG_KEY, creditCardAuth })
        ).toEqual(['creditCardAuth'])
      }
    })

    it('is a read, unless it places an authorization on the card', () => {
      const effect = (input: object) =>
        operations.checkRegKey.effectOf?.({
          regKey: REG_KEY,
          ...input
        })
      expect(effect({})).toBe('read')
      expect(effect({ creditCardAuth: false })).toBe('read')
      expect(effect({ creditCardAuth: true })).toBe('create')
      // Sent all the same, so it counts.
      expect(effect({ creditCardAuth: 'true' })).toBe('create')
      expect(effect({ creditCardAuth: 1 })).toBe('create')
    })
  })

  describe('paymentDetails: the IDs of a lookup', () => {
    const query = (input: object) => operations.paymentDetails.query?.(input)

    it('writes transaction IDs as the strings they are', () => {
      expect(query({ transactionId: [TX, '1'], orderId: ['a'] })).toEqual({
        transactionId: [TX, '1'],
        orderId: ['a']
      })
    })

    // A number would be rounded without a word, and the wrong payment looked up.
    it.each([
      ['a number', [Number('2021121300698360311')]],
      ['a short number', [123]],
      ['null', [null]],
      ['an empty string', ['']],
      ['20 digits', ['1'.repeat(20)]],
      ['letters', ['12a']],
      ['a path', ['../1']]
    ])('refuses %s as a transaction ID, checks on or off', (_name, ids) => {
      try {
        query({ transactionId: ids })
        expect.unreachable()
      } catch (error) {
        if (!isLinePayValidationError(error)) throw error
        expect(error.issues[0]?.path).toBe('transactionId[0]')
      }
    })

    it('refuses a list of IDs that is not a list', () => {
      expect(() => query({ transactionId: TX })).toThrow(/array of IDs/)
    })

    it('checks the order IDs while the checks are on', () => {
      expect(problems('paymentDetails', { orderId: ['a', ''] })).toEqual([
        'orderId[1]'
      ])
      expect(problemsOf('paymentDetails', { orderId: [5, 'a'] })).toEqual([
        'orderId[0]'
      ])
    })

    it('does not throw a URIError at a lone surrogate', async () => {
      const { fetch, calls } = scriptedFetch()
      const linePay = createLinePayClient({ ...config, fetch })
      try {
        await linePay.paymentDetails({ orderId: ['order-\ud800'] })
        expect.unreachable()
      } catch (error) {
        expect(isLinePayValidationError(error)).toBe(true)
        expect(error).toMatchObject({
          outcome: 'not-sent',
          operation: 'paymentDetails'
        })
      }
      expect(calls).toHaveLength(0)
    })
  })

  it('paymentDetails needs at least one ID', () => {
    expect(problems('paymentDetails', {})).toEqual(['transactionId'])
    expect(
      problems('paymentDetails', { transactionId: [], orderId: [] })
    ).toEqual(['transactionId'])
    expect(problems('paymentDetails', { orderId: ['a'] })).toEqual([])
    expect(
      problemsOf('paymentDetails', { orderId: ['a'], fields: 'ALL' })
    ).toEqual(['fields'])
  })

  it('accepts an order ID of exactly 100 characters, and not 101', () => {
    const charge = cases.payPreapproved.input
    expect(
      problems('request', { ...validRequest, orderId: 'x'.repeat(100) })
    ).toEqual([])
    expect(
      problems('payPreapproved', { ...charge, orderId: 'x'.repeat(100) })
    ).toEqual([])
    expect(
      problems('payPreapproved', { ...charge, orderId: 'x'.repeat(101) })
    ).toEqual(['orderId'])
  })

  it('keeps path parameters out of the query of a GET', () => {
    // The body check above returns early for GET operations.
    expect(
      operations.checkPaymentStatus.query?.({ transactionId: TX })
    ).toEqual({})
    expect(
      operations.checkRegKey.query?.({ regKey: REG_KEY, creditCardAuth: true })
    ).toEqual({ creditCardAuth: true })
  })

  it('payPreapproved validates the charge', () => {
    const bad = {
      regKey: REG_KEY,
      productName: '',
      amount: 0,
      currency: 'XXX',
      orderId: ''
    }
    expect(problemsOf('payPreapproved', bad)).toEqual([
      'productName',
      'amount',
      'currency',
      'orderId'
    ])
  })
})

describe('types', () => {
  it('every operation has an input and an output type', () => {
    // Compile-time only: breaks the build if OperationTypes drifts from the names.
    const names: (keyof OperationTypes)[] = [...OPERATION_NAMES]
    expect(names).toHaveLength(10)
  })
})
