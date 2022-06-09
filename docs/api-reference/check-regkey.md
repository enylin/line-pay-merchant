# Check RegKey API

## Overview

An API to check issued RegKey status

- [`send`](#send)
- [`addHandler`](#addhandler)
- [`addHandlers`](#addhandlers)

## send

```js:no-line-numbers
send(checkRegKeyRequestConfig)
```

Returns `Promise<ApiResponse<CheckRegKeyResponseBody>>`

### Request Config

@[code{5-23} ts](@/line-pay-api/check-regkey.ts)

### Response Body

@[code{25-25} ts](@/line-pay-api/check-regkey.ts)

### Return Code

#### Success

Code | Description
:----:|:------------------------
0000 | Success


#### Error

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

### Example

#### Request
```ts
const res = await linePayClient.checkRegKey
  .send({
    regKey: 'RK9A2BA1942EQTO',
    params: {}
  })
```

#### Response
```json
{
  "body": {
    "returnCode": "0000",
    "returnMessage": "Success."
  },
  "comments": {}
}
```

## addHandler

```js:no-line-numbers
addHandler(handler)
```

Returns `CheckRegKeyClient`

Example:
```js
client.addHandler(({ type, req, next, httpClient }) => {
  console.log(type) // checkRegKey
  return next(req)
})
```

## addHandlers

```js:no-line-numbers
addHandlers(...handlers)
```

Returns `CheckRegKeyClient`

Example:
```js
client.addHandlers(
  ({ req, next }) => next(req),
  ({ req, next }) => next(req),
  ({ req, next }) => next(req)
)
```
