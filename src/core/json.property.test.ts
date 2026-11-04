import { execFileSync } from 'node:child_process'

import { describe, expect, it } from 'vitest'

import {
  createRandom,
  HOSTILE_CHARS,
  type Random,
  seedOf
} from '../test/random'
import { isArray, isRecord } from './guard'
import { parseLossless } from './json'

/**
 * Property-based tests of parseLossless against two oracles that do not use a
 * reviver:
 *
 * - a model: the generator knows every number token it wrote, so it knows the
 *   value that has to come back;
 * - a tokenizer that quotes the big integers of the raw text before a plain
 *   `JSON.parse`.
 *
 * The rule under test (json.ts): every number whose value is an integer outside
 * the safe range comes back as its exact source text; everything else is what
 * `JSON.parse` returns.
 */

/**
 * Node.js 24.21.0 (V8 13.6.233.17-node.53) has a bug in `JSON.parse`: once a key
 * `\` has been parsed, a key of one character that is written as an escape
 * (`"\u0000"`, `"\""`, `"\n"`) can come back as `\`. A plain `JSON.parse` does
 * it too, so it is not `parseLossless` that differs, and no key of LINE Pay is
 * one character long. The engine has the fix from 24.22. On an engine like that
 * no oracle can say which of two parses of one text went wrong, so the
 * documents with such a key are left out of the comparisons.
 *
 * Whether the bug shows depends on what the engine has parsed before, so a
 * probe in this process says nothing (it passes inside a worker of the test
 * runner on the very engine that fails). A fresh process is asked instead.
 */
const PROBE = String.raw`
JSON.parse('{"\\\\":0}')
const wrong = [
  ['{"\\u0000":0}', '\u0000'],
  ['{"\\"":0}', '"'],
  ['{"\\u2028":0}', '\u2028'],
  ['{"\\n":0}', '\n']
].filter(([text, key]) => Object.keys(JSON.parse(text))[0] !== key)
process.stdout.write(wrong.length === 0 ? 'ok' : 'wrong')
`

const ENGINE_DECODES_ESCAPED_KEYS =
  execFileSync(process.execPath, ['-e', PROBE], {
    encoding: 'utf8',
    timeout: 20_000
  }) === 'ok'

/** A key of one character written as one escape: `"\u0000":`, `"\"":`, `"\n":`. */
const ONE_ESCAPED_CHAR_KEY = /"\\(?:u[\dA-Fa-f]{4}|["\\/bfnrt])"\s*:/

/** Whether the keys of this document can be compared on this engine. */
function comparable(text: string): boolean {
  return ENGINE_DECODES_ESCAPED_KEYS || !ONE_ESCAPED_CHAR_KEY.test(text)
}

type Node =
  | { kind: 'number'; token: string }
  | { kind: 'string'; value: string }
  | { kind: 'literal'; value: true | false | null }
  | { kind: 'array'; items: Node[] }
  | { kind: 'object'; entries: [string, Node][] }

const BOUNDARY_TOKENS = [
  '0',
  '-0',
  '9007199254740991', // 2^53 - 1, the largest safe integer
  '9007199254740992', // 2^53: not safe, 2^53 + 1 parses to the same double
  '9007199254740993',
  '-9007199254740991',
  '-9007199254740992',
  '2021121300698360310', // a real 19-digit transaction ID
  '9999999999999999999',
  '18446744073709551615',
  '9007199254740993.0', // an integer value written as a decimal
  '12345678901234567.89', // rounds to an integer double
  '1e15',
  '1e16',
  '1E+20',
  '-1.5e300',
  '1e400', // Infinity
  '-1e400',
  '1e-400', // 0
  '0.1',
  '-0.0',
  '5e-324'
]

const KEYS = [
  '',
  'a',
  'transactionId',
  'refundTransactionId',
  '__proto__',
  'constructor',
  'toString',
  'hasOwnProperty',
  '0',
  '1',
  '10',
  '-1',
  '01',
  '1e3',
  '1.5',
  '4294967294',
  '4294967295',
  '9007199254740993',
  '2021121300698360310',
  'é',
  '\u0000',
  '"',
  '\\',
  ' ',
  ' '
]

const WHITESPACE = ['', '', '', ' ', '\t', '\n', '\r', '\r\n', '  \n\t ']

function digitRun(random: Random, length: number): string {
  let out = String(random.int(1, 9))
  for (let i = 1; i < length; i++) out += String(random.int(0, 9))
  return out
}

function numberToken(random: Random): string {
  const sign = random.bool(0.3) ? '-' : ''
  switch (random.int(0, 5)) {
    case 0:
      return random.pick(BOUNDARY_TOKENS)
    case 1:
    case 2: {
      // an integer of random length, from 1 to 25 digits
      const length = random.int(1, 25)
      return (
        sign +
        (length === 1 ? String(random.int(0, 9)) : digitRun(random, length))
      )
    }
    case 3: {
      const whole = random.bool(0.2) ? '0' : digitRun(random, random.int(1, 20))
      return `${sign}${whole}.${String(random.int(0, 9)).repeat(random.int(1, 3))}${digitRun(random, random.int(1, 6))}`
    }
    case 4: {
      const mantissa = random.bool()
        ? digitRun(random, random.int(1, 4))
        : `${random.int(0, 9)}.${digitRun(random, random.int(1, 4))}`
      const exponentSign = random.pick(['', '+', '-'])
      return `${sign}${mantissa}${random.pick(['e', 'E'])}${exponentSign}${random.int(0, 330)}`
    }
    default:
      return sign + String(random.int(0, 9_007_199_254_740_991))
  }
}

function stringValue(random: Random): string {
  if (random.bool(0.2)) return numberToken(random) // digits inside a string stay a string
  return random.string([...HOSTILE_CHARS, '\uD83D', '\uDE00'], 0, 8) // lone surrogates too
}

function generate(random: Random, depth: number): Node {
  const roll = random.int(0, depth >= 4 ? 5 : 9)
  if (roll <= 2) return { kind: 'number', token: numberToken(random) }
  if (roll === 3) return { kind: 'string', value: stringValue(random) }
  if (roll === 4)
    return { kind: 'literal', value: random.pick([true, false, null]) }
  if (roll === 5) return { kind: 'number', token: numberToken(random) }
  if (roll <= 7) {
    const items: Node[] = []
    for (let i = random.int(0, 5); i > 0; i--)
      items.push(generate(random, depth + 1))
    return { kind: 'array', items }
  }
  const entries: [string, Node][] = []
  for (let i = random.int(0, 5); i > 0; i--) {
    const key = random.bool(0.8) ? random.pick(KEYS) : stringValue(random)
    entries.push([key, generate(random, depth + 1)])
  }
  return { kind: 'object', entries }
}

/** JSON string literal with randomly chosen escapes, written by hand. */
function quote(random: Random, value: string): string {
  let out = '"'
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i)
    const ch = value.charAt(i)
    const mustEscape =
      unit < 0x20 ||
      ch === '"' ||
      ch === '\\' ||
      (unit >= 0xd800 && unit <= 0xdfff)
    if (!mustEscape && random.bool(0.85)) {
      out += ch
    } else if (ch === '"' || ch === '\\') {
      out += random.bool()
        ? `\\${ch}`
        : `\\u${unit.toString(16).padStart(4, '0')}`
    } else if (ch === '\n' && random.bool()) {
      out += '\\n'
    } else {
      const hex = unit.toString(16).padStart(4, '0')
      out += `\\u${random.bool() ? hex : hex.toUpperCase()}`
    }
  }
  return out + '"'
}

function serialize(random: Random, node: Node): string {
  const ws = () => random.pick(WHITESPACE)
  switch (node.kind) {
    case 'number':
      return node.token
    case 'string':
      return quote(random, node.value)
    case 'literal':
      return String(node.value)
    case 'array':
      return `[${ws()}${node.items.map(item => serialize(random, item)).join(`${ws()},${ws()}`)}${ws()}]`
    case 'object':
      return `{${ws()}${node.entries
        .map(
          ([key, value]) =>
            `${quote(random, key)}${ws()}:${ws()}${serialize(random, value)}`
        )
        .join(`${ws()},${ws()}`)}${ws()}}`
  }
}

/** Oracle 1: the value the model says must come back. */
function expectedOf(node: Node): unknown {
  switch (node.kind) {
    case 'number': {
      const value = Number(node.token)
      return Number.isInteger(value) && !Number.isSafeInteger(value)
        ? node.token
        : value
    }
    case 'string':
    case 'literal':
      return node.value
    case 'array':
      return node.items.map(expectedOf)
    case 'object': {
      const object: Record<string, unknown> = {}
      for (const [key, value] of node.entries) {
        // A data property, like JSON.parse creates: `__proto__` stays a key, and a
        // repeated key keeps its first position and takes the last value.
        Object.defineProperty(object, key, {
          value: expectedOf(value),
          writable: true,
          enumerable: true,
          configurable: true
        })
      }
      return object
    }
  }
}

const NUMBER_AT = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y

/** Oracle 2: quote the big integers in the raw text, then a plain JSON.parse. */
function tokenizerOracle(text: string): unknown {
  let out = ''
  let i = 0
  while (i < text.length) {
    const ch = text.charAt(i)
    if (ch === '"') {
      let j = i + 1
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (ch === '-' || (ch >= '0' && ch <= '9')) {
      NUMBER_AT.lastIndex = i
      const token = NUMBER_AT.exec(text)?.[0] ?? ch
      const value = Number(token)
      out +=
        Number.isInteger(value) && !Number.isSafeInteger(value)
          ? `"${token}"`
          : token
      i += token.length
    } else {
      out += ch
      i += 1
    }
  }
  return JSON.parse(out)
}

/** A canonical text of a parsed value: types, key order, -0 and prototypes included. */
function canon(value: unknown): string {
  if (value === null) return 'null'
  if (isArray(value)) {
    const extra = Object.getOwnPropertyNames(value).length - value.length - 1
    return `[${value.map(canon).join(',')}]${extra === 0 ? '' : '+extra'}`
  }
  switch (typeof value) {
    case 'number':
      return Object.is(value, -0) ? 'n:-0' : `n:${value}`
    case 'string':
      return `s:${JSON.stringify(value)}`
    case 'boolean':
      return `b:${value}`
    case 'object': {
      const proto =
        Object.getPrototypeOf(value) === Object.prototype ? '' : 'PROTO!'
      const keys = Object.keys(value)
      const hidden =
        Object.getOwnPropertyNames(value).length === keys.length
          ? ''
          : 'HIDDEN!'
      const body = keys
        .map(
          key =>
            `${JSON.stringify(key)}:${canon(Object.getOwnPropertyDescriptor(value, key)?.value)}`
        )
        .join(',')
      return `${proto}${hidden}{${body}}`
    }
    default:
      return `?${typeof value}`
  }
}

describe('parseLossless: property-based', () => {
  it('agrees with the model and with a tokenizer oracle on random documents', () => {
    const random = createRandom(seedOf(0x15_0e_55))
    for (let i = 0; i < 1500; i++) {
      const document = generate(random, 0)
      const text =
        random.pick(WHITESPACE) +
        serialize(random, document) +
        random.pick(WHITESPACE)
      const where = `seed=${random.seed} case=${i} text=${JSON.stringify(text)}`
      if (!comparable(text)) continue

      const actual = canon(parseLossless(text))
      expect(actual, where).toBe(canon(expectedOf(document)))
      expect(actual, where).toBe(canon(tokenizerOracle(text)))
    }
  })

  it('never changes a value JSON.parse already gets right', () => {
    const random = createRandom(seedOf(0x5afe))
    for (let i = 0; i < 1500; i++) {
      const document = generate(random, 0)
      const text = serialize(random, document)
      if (!comparable(text)) continue
      const plain: unknown = JSON.parse(text)
      const lossless = parseLossless(text)
      // Same structure; only unsafe integers differ, and only by type.
      const walk = (a: unknown, b: unknown, path: string): void => {
        if (typeof a === 'number' && typeof b === 'string') {
          expect(Number.isInteger(a) && !Number.isSafeInteger(a), path).toBe(
            true
          )
          expect(Number(b), path).toBe(a)
          return
        }
        if (typeof a !== 'object' || a === null) {
          expect(Object.is(a, b), `${path}: ${String(a)} vs ${String(b)}`).toBe(
            true
          )
          return
        }
        if (typeof b !== 'object' || b === null) {
          expect.unreachable(`${path}: expected an object, got ${String(b)}`)
        }
        expect(Object.keys(b), path).toEqual(Object.keys(a))
        for (const key of Object.keys(a)) {
          walk(
            Object.getOwnPropertyDescriptor(a, key)?.value,
            Object.getOwnPropertyDescriptor(b, key)?.value,
            `${path}.${key}`
          )
        }
      }
      walk(plain, lossless, `seed=${random.seed} case=${i}`)
    }
  })

  it('throws a SyntaxError exactly when JSON.parse does, on corrupted documents', () => {
    const random = createRandom(seedOf(0xbad_150))
    const junk = [
      ...'{}[],:"\\-+.eE0123456789 tfnux',
      '\u0000',
      ' ',
      'NaN',
      'Infinity',
      "'"
    ]
    for (let i = 0; i < 1500; i++) {
      let text = serialize(random, generate(random, 0))
      for (let edits = random.int(1, 3); edits > 0; edits--) {
        const at = random.int(0, text.length)
        const roll = random.int(0, 2)
        if (roll === 0)
          text = text.slice(0, at) + random.pick(junk) + text.slice(at)
        else if (roll === 1) text = text.slice(0, at) + text.slice(at + 1)
        else text = text.slice(0, at)
      }
      const where = `seed=${random.seed} case=${i} text=${JSON.stringify(text)}`
      let plainError: unknown
      try {
        JSON.parse(text)
      } catch (error) {
        plainError = error
      }
      if (plainError === undefined) {
        if (comparable(text)) {
          expect(canon(parseLossless(text)), where).toBe(
            canon(tokenizerOracle(text))
          )
        }
      } else {
        expect(() => parseLossless(text), where).toThrow(SyntaxError)
      }
    }
  })

  it('keeps the boundary of the safe range exact', () => {
    // 2^53 is not a safe integer: 9007199254740993 parses to it as well, so the
    // value cannot tell which one was sent.
    expect(parseLossless('9007199254740992')).toBe('9007199254740992')
    expect(parseLossless('-9007199254740992')).toBe('-9007199254740992')
    expect(parseLossless('9007199254740991')).toBe(9_007_199_254_740_991)
    expect(parseLossless('-9007199254740991')).toBe(-9_007_199_254_740_991)
    expect(Object.is(parseLossless('-0'), -0)).toBe(true)
    expect(parseLossless('1e400')).toBe(Number.POSITIVE_INFINITY)
  })

  it('never lets a __proto__ key change the prototype', () => {
    const parsed = parseLossless(
      '{"__proto__":{"polluted":2021121300698360310},"a":[{"__proto__":null}]}'
    )
    if (!isRecord(parsed)) expect.unreachable('an object was expected')
    expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype)
    expect(Object.keys(parsed)).toEqual(['__proto__', 'a'])
    expect(Object.getOwnPropertyDescriptor(parsed, '__proto__')?.value).toEqual(
      {
        polluted: '2021121300698360310'
      }
    )
    expect(Reflect.get({}, 'polluted')).toBeUndefined()
  })
})
