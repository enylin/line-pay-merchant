import {
  type CaptureInput,
  captureOperation,
  type CaptureResponse
} from './capture'
import {
  type CheckPaymentStatusInput,
  checkPaymentStatusOperation,
  type CheckPaymentStatusResponse
} from './check-payment-status'
import {
  type CheckRegKeyInput,
  checkRegKeyOperation,
  type CheckRegKeyResponse
} from './check-regkey'
import {
  type ConfirmInput,
  confirmOperation,
  type ConfirmResponse
} from './confirm'
import type { OperationDefinition } from './define'
import {
  type ExpireRegKeyInput,
  expireRegKeyOperation,
  type ExpireRegKeyResponse
} from './expire-regkey'
import type { OperationName } from './names'
import {
  type PayPreapprovedInput,
  payPreapprovedOperation,
  type PayPreapprovedResponse
} from './pay-preapproved'
import {
  type PaymentDetailsInput,
  paymentDetailsOperation,
  type PaymentDetailsResponse
} from './payment-details'
import {
  type RefundInput,
  refundOperation,
  type RefundResponse
} from './refund'
import {
  requestOperation,
  type RequestPaymentInput,
  type RequestPaymentResponse
} from './request'
import { type VoidInput, voidOperation, type VoidResponse } from './void'

/** Input and response type of every operation, keyed by operation name. */
export interface OperationTypes {
  request: { input: RequestPaymentInput; output: RequestPaymentResponse }
  confirm: { input: ConfirmInput; output: ConfirmResponse }
  capture: { input: CaptureInput; output: CaptureResponse }
  void: { input: VoidInput; output: VoidResponse }
  refund: { input: RefundInput; output: RefundResponse }
  paymentDetails: { input: PaymentDetailsInput; output: PaymentDetailsResponse }
  checkPaymentStatus: {
    input: CheckPaymentStatusInput
    output: CheckPaymentStatusResponse
  }
  checkRegKey: { input: CheckRegKeyInput; output: CheckRegKeyResponse }
  payPreapproved: { input: PayPreapprovedInput; output: PayPreapprovedResponse }
  expireRegKey: { input: ExpireRegKeyInput; output: ExpireRegKeyResponse }
}

export type OperationInput<K extends OperationName> = OperationTypes[K]['input']
export type OperationOutput<K extends OperationName> =
  OperationTypes[K]['output']

/** Union of every operation's input, tagged by name: narrow with `operation`. */
export type AnyOperationInput = {
  [K in OperationName]: OperationInput<K>
}[OperationName]

export const operations: {
  [K in OperationName]: OperationDefinition<
    OperationInput<K>,
    OperationOutput<K>
  >
} = {
  request: requestOperation,
  confirm: confirmOperation,
  capture: captureOperation,
  void: voidOperation,
  refund: refundOperation,
  paymentDetails: paymentDetailsOperation,
  checkPaymentStatus: checkPaymentStatusOperation,
  checkRegKey: checkRegKeyOperation,
  payPreapproved: payPreapprovedOperation,
  expireRegKey: expireRegKeyOperation
}

export type { CaptureInput, CaptureOptions, CaptureResponse } from './capture'
export type {
  CheckPaymentStatusInput,
  CheckPaymentStatusResponse
} from './check-payment-status'
export type { CheckRegKeyInput, CheckRegKeyResponse } from './check-regkey'
export type { ConfirmInput, ConfirmResponse } from './confirm'
export type { ExpireRegKeyInput, ExpireRegKeyResponse } from './expire-regkey'
export type {
  PayPreapprovedInput,
  PayPreapprovedResponse
} from './pay-preapproved'
export type {
  PaymentDetailsInfo,
  PaymentDetailsInput,
  PaymentDetailsResponse,
  PromotionEvent,
  RefundEntry
} from './payment-details'
export type { RefundInput, RefundResponse } from './refund'
export type {
  AddFriend,
  DisplayOptions,
  ExtraOptions,
  FamilyServiceOptions,
  PaymentOptions,
  RedirectUrls,
  RedirectUrlsWithCallbacks,
  RedirectUrlsWithoutCallbacks,
  RequestPackage,
  RequestPaymentInput,
  RequestPaymentOptions,
  RequestPaymentResponse,
  ShippingOptions
} from './request'
export type { VoidInput, VoidResponse } from './void'
