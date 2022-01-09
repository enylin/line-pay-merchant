# Expire RegKey API

## Overview

An API to expire issued RegKey

## Signature

```ts
send(req: ExpireRegKeyRequestConfig): Promise<ApiResponse<ExpireRegKeyResponseBody>>
```

## Request Config

@[code{5-16} ts](@/line-pay-api/expire-regkey.ts)

## Response Body

@[code{18-18} ts](@/line-pay-api/expire-regkey.ts)

## Return Code

### Success

Code | Description
:----:|:------------------------
0000 | Success


### Error

Code | Description
:----:|:------------------------
1104 | Non-existing merchant
1105 | The merchant cannot use the LINE Pay.
1106 | A header information error
1190 | The regKey does not exist
1193 | The regKey has been expired

## Example

### Request
```ts
const res = await linePayClient.expireRegKey.send({
  regKey: 'RK9D2BA19XTFQWC'
})
```

### Response
```json
{
  "body": {
    "returnCode": "0000",
    "returnMessage": "Success.",
  },
  "comments": {}
}
```