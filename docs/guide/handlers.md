# Handlers

Handler functions are functions that have access to the API type, the request configuration, the response body, and the next handler function in the API calling flow.

## Custom Handler

You can build your own handlers to access the request configuration and the response body.

Add your first handler:
```js
// create client
const refundClient = linePayClient.refund

async function myHandler({ req, next }) {
  // do something before sending request
  const res = await next(req)
  // do something with response body
  return res
}

// add handler
refundClient.addHandler(myHandler)

// send request
const res = await refundClient.send({
  transactionId: '2021120900898162210',
  body: {
    refundAmount: 20
  }
})
```

Method chaining is also supported:
```js
async function myHandler1({ req, next }) {
  // do something before sending request
  const res = await next(req)
  // do something with response body
  return res
}

async function myHandler2({ req, next }) {
  // do something before sending request
  const res = await next(req)
  // do something with response body
  return res
}

// create client
const refundClient = await linePayClient
  .refund
  .addHandler(myHandler1)
  .addHandler(myHandler2)
  .send({
    transactionId: '2021120900898162210',
    body: {
      refundAmount: 20
    }
  })
```

The handler added first will be executed later：
```js
const res = await linePayClient
  .refund
  .addHandler(async ({ req, next }) => {
    console.log('before inner handler')
    const result = await next(req)
    console.log('after inner handler')
    return result
  })
  .addHandler(async ({ req, next }) => {
    console.log('before outer handler')
    const result = await next(req)
    const result2 = await next(req)
    console.log('after outer handler')
    return result2
  })
  .send({
    transactionId: '2021120900898162210',
    body: {
      refundAmount: 20
    }
  })

// Output:
// before outer handler
// before inner handler
// after inner handler
// before inner handler
// after inner handler
// after outer handler
```

## Built-in Handler

In the real world, there are plenty of reasons like unstable networks, sending data with the wrong format, or an unresponsive server that can cause underlying APIs to throw errors.
To make our application stable, we need to deal with errors when encountering those unexpected circumstances.
This library provides some built-in handlers to help developers handle errors more easily.

```js
import {
  createLinePayClient,
  createTimeoutRetryHandler,
  createPaymentDetailsRecoveryHandler,
  paymentDetailsToConfirm,
  LinePayApiError,
  HttpError,
  TimeoutError
} from 'line-pay-merchant'

const linePayClient = createLinePayClient(config)

async function confirm() {
  try {
    const res = await linePayClient.confirm
      .addHandler(createTimeoutRetryHandler())
      .addHandler(createPaymentDetailsRecoveryHandler(paymentDetailsToConfirm))
      .send({
        transactionId: '2021121300698360310',
        body: {
          currency: 'TWD',
          amount: 1000
        }
      })

    console.log('res = ', JSON.stringify(res, null, 2))
  } catch (e) {
    if (e instanceof LinePayApiError) {
      console.log('LinePayApiError = ', e)
    } else if (e instanceof HttpError) {
      console.log('HttpError = ', e)
    } else if (e instanceof TimeoutError) {
      console.log('TimeoutError = ', e)
    }
  }
}
```
