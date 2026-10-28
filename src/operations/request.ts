import {
  type Guard,
  hasShape,
  isArray,
  isRecord,
  isString
} from '../core/guard'
import { RESPONSE_FIELDS } from '../core/response-guards'
import { amountsEqual, CURRENCIES } from '../core/validate'
import type {
  Address,
  Currency,
  LinePayResponse,
  OpenString,
  Product
} from '../types'
import type { OperationDefinition } from './define'

export interface RequestPackage {
  /** A unique ID of the package. */
  id: string
  /** `sum(products[].quantity * products[].price)` */
  amount: number
  /** Commission included in the payment amount, if any. */
  userFee?: number
  /** Name of the package or of an internal shop. */
  name?: string
  products: Product[]
}

export interface RedirectUrlsWithCallbacks {
  /** Prevents phishing when moving between apps on Android. */
  appPackageName?: string
  /** Where the user is sent after approving the payment. */
  confirmUrl: string
  /**
   * How the confirmUrl is used. `NONE` means no redirect: poll
   * `checkPaymentStatus` instead.
   *
   * V4 supports NONE to use polling without redirect callbacks.
   */
  confirmUrlType?: OpenString<'CLIENT' | 'SERVER'>
  /** Where the user is sent after cancelling on the LINE Pay page. */
  cancelUrl: string
}

/** Poll the payment request status instead of receiving redirect callbacks. */
export interface RedirectUrlsWithoutCallbacks {
  confirmUrlType: 'NONE'
  /** URLs are not used when no callback is requested. */
  confirmUrl?: never
  cancelUrl?: never
  appPackageName?: string
}

export type RedirectUrls =
  RedirectUrlsWithCallbacks | RedirectUrlsWithoutCallbacks

export interface PaymentOptions {
  /**
   * `true` authorizes and captures at confirm. `false` only authorizes, and the
   * payment has to be captured with `capture`. Not available by default: contact
   * LINE Pay to enable it.
   */
  capture?: boolean
  /** `PREAPPROVED` registers the user for payments without approval (regKey). */
  payType?: 'NORMAL' | 'PREAPPROVED'
}

export interface DisplayOptions {
  /** Language of the payment screen: `en`, `ja`, `ko`, `th`, `zh_TW` or `zh_CN`. */
  locale?: string
  /** Guide the user back to the LINE Pay browser when the confirmUrl browser differs. */
  checkConfirmUrlBrowser?: boolean
}

export interface ShippingOptions {
  /** `NO_SHIPPING`, `FIXED_ADDRESS` or `SHIPPING`. */
  type?: OpenString<'NO_SHIPPING' | 'FIXED_ADDRESS' | 'SHIPPING'>
  feeAmount?: number
  /** URL LINE Pay calls to look up the shipping method and fee. */
  feeInquiryUrl?: string
  /** `CONDITION` re-checks the fee when the address changes; `FIXED` does not. */
  feeInquiryType?: OpenString<'CONDITION' | 'FIXED'>
  address?: Address
}

export interface AddFriend {
  /** Service type of the friend list, for example `lineAt`. */
  type?: string
  idList?: string[]
}

export interface FamilyServiceOptions {
  addFriends?: AddFriend[]
}

export interface ExtraOptions {
  /** Only the first 100 characters are shown. */
  branchName?: string
  branchId?: string
}

export interface RequestPaymentOptions {
  payment?: PaymentOptions
  display?: DisplayOptions
  shipping?: ShippingOptions
  familyService?: FamilyServiceOptions
  extra?: ExtraOptions
  /**
   * Pre-approved payment registration settings added to the V4 request.
   *
   * TODO(v4-spec): the fields are unknown; the name comes from the 2025-11 entry
   * of the API change log. Kept opaque until the reference is available.
   */
  regPayRequest?: Record<string, unknown>
}

/** Fields sent in the body of the request API. */
export interface RequestPaymentInput {
  /** `sum(packages[].amount) + sum(packages[].userFee) + options.shipping.feeAmount` */
  amount: number
  currency: Currency
  /** Your unique order ID, at most 100 characters. */
  orderId: string
  packages: RequestPackage[]
  redirectUrls: RedirectUrls
  options?: RequestPaymentOptions
}

export interface RequestPaymentResponse extends LinePayResponse {
  info: {
    /** Use it to confirm, void, capture or refund the payment later. */
    transactionId: string
    /** The code entered when a code is used instead of the scanner. */
    paymentAccessToken?: string
    paymentUrl: {
      /** Opens the LINE Pay app from your app. */
      app?: string
      /** The LINE Pay payment page. In a desktop pop-up use 700 x 546 px. */
      web: string
    }
  }
}

const isRequestPaymentResponse: Guard<RequestPaymentResponse> = hasShape({
  ...RESPONSE_FIELDS,
  info: hasShape(
    {
      transactionId: isString,
      paymentUrl: hasShape({ web: isString }, { app: isString })
    },
    { paymentAccessToken: isString }
  )
})

export const requestOperation: OperationDefinition<
  RequestPaymentInput,
  RequestPaymentResponse
> = {
  method: 'POST',
  defaultTimeout: 20_000,
  effect: 'create',
  response: isRequestPaymentResponse,
  // TODO(v4-spec): confirm the path against the V4 reference.
  path: () => '/v4/payments/request',
  check(input, c) {
    c.onlyFields(
      '',
      input,
      ['amount', 'currency', 'orderId', 'packages', 'redirectUrls', 'options'],
      'a payment request'
    )
    c.positiveNumber('amount', input.amount)
    c.oneOf('currency', input.currency, CURRENCIES)
    c.nonEmptyString('orderId', input.orderId, 100)
    if (input.redirectUrls?.confirmUrlType === 'NONE') {
      if (input.redirectUrls.confirmUrl !== undefined) {
        c.fail('redirectUrls.confirmUrl', 'must be omitted for NONE')
      }
      if (input.redirectUrls.cancelUrl !== undefined) {
        c.fail('redirectUrls.cancelUrl', 'must be omitted for NONE')
      }
    } else {
      c.nonEmptyString(
        'redirectUrls.confirmUrl',
        input.redirectUrls?.confirmUrl
      )
      c.nonEmptyString('redirectUrls.cancelUrl', input.redirectUrls?.cancelUrl)
    }
    if (isRecord(input.redirectUrls)) {
      c.onlyFields(
        'redirectUrls',
        input.redirectUrls,
        ['confirmUrl', 'confirmUrlType', 'cancelUrl', 'appPackageName'],
        'the redirect URLs'
      )
    }

    // Reject undeclared nested fields before they are signed and sent.
    // The unpublished regPayRequest schema intentionally remains opaque.
    const checkFields = (
      path: string,
      value: unknown,
      allowed: readonly string[]
    ): void => {
      if (value === undefined) return
      if (!isRecord(value)) {
        c.fail(path, 'must be an object')
        return
      }
      c.onlyFields(path, value, allowed, 'the ' + path + ' object')
    }
    const options: unknown = input.options
    if (options !== undefined) {
      checkFields('options', options, [
        'payment',
        'display',
        'shipping',
        'familyService',
        'extra',
        'regPayRequest'
      ])
      if (isRecord(options)) {
        checkFields('options.display', options.display, [
          'locale',
          'checkConfirmUrlBrowser'
        ])
        checkFields('options.shipping', options.shipping, [
          'type',
          'feeAmount',
          'feeInquiryUrl',
          'feeInquiryType',
          'address'
        ])
        checkFields('options.familyService', options.familyService, [
          'addFriends'
        ])
        checkFields('options.extra', options.extra, ['branchName', 'branchId'])
        if (isRecord(options.shipping)) {
          checkFields('options.shipping.address', options.shipping.address, [
            'country',
            'postalCode',
            'state',
            'city',
            'detail',
            'optional',
            'recipient'
          ])
          if (isRecord(options.shipping.address)) {
            checkFields(
              'options.shipping.address.recipient',
              options.shipping.address.recipient,
              [
                'firstName',
                'lastName',
                'firstNameOptional',
                'lastNameOptional',
                'email',
                'phoneNo'
              ]
            )
          }
        }
        if (
          isRecord(options.familyService) &&
          isArray(options.familyService.addFriends)
        ) {
          options.familyService.addFriends.forEach((friend, index) => {
            checkFields(
              'options.familyService.addFriends[' + index + ']',
              friend,
              ['type', 'idList']
            )
          })
        }
      }
    }

    // What decides whether the payment only authorizes, or registers a regKey.
    const payment: unknown = input.options?.payment
    if (payment !== undefined) {
      if (!isRecord(payment)) {
        c.fail('options.payment', 'must be an object')
      } else {
        c.onlyFields(
          'options.payment',
          payment,
          ['capture', 'payType'],
          'the payment options'
        )
        if (payment.capture !== undefined) {
          c.boolean('options.payment.capture', payment.capture)
        }
        if (payment.payType !== undefined) {
          c.oneOf('options.payment.payType', payment.payType, [
            'NORMAL',
            'PREAPPROVED'
          ])
        }
      }
    }

    const { packages } = input
    if (!isArray(packages) || packages.length === 0) {
      c.fail('packages', 'must be a non-empty array')
      return
    }

    // These are added to the amount that has to match; only numbers may be.
    const shippingFee: unknown = input.options?.shipping?.feeAmount
    if (shippingFee !== undefined) {
      c.nonNegativeNumber('options.shipping.feeAmount', shippingFee)
    }
    let expected = typeof shippingFee === 'number' ? shippingFee : 0

    packages.forEach((pack, index) => {
      const at = `packages[${index}]`
      if (isRecord(pack)) {
        c.onlyFields(
          at,
          pack,
          ['id', 'amount', 'userFee', 'name', 'products'],
          'a package'
        )
      }
      c.nonEmptyString(`${at}.id`, pack?.id)
      c.positiveNumber(`${at}.amount`, pack?.amount)
      const userFee: unknown = pack?.userFee
      if (userFee !== undefined) c.nonNegativeNumber(`${at}.userFee`, userFee)

      const products = pack?.products
      if (!isArray(products) || products.length === 0) {
        c.fail(`${at}.products`, 'must be a non-empty array')
        return
      }
      let sum = 0
      products.forEach((product, i) => {
        if (isRecord(product)) {
          c.onlyFields(
            `${at}.products[${i}]`,
            product,
            ['id', 'name', 'imageUrl', 'quantity', 'price', 'originalPrice'],
            'a product'
          )
        }
        c.nonEmptyString(`${at}.products[${i}].name`, product?.name)
        c.positiveNumber(`${at}.products[${i}].quantity`, product?.quantity)
        c.finiteNumber(`${at}.products[${i}].price`, product?.price)
        sum += (product?.quantity ?? 0) * (product?.price ?? 0)
      })
      if (typeof pack.amount === 'number' && !amountsEqual(sum, pack.amount)) {
        c.fail(
          `${at}.amount`,
          `must equal sum(products[].quantity * products[].price), which is ${sum}`
        )
      }
      expected +=
        (typeof pack.amount === 'number' ? pack.amount : 0) +
        (typeof userFee === 'number' ? userFee : 0)
    })

    if (
      typeof input.amount === 'number' &&
      !amountsEqual(expected, input.amount)
    ) {
      c.fail(
        'amount',
        `must equal sum(packages[].amount) + sum(packages[].userFee) + options.shipping.feeAmount, which is ${expected}`
      )
    }
  },
  body: input => input
}
