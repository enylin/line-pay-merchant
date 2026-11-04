import type {
  Address,
  PayInfo,
  PaymentProvider,
  Product,
  Recipient,
  ResponsePackage,
  SelectedShipping
} from '../types'
import { type Guard, hasShape, isListOf, isNumber, isString } from './guard'

/**
 * The guards of the pieces that LINE Pay responses are made of. A guard checks
 * every field its interface declares: the ones that are always there must be there
 * with the right type, and the others must have the right type when they are.
 * That is what lets a response be given its type without a type assertion.
 */

/** The two fields every response carries. */
export const RESPONSE_FIELDS = {
  returnCode: isString,
  returnMessage: isString
}

export const isRecipient: Guard<Recipient> = hasShape(
  {},
  {
    firstName: isString,
    lastName: isString,
    firstNameOptional: isString,
    lastNameOptional: isString,
    email: isString,
    phoneNo: isString
  }
)

export const isAddress: Guard<Address> = hasShape(
  {},
  {
    country: isString,
    postalCode: isString,
    state: isString,
    city: isString,
    detail: isString,
    optional: isString,
    recipient: isRecipient
  }
)

export const isProduct: Guard<Product> = hasShape(
  { name: isString, quantity: isNumber, price: isNumber },
  { id: isString, imageUrl: isString, originalPrice: isNumber }
)

export const isPayInfo: Guard<PayInfo> = hasShape(
  { method: isString, amount: isNumber },
  {
    creditCardNickname: isString,
    creditCardBrand: isString,
    maskedCreditCardNumber: isString
  }
)

export const isSelectedShipping: Guard<SelectedShipping> = hasShape(
  { methodId: isString, feeAmount: isNumber },
  { address: isAddress }
)

export const isResponsePackage: Guard<ResponsePackage> = hasShape(
  { id: isString, amount: isNumber },
  { name: isString, userFeeAmount: isNumber, products: isListOf(isProduct) }
)

/** V4 sends "TSP" or "EPI" as a string, not an object. */
export const isPaymentProvider: Guard<PaymentProvider> = isString
