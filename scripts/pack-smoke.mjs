// Pack the package, install the tarball into an empty project and use it the way
// a consumer would: from ESM, from CommonJS and from TypeScript. It checks what
// ends up in the tarball, not what is in the working tree.
import { execSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
if (!existsSync(join(root, 'dist', 'index.js'))) {
  console.error('dist/ is missing: run `npm run build` first.')
  process.exit(1)
}
const require = createRequire(import.meta.url)
const work = mkdtempSync(join(tmpdir(), 'line-pay-merchant-smoke-'))

const run = (command, cwd, env = {}) =>
  execSync(command, {
    cwd,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: { ...process.env, ...env }
  }).toString()

const files = {
  'esm.mjs': `
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createRequire } from 'node:module'

const esm = await import('line-pay-merchant')

const TX = '2021121300698360310'
const calls = []
const fetch = async (url, init) => {
  calls.push({ url, init })
  return new Response(
    '{"returnCode":"0000","returnMessage":"Success.","info":{"orderId":"o-1","transactionId":' + TX + ',"payInfo":[],"packages":[]}}'
  )
}
const secret = 'channel-secret'
const client = esm.createLinePayClient({ channelId: '123', channelSecretKey: secret, env: 'sandbox', fetch })
const { body, meta } = await client.confirm({ transactionId: TX, amount: 100, currency: 'TWD' })

assert.equal(body.info.transactionId, TX, 'a 19-digit ID stays exact')
assert.equal(meta.attempts, 1)
const [{ url, init }] = calls
const path = '/v4/payments/' + TX + '/confirm'
assert.equal(url, 'https://sandbox-api-pay.line.me' + path)
const expected = createHmac('sha256', secret)
  .update(secret + path + init.body + init.headers['X-LINE-Authorization-Nonce'])
  .digest('base64')
assert.equal(init.headers['X-LINE-Authorization'], expected, 'the signature matches node:crypto')
assert.equal(init.redirect, 'error')

// The same package loaded through require() is a second copy of the module.
const cjs = createRequire(import.meta.url)('line-pay-merchant')
assert.deepEqual(Object.keys(cjs).sort(), Object.keys(esm).sort(), 'both builds export the same names')
const foreign = new cjs.LinePayTimeoutError({ timeoutMs: 10 })
assert.equal(foreign instanceof esm.LinePayError, false, 'instanceof does not hold across copies')
assert.equal(esm.isLinePayError(foreign), true, 'the brand guard does')
assert.equal(esm.isLinePayTimeoutError(foreign), true)
assert.equal(foreign.message, 'LINE Pay did not respond within 10 ms', 'the init object is read')
const spoiled = new cjs.LinePayMiddlewareError({ operation: 'refund' })
assert.equal(esm.isLinePayMiddlewareError(spoiled), true)
assert.equal(esm.isLinePayError(spoiled), true)

// The classes of the bundle have the shape that was tested: a field that has no
// value is not there as undefined, and what must stay out of sight does.
for (const lib of [esm, cjs]) {
  const timeout = new lib.LinePayTimeoutError({ timeoutMs: 5 })
  assert.deepEqual(Object.keys(timeout).sort(), ['code', 'outcome', 'timeoutMs'])
  assert.equal(Object.getOwnPropertyDescriptor(timeout, 'context').enumerable, false)
  assert.equal(Object.getOwnPropertyDescriptor(timeout, 'name').enumerable, false)
  const api = new lib.LinePayApiError({ body: { returnCode: '1106', returnMessage: '' }, httpStatus: 400 })
  assert.deepEqual(Object.keys(api).sort(), ['category', 'code', 'httpStatus', 'outcome', 'returnCode', 'returnMessage'])
  assert.equal(api.message, 'LINE Pay returned 1106')
  assert.equal(Object.getOwnPropertyDescriptor(api, 'body').enumerable, false)
  assert.deepEqual(Object.keys(api.toJSON()), ['name', 'code', 'message', 'outcome', 'returnCode', 'returnMessage', 'httpStatus', 'category'])
}

assert.deepEqual(esm.parseConfirmQuery('transactionId=' + TX + '&orderId=o'), { transactionId: TX, orderId: 'o' })
assert.throws(() => esm.parseConfirmQuery('transactionId=1/../2'), esm.LinePayValidationError)

await assert.rejects(import('line-pay-merchant/dist/index.js'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
console.log('ESM ok: ' + Object.keys(esm).length + ' runtime exports')
`,
  'cjs.cjs': `
const assert = require('node:assert/strict')
const lib = require('line-pay-merchant')

const client = lib.createLinePayClient({
  channelId: '123',
  channelSecretKey: 's',
  env: 'sandbox',
  fetch: async () => new Response('{"returnCode":"1106","returnMessage":"nope"}')
})
client.confirm({ transactionId: '1', amount: 1, currency: 'TWD' }).then(
  () => assert.fail('the call should have been rejected'),
  error => {
    assert.ok(error instanceof lib.LinePayApiError)
    assert.equal(lib.isLinePayApiError(error), true)
    assert.equal(error.returnCode, '1106')
    assert.equal(error.outcome, 'rejected')
    assert.equal(lib.needsReconcile(error), false)
    console.log('CJS ok: ' + Object.keys(lib).length + ' runtime exports')
  }
)
`,
  'consumer.mts': `
import {
  type AnyLinePayError,
  autoReconcile,
  createLinePayClient,
  isLinePayApiError,
  isLinePayError,
  type LinePayClient,
  LinePayTimeoutError,
  needsReconcile,
  type ReconcileResult
} from 'line-pay-merchant'

const linePay: LinePayClient = createLinePayClient({ channelId: '1', channelSecretKey: 's', env: 'sandbox' })

export async function main(): Promise<string> {
  const { body, meta } = await linePay.confirm({ transactionId: '1', amount: 1, currency: 'TWD' })
  const id: string = body.info.transactionId
  const attempts: number = meta.attempts
  const recovered = meta.recovered?.reason

  // @ts-expect-error JPY is not a V4 currency
  await linePay.confirm({ transactionId: '1', amount: 1, currency: 'JPY' })
  // @ts-expect-error 'development' was renamed to 'sandbox'
  createLinePayClient({ channelId: '1', channelSecretKey: 's', env: 'development' })

  try {
    await linePay.refund({ transactionId: '1', refundAmount: 5 })
  } catch (error) {
    if (isLinePayApiError(error)) return error.returnCode
    if (needsReconcile(error)) {
      const result: ReconcileResult = await linePay.reconcile(error)
      if (result.status === 'applied' && result.operation === 'refund') {
        return result.body.info.refundTransactionId
      }
    }
  }
  return id + attempts + recovered
}

export const safer = linePay.with(autoReconcile({ operations: ['confirm'] }))

// The declarations keep what the classes promise: the code of each one is its own
// literal, so a switch on it narrows, and the compiler knows when one is missing.
export function describeError(error: AnyLinePayError): string {
  switch (error.code) {
    case 'LINE_PAY_VALIDATION_ERROR':
      return error.issues[0]?.path ?? ''
    case 'LINE_PAY_API_ERROR':
      return error.returnCode
    case 'LINE_PAY_HTTP_ERROR':
      return String(error.httpStatus)
    case 'LINE_PAY_NETWORK_ERROR':
      return error.reason
    case 'LINE_PAY_TIMEOUT_ERROR':
      return String(error.timeoutMs)
    case 'LINE_PAY_ABORT_ERROR':
      return String(error.abortReason)
    case 'LINE_PAY_MIDDLEWARE_ERROR':
      return error.operation ?? ''
  }
}
export const timeoutOutcome: 'unknown' = new LinePayTimeoutError({ timeoutMs: 1 }).outcome
export function narrowed(caught: unknown): string {
  return isLinePayError(caught) ? describeError(caught) : ''
}
`
}
files['consumer.cts'] = files['consumer.mts']
// The declarations come twice, for ESM (.d.ts) and for CommonJS (.d.cts). A program
// that meets both, which is what a project with dual resolution is, needs them to
// describe the same types: a `unique symbol` in either would make them differ.
files['cross.cts'] = `
export type { AnyLinePayError, LinePayClient, LinePayError, ReconcileResult } from 'line-pay-merchant'
`
files['cross.mts'] = `
import type { AnyLinePayError, LinePayClient, LinePayError, ReconcileResult } from 'line-pay-merchant'

type CjsClient = import('./cross.cjs').LinePayClient
type CjsError = import('./cross.cjs').LinePayError
type CjsAnyError = import('./cross.cjs').AnyLinePayError
type CjsResult = import('./cross.cjs').ReconcileResult

declare const esm: { client: LinePayClient; error: LinePayError; any: AnyLinePayError; result: ReconcileResult }
declare const cjs: { client: CjsClient; error: CjsError; any: CjsAnyError; result: CjsResult }

export const fromCjs = [cjs.client satisfies LinePayClient, cjs.error satisfies LinePayError, cjs.any satisfies AnyLinePayError, cjs.result satisfies ReconcileResult]
export const fromEsm = [esm.client satisfies CjsClient, esm.error satisfies CjsError, esm.any satisfies CjsAnyError, esm.result satisfies CjsResult]
`

const typeRoots = [join(root, 'node_modules', '@types')]
const tsconfig = (...entries) =>
  JSON.stringify({
    compilerOptions: {
      module: 'nodenext',
      moduleResolution: 'nodenext',
      target: 'es2023',
      lib: ['es2023'],
      types: ['node'],
      typeRoots,
      strict: true,
      skipLibCheck: false,
      noEmit: true
    },
    files: entries
  })

try {
  // The tarball that is about to be published when `PACK_TARBALL` names it (the
  // release does), otherwise one packed from the working tree.
  const given = process.env.PACK_TARBALL
  const tarball =
    given !== undefined && given !== ''
      ? resolve(given)
      : join(
          work,
          JSON.parse(
            run(`npm pack --json --pack-destination "${work}"`, root)
          )[0].filename
        )

  const app = join(work, 'app')
  mkdirSync(app)
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({ name: 'smoke', version: '0.0.0', private: true })
  )
  run(`npm install --no-audit --no-fund "${tarball}"`, app)

  const installed = readdirSync(join(app, 'node_modules')).filter(
    name => !name.startsWith('.')
  )
  if (installed.join() !== 'line-pay-merchant') {
    throw new Error(`Expected no dependencies, installed: ${installed.join()}`)
  }

  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(app, name), content)
  }
  writeFileSync(join(app, 'tsconfig.esm.json'), tsconfig('consumer.mts'))
  writeFileSync(join(app, 'tsconfig.cjs.json'), tsconfig('consumer.cts'))
  writeFileSync(
    join(app, 'tsconfig.cross.json'),
    tsconfig('cross.mts', 'cross.cts')
  )

  process.stdout.write(run('node esm.mjs', app))
  process.stdout.write(run('node cjs.cjs', app))
  const tsc = `"${process.execPath}" "${require.resolve('typescript/bin/tsc')}"`
  run(`${tsc} -p tsconfig.esm.json`, app)
  run(`${tsc} -p tsconfig.cjs.json`, app)
  run(`${tsc} -p tsconfig.cross.json`, app)
  console.log(
    'Types ok: ESM and CommonJS consumers, and the two sets of declarations agree, nodenext, skipLibCheck off'
  )

  // What the package promises in its types has no `any` in it.
  const declared = join(app, 'node_modules', 'line-pay-merchant', 'dist')
  const typescript = require('typescript')
  for (const name of readdirSync(declared).filter(n => /\.d\.c?ts$/.test(n))) {
    const file = typescript.createSourceFile(
      name,
      readFileSync(join(declared, name), 'utf8'),
      typescript.ScriptTarget.ES2023
    )
    const visit = node => {
      if (node.kind === typescript.SyntaxKind.AnyKeyword) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart(file))
        throw new Error(`${name}:${line + 1} declares an \`any\``)
      }
      typescript.forEachChild(node, visit)
    }
    visit(file)
  }
  console.log('Declarations ok: no `any` in the types of the package')

  // No file points to a source map that the package does not hold.
  for (const name of readdirSync(declared)) {
    if (!/\.(c?js|d\.c?ts)$/.test(name)) continue
    const text = readFileSync(join(declared, name), 'utf8')
    for (const match of text.matchAll(/^\/\/# sourceMappingURL=(.+)$/gm)) {
      const target = (match[1] ?? '').trim()
      if (!existsSync(join(declared, target))) {
        throw new Error(
          `${name} points to ${target}, which is not in the package`
        )
      }
    }
  }
  console.log('Source maps ok: every reference names a file of the package')
} finally {
  rmSync(work, { recursive: true, force: true })
}
