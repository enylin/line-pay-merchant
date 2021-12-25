# Check RegKey API

An API to check issued RegKey status

## Signature

```ts
send(req: CheckRegKeyRequestConfig): Promise<ApiResponse<CheckRegKeyResponseBody>
```

## Request Config

@[code{5-23} ts](@/line-pay-api/check-regkey.ts)

## Response Body

@[code{25-25} ts](@/line-pay-api/check-regkey.ts)

## Return Code

### Success

Code | Description
:----:|:------------------------
0000 | Success


### Error

Code | Description
:----:|:------------------------
1101 | A purchaser status error
1102 | A purchaser status error
1104 | Nonexistent merchant
1105 | The merchant can't use LINE Pay.
1106 | Header information error
1141 | Account status error
1154 | Unavailable preapproved payment account
1190 | The regKey doesn't exist.
1193 | The regKey has expired.

## Example

### Request
```ts
const res = await linePayClient.checkRegKey
  .send({
    params: {
      regKey: 'RK9A2BA1942EQTO'
    }
  })
```

### Response
```json
{
  "body": {
    "returnCode": "0000",
    "returnMessage": "Success."
  },
  "comments": {}
}
```