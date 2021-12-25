import { LinePayApiClients } from '@/payment-api/type'
import { FormatError } from './error/format'
import { GeneralRequestConfig, GeneralResponseBody } from './type'
import { Currency, Address, Product } from './type'

/** Request */

export type Package = {
  /**
   * An unique ID of package list
   */
  id: string
  /**
   * Total amount of products per package\
   * `=sum(products[].quantity * products[].price)`
   */
  amount: number
  /**
   * User fee: Respond if a commission is found within the payment amount.
   */
  userFee?: number
  /**
   * Name of the package or name of internal shops
   */
  name?: string
  /**
   * products in the package
   */
  products: Product[]
}

export type RedirectUrls = {
  /**
   * An information to prevent phishing while transferring between apps in Android.
   */
  appPackageName?: string
  /**
   * A merchant URL user moves to after requesting the payment.
   */
  confirmUrl: string
  /**
   * A navigation type of the ConfirmURL after user approves the payment request.
   */
  confirmUrlType?: string
  /**
   * A URL that moves to the next when LINE Pay member cancels the payment from the payment page.
   */
  cancelUrl: string
}

export type Payment = {
  /**
   * Regarding automatic payment
   * - True: Processing authorization and purchase with the Confirm API at the same time
   * - False: Authorized with the Confirm API but need to purchase with the Capture API.
   *
   * Note that this field is not available by default. Users should contact LINE Pay to activate manually.
   */
  capture?: boolean
  /**
   * Payment options
   * - NORMAL
   * - PREAPPROVED
   */
  payType?: 'NORMAL' | 'PREAPPROVED'
}

export type Display = {
  /**
   * Language codes of the payment standby screen. The default language is English (en).
   * - Supported languages: en, ja, ko, th, zh_TW, zh_CN
   */
  locale?: string
  /**
   * Checking the payment browser when moving to the ConfirmURL
   * - True : Guide user to go to the LINE Pay payment request browser if payment request browser and the ConfirmURL navigation browser are different.
   * - False : Move the the ConfirmURL immediately without checking the browser
   */
  checkConfirmUrlBrowser?: boolean
}

export type Shipping = {
  /**
   * Shipping address options
   * - NO_SHIPPING
   * - FIXED_ADDRESS
   * - SHIPPING
   */
  type?: string
  /**
   * Shipping fee
   */
  feeAmount?: number
  /**
   * A URL to check shipping method
   */
  feeInquiryUrl?: string
  /**
   * Shipping fee options
   * - CONDITION : Check the shipping method (fee) when the shipping address is changed.
   * - FIXED : If fixed, not checking the shipping address even after it is changed.
   */
  feeInquiryType?: string
  /**
   * Shipping address
   */
  address?: Address
}

export type AddFriend = {
  /**
   * Service type of the friend add list
   * - lineAt
   */
  type?: string
  /**
   * A list of ID by service
   */
  idList?: string[]
}

export type FamilyService = {
  /**
   * Service type of the family service list
   */
  addFriends?: AddFriend[]
}

export type Extra = {
  /**
   * Branch Name where the payment is requested from (Only 100 letters will be displayed if it's exceeded.)
   */
  branchName?: string
  /**
   * Branch Id where the payment is requested.\
   * It can be support alphabets, numbers and special characters.
   */
  branchId?: string
}

export type Options = {
  /**
   * Payment options
   */
  payment?: Payment
  /**
   * Display options
   */
  display?: Display
  /**
   * Shipping options
   */
  shipping?: Shipping
  /**
   * Family service options
   */
  familyService?: FamilyService
  /**
   * Extra options
   */
  extra?: Extra
}

export type RequestRequestBody = {
  /**
   * Payment amount\
   * `= sum(packages[].amount) + sum(packages[].userFee) + options.shipping.feeAmount`
   */
  amount: number
  /**
   * Payment currency (ISO 4217)
   * - Supported currencies: USD, JPY, TWD, THB
   */
  currency: Currency
  /**
   * An order ID of payment request from the merchant
   * - An unique ID managed by the merchant
   */
  orderId: string
  /**
   * Package list
   */
  packages: Package[]
  /**
   * Redirect URLs
   */
  redirectUrls: RedirectUrls
  /**
   * options
   */
  options?: Options
}

export type RequestRequestConfig = GeneralRequestConfig & {
  /**
   * Request body of request API
   */
  body: RequestRequestBody
}

/** Response */

export type PaymentUrl = {
  /**
   * App URL to move to the payment page
   * - Used when payment reservation is done in the app
   * - URL to move from the merchant app to the LINE Pay.
   */
  app: string
  /**
   * 	Web URL to move to the payment page
   * - Used when payment reservation is done in the web
   * - URL to move to the LINE Pay payment standby page
   * - Move to URL that is delivered without particular parameter
   * - If opening a pop-up in the desktop, follow the size: Width: 700px, Height : 546px
   */
  web: string
}

export type Info = {
  /**
   * Transaction ID
   */
  transactionId: string
  /**
   * The code value entered when code is used instead of scanner in the LINE Pay.
   */
  paymentAccessToken: string
  /**
   * Payment URL
   */
  paymentUrl: PaymentUrl
}

export type RequestResponseBody = GeneralResponseBody & {
  /**
   * Payment information
   */
  info: Info
}

export const defaultTimeout = 20000

export const requestWithClient: LinePayApiClients['request'] =
  httpClient =>
  async ({ body, timeout }) => {
    if (!body) throw new FormatError('"body" is required')

    const { data } = await httpClient.post<
      RequestRequestBody,
      RequestResponseBody
    >('/v3/payments/request', body, {
      timeout: timeout ?? defaultTimeout
    })

    return data
  }
