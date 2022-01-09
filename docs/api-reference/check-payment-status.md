# Check Payment Status API

## Overview

An API to check payment request status of LINE Pay. The merchant should regularly check user payment confirm status **without using the ConfirmURL** and decide if it is possible to complete the payment.

## Signature

```ts
send(req: CheckPaymentStatusRequestConfig): Promise<ApiResponse<CheckPaymentStatusResponseBody>>
```

## Request Config

@[code{6-18} ts](@/line-pay-api/check-payment-status.ts)

## Response Body

@[code{21-44} ts](@/line-pay-api/check-payment-status.ts)

## Return Code

### Success

Code | Description
:----:|:------------------------
0000 | Before authorization
0110 | Completed authorization - Able to call the Confirm API
0121 | Payment canceled by user or because of timeout (20min). - Completed status
0122 | Payment failed - Completed status
0123 | Payment completed - Completed status

### Error

Code | Description
:----:|:------------------------
1104 | Non-existing merchant
1105 | The merchant cannot use the LINE Pay.
9000 | An internal error

## Example

### Request
```ts
const res = await linePayClient.checkPaymentStatus
  .send({
    params: {
      transactionId: '2021121600698709510'
    }
  })
```

### Response
```json
{
  "body": {
    "returnCode": "0000",
    "returnMessage": "reserved transaction."
  },
  "comments": {}
}
```
