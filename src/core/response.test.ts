import { describe, expect, it } from 'vitest'

import {
  isLinePayApiError,
  isLinePayHttpError,
  type LinePayApiError,
  type LinePayHttpError
} from '../errors'
import { interpretResponse } from './response'

const respond = (status: number, text: string) =>
  interpretResponse({ status, text })

function apiError(run: () => unknown): LinePayApiError {
  try {
    run()
  } catch (error) {
    if (isLinePayApiError(error)) return error
    throw error
  }
  throw new Error('expected the call to throw')
}

function httpError(run: () => unknown): LinePayHttpError {
  try {
    run()
  } catch (error) {
    if (isLinePayHttpError(error)) return error
    throw error
  }
  throw new Error('expected the call to throw')
}

describe('interpretResponse: success', () => {
  it('returns the body of a successful response', () => {
    const result = respond(
      200,
      '{"returnCode":"0000","returnMessage":"Success.","info":{"transactionId":2021121300698360310}}'
    )
    expect(result.httpStatus).toBe(200)
    expect(result.body).toEqual({
      returnCode: '0000',
      returnMessage: 'Success.',
      info: { transactionId: '2021121300698360310' }
    })
  })

  it('returns the status codes of an operation that defines them', () => {
    for (const code of ['0110', '0121', '0122', '0123']) {
      const result = interpretResponse(
        { status: 200, text: `{"returnCode":"${code}","returnMessage":"m"}` },
        { statusCodes: true }
      )
      expect(result.body.returnCode).toBe(code)
    }
  })

  it('does not take a status code for a success where none is defined', () => {
    // confirm, refund and the others answer 0000 or fail. Anything else says
    // nothing about whether the call took effect.
    for (const code of ['0110', '0121', '0001']) {
      const error = apiError(() =>
        respond(200, `{"returnCode":"${code}","returnMessage":"m"}`)
      )
      expect(isLinePayApiError(error)).toBe(true)
      expect(error).toMatchObject({
        returnCode: code,
        outcome: 'unknown',
        category: 'unclassified'
      })
    }
  })

  it('defaults a missing returnMessage to an empty string', () => {
    expect(respond(200, '{"returnCode":"0000"}').body.returnMessage).toBe('')
  })

  it('takes a returnMessage of null for a missing one', () => {
    // A server that writes every field it has, with null for the ones it has not,
    // must not make the return code unreadable.
    expect(
      respond(200, '{"returnCode":"0000","returnMessage":null}').body
        .returnMessage
    ).toBe('')
  })
})

describe('interpretResponse: a return code is not lost for want of a message', () => {
  it.each([
    [200, '1172'],
    [400, '1172'],
    [400, '1198'],
    [500, '1199'],
    [400, '1106']
  ])('keeps %s / %s whose returnMessage is null', (status, code) => {
    const error = apiError(() =>
      respond(status, `{"returnCode":"${code}","returnMessage":null}`)
    )
    expect(error).toMatchObject({
      returnCode: code,
      returnMessage: '',
      httpStatus: status
    })
  })

  it('words an error whose returnMessage is null without a trailing colon', () => {
    const error = apiError(() =>
      respond(400, '{"returnCode":"1172","returnMessage":null}')
    )
    expect(error.message).toBe('LINE Pay returned 1172')
  })

  it('still refuses a message that is something else than text or null', () => {
    for (const message of ['1', '[]', '{}', 'true']) {
      const error = httpError(() =>
        respond(400, `{"returnCode":"1172","returnMessage":${message}}`)
      )
      expect(error.reason, message).toBe('http-status')
    }
  })
})

describe('interpretResponse: LINE Pay failures', () => {
  it('throws an API error that keeps the response body', () => {
    const error = apiError(() =>
      respond(
        200,
        '{"returnCode":"2101","returnMessage":"parameter error","x":1}'
      )
    )
    expect(isLinePayApiError(error)).toBe(true)
    expect(error.returnCode).toBe('2101')
    expect(error.outcome).toBe('rejected')
    expect(error.category).toBe('unclassified')
    expect(error.body).toEqual({
      returnCode: '2101',
      returnMessage: 'parameter error',
      x: 1
    })
  })

  // LINE Pay answered, but not with "no": the call may have been booked.
  it.each([
    '1145',
    '1179',
    '1199',
    '1280',
    '1999',
    '2042',
    '9000',
    '1900',
    '1905',
    '1909'
  ])('leaves the outcome open for %s', code => {
    const error = apiError(() =>
      respond(200, `{"returnCode":"${code}","returnMessage":"m"}`)
    )
    expect(error).toMatchObject({
      category: 'unresolved',
      outcome: 'unknown',
      returnCode: code
    })
    // Whatever the status says, the answer is still not a refusal.
    for (const status of [400, 409, 500]) {
      const other = apiError(() =>
        respond(status, `{"returnCode":"${code}","returnMessage":"m"}`)
      )
      expect(other.outcome, `${code} with ${status}`).toBe('unknown')
    }
  })

  it.each(['1142', '1150', '1190', '1899', '1910', '1990', '2101'])(
    'takes %s for a refusal',
    code => {
      const error = apiError(() =>
        respond(200, `{"returnCode":"${code}","returnMessage":"m"}`)
      )
      expect(error).toMatchObject({
        category: 'unclassified',
        outcome: 'rejected'
      })
    }
  )

  it.each(['1152', '1165', '1172', '1198'])('marks %s as a duplicate', code => {
    const error = apiError(() =>
      respond(200, `{"returnCode":"${code}","returnMessage":"dup"}`)
    )
    expect(error.category).toBe('duplicate')
  })
})

// Regression A5: version 0.9 let these escape as a bare SyntaxError.
describe('interpretResponse: responses that are not from LINE Pay', () => {
  it('maps a 2xx HTML page to an invalid-response error', () => {
    const error = httpError(() =>
      respond(200, '<html><body>login</body></html>')
    )
    expect(isLinePayHttpError(error)).toBe(true)
    expect(error.reason).toBe('invalid-response')
    expect(error.outcome).toBe('unknown')
    expect(error.bodyText).toBe('<html><body>login</body></html>')
  })

  it('keeps what a 2xx response said when it is JSON but not an answer of LINE Pay', () => {
    const error = httpError(() =>
      respond(200, '{"status":"ok","id":2021121300698360310}')
    )

    expect(error.reason).toBe('invalid-response')
    expect(error.body).toEqual({ status: 'ok', id: '2021121300698360310' })
    expect(error.bodyText).toBe('{"status":"ok","id":2021121300698360310}')
  })

  it.each([
    ['empty body', ''],
    ['JSON array', '[]'],
    ['JSON string', '"ok"'],
    ['missing returnCode', '{"returnMessage":"x"}'],
    [
      'returnCode of the wrong length',
      '{"returnCode":"000","returnMessage":"x"}'
    ],
    ['returnCode that is not a string', '{"returnCode":0,"returnMessage":"x"}'],
    [
      'returnMessage that is not a string',
      '{"returnCode":"0000","returnMessage":1}'
    ]
  ])('rejects a 2xx response with %s', (_name, text) => {
    const error = httpError(() => respond(200, text))
    expect(error.reason).toBe('invalid-response')
    expect(error.outcome).toBe('unknown')
  })
})

describe('interpretResponse: HTTP status', () => {
  it('treats 5xx as unknown, because LINE Pay may have processed the call', () => {
    for (const status of [500, 502, 503, 504]) {
      const error = httpError(() => respond(status, '<html>Bad Gateway</html>'))
      expect(error.reason).toBe('http-status')
      expect(error.httpStatus).toBe(status)
      expect(error.outcome).toBe('unknown')
    }
  })

  it('does not trust a 4xx from a proxy as proof that no money moved', () => {
    for (const status of [400, 401, 403, 404, 408, 409, 429]) {
      const error = httpError(() => respond(status, ''))
      expect(error.outcome).toBe('unknown')
    }
  })

  it('keeps a parsed JSON body of an error response', () => {
    const error = httpError(() =>
      respond(503, '{"msg":"unavailable","id":2021121300698360310}')
    )
    expect(error.body).toEqual({
      msg: 'unavailable',
      id: '2021121300698360310'
    })
  })

  it('cuts the response text at 2 KB', () => {
    const error = httpError(() => respond(502, 'x'.repeat(10_000)))
    expect(error.bodyText).toHaveLength(2048)
  })

  describe('with a LINE Pay response in the body', () => {
    it('keeps the return code, so that a duplicate still leads to a lookup', () => {
      for (const [status, outcome] of [
        [400, 'unknown'],
        [409, 'unknown'],
        [500, 'unknown'],
        [503, 'unknown']
      ] as const) {
        const error = apiError(() =>
          respond(status, '{"returnCode":"1172","returnMessage":"duplicate"}')
        )
        expect(isLinePayApiError(error), String(status)).toBe(true)
        expect(error).toMatchObject({
          returnCode: '1172',
          returnMessage: 'duplicate',
          httpStatus: status,
          category: 'duplicate',
          outcome
        })
      }
    })

    it('does not turn a success or a status code into an API error', () => {
      // A body that says "fine" next to a status that says "failed" is not
      // something to trust either way.
      for (const code of ['0000', '0110']) {
        const error = httpError(() =>
          respond(500, `{"returnCode":"${code}","returnMessage":"x"}`)
        )
        expect(isLinePayHttpError(error), code).toBe(true)
        expect(error.outcome).toBe('unknown')
      }
    })

    it('stays an HTTP error when the body only looks like JSON', () => {
      for (const text of [
        '{"returnCode":1172}',
        '{"returnCode":"12"}',
        '{"message":"nope"}',
        '[]',
        'null',
        ''
      ]) {
        const error = httpError(() => respond(409, text))
        expect(isLinePayHttpError(error), text).toBe(true)
        expect(error.outcome).toBe('unknown')
      }
    })
  })

  it('does not treat a 3xx status as success', () => {
    const error = httpError(() =>
      respond(302, '{"returnCode":"0000","returnMessage":"x"}')
    )
    expect(error.reason).toBe('http-status')
  })

  // The edges of "2xx" and of "5xx": one off in either direction would turn a
  // refusal into a success, or an unknown outcome into a refusal.
  it.each([200, 201, 202, 299])('accepts the body of a %i', status => {
    const result = respond(status, '{"returnCode":"0000","returnMessage":"x"}')
    expect(result.httpStatus).toBe(status)
  })

  it.each([100, 199, 300, 301, 399])(
    'does not accept the body of a %i',
    status => {
      const error = httpError(() =>
        respond(status, '{"returnCode":"0000","returnMessage":"x"}')
      )
      expect(error.reason).toBe('http-status')
      expect(error.httpStatus).toBe(status)
    }
  )

  it.each([
    // No non-2xx response proves LINE Pay did not process the request.
    [0, 'unknown'],
    [100, 'unknown'],
    [300, 'unknown'],
    [399, 'unknown'],
    [400, 'unknown'],
    [408, 'unknown'],
    [429, 'unknown'],
    [499, 'unknown'],
    [500, 'unknown'],
    [599, 'unknown']
  ] as const)('takes a %i for %s', (status, outcome) => {
    const withoutBody = httpError(() => respond(status, ''))
    expect(withoutBody.outcome).toBe(outcome)
    const withBody = apiError(() =>
      respond(status, '{"returnCode":"2101","returnMessage":"m"}')
    )
    expect(withBody.outcome).toBe(outcome)
  })
})
