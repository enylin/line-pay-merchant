/**
 * Payment currency (ISO 4217).
 *
 * TODO(v4-spec): `JPY` was removed because LINE Pay Japan ended on 2025-04-30 and
 * the sources this was written from list USD, TWD and THB for V4. Verify against
 * the official reference, which was not available.
 */
export type Currency = 'USD' | 'TWD' | 'THB'

/** A string union that still accepts values this library does not know yet. */
export type OpenString<T extends string> = T | (string & Record<never, never>)

/** Fields every LINE Pay response carries. */
export interface LinePayResponse {
  /** `0000` on success. Other codes that start with `0` are status codes. */
  returnCode: string
  returnMessage: string
}

export interface Product {
  /** ID of the product in the merchant's system. */
  id?: string
  name: string
  imageUrl?: string
  quantity: number
  /** Price of one unit. */
  price: number
  originalPrice?: number
}

export interface Recipient {
  firstName?: string
  lastName?: string
  firstNameOptional?: string
  lastNameOptional?: string
  email?: string
  phoneNo?: string
}

export interface Address {
  country?: string
  postalCode?: string
  state?: string
  city?: string
  detail?: string
  optional?: string
  recipient?: Recipient
}

export type PayMethod = OpenString<'CREDIT_CARD' | 'BALANCE' | 'DISCOUNT'>

/** One payment method used for a payment. */
export interface PayInfo {
  method: PayMethod
  amount: number
  /** Nickname of the credit card (pre-approved payment only). */
  creditCardNickname?: string
  /** `VISA`, `MASTER`, `AMEX`, `DINERS` or `JCB` (pre-approved payment only). */
  creditCardBrand?: string
  /** For example `**** **** **** 1234`. Taiwan merchants only, on request. */
  maskedCreditCardNumber?: string
}

/** Shipping chosen by the user, as returned after the payment was approved. */
export interface SelectedShipping {
  methodId: string
  feeAmount: number
  address?: Address
}

/** A package in a response. Confirm omits `products`; payment details has them. */
export interface ResponsePackage {
  id: string
  name?: string
  /** `sum(products[].quantity * products[].price)` */
  amount: number
  userFeeAmount?: number
  products?: Product[]
}

/**
 * Electronic Payment Institution information added to responses of the V4 API.
 *
 * V4 identifies a payment provider by a string, usually TSP or EPI.
 * Unknown future strings are permitted for forward compatibility.
 */
export type PaymentProvider = OpenString<'TSP' | 'EPI'>
