// Fails when `any` is in the code. ESLint bans the keyword and the unsafe uses of
// an `any` that comes from somewhere else (`no-explicit-any`, `no-unsafe-*`); this
// looks at what the compiler has worked out, which ESLint does not:
//
// 1. the keyword `any`, in every TypeScript file of the three programs (library,
//    tests, examples, documentation config) and in the TypeScript of the Markdown;
// 2. a variable, a parameter, a property or a function result whose type is `any`
//    or holds one (`any[]`, `Promise<any>`, `Set<any>`), written or inferred. An
//    `any` that the standard library hands out (`JSON.parse`, `Array.isArray`) is
//    fine for as long as it is turned into `unknown` before it is kept in a name.
//
// The files of `tolerated` are checked for the keyword only: they work with a
// framework whose own types spell `any` (the handlers of Express).
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const programs = [
  'tsconfig.json',
  'examples/tsconfig.json',
  'docs/tsconfig.json'
]
const tolerated = new Set(['examples/express.ts'])
const skipped = new Set([
  'node_modules',
  '.git',
  'dist',
  'coverage',
  'cache',
  'api'
])

const problems = []
const report = (file, line, message) =>
  problems.push(`${file}:${line}  ${message}`)

function check(configFile) {
  const parsed = ts.getParsedCommandLineOfConfigFile(
    join(root, configFile),
    {},
    {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: diagnostic => {
        throw new Error(
          ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')
        )
      }
    }
  )
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options
  })
  const checker = program.getTypeChecker()

  const holdsAny = (type, seen = new Set()) => {
    if (type === undefined || seen.has(type) || seen.size > 40) return false
    seen.add(type)
    if (type.flags & ts.TypeFlags.Any) return true
    if (type.isUnionOrIntersection()) {
      return type.types.some(member => holdsAny(member, seen))
    }
    if (
      type.flags & ts.TypeFlags.Object &&
      type.objectFlags & ts.ObjectFlags.Reference
    ) {
      return checker.getTypeArguments(type).some(arg => holdsAny(arg, seen))
    }
    return false
  }

  for (const file of program.getSourceFiles()) {
    if (file.isDeclarationFile || file.fileName.includes('/node_modules/')) {
      continue
    }
    const name = relative(root, file.fileName)
    const keywordOnly = tolerated.has(name)
    const lineOf = node =>
      file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1

    const visit = node => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        report(name, lineOf(node), 'the keyword `any`')
      }
      if (!keywordOnly) {
        const declares =
          ts.isVariableDeclaration(node) ||
          ts.isParameter(node) ||
          ts.isPropertyDeclaration(node) ||
          ts.isPropertySignature(node) ||
          ts.isBindingElement(node)
        if (
          declares &&
          holdsAny(checker.getTypeAtLocation(node.name ?? node))
        ) {
          report(
            name,
            lineOf(node),
            `\`${node.getText(file).split('\n')[0].slice(0, 60)}\` is, or holds, an \`any\`: ${checker.typeToString(checker.getTypeAtLocation(node.name ?? node))}`
          )
        }
        if (ts.isFunctionLike(node) && node.body !== undefined) {
          const signature = checker.getSignatureFromDeclaration(node)
          if (
            signature !== undefined &&
            holdsAny(checker.getReturnTypeOfSignature(signature))
          ) {
            report(name, lineOf(node), 'a function that returns an `any`')
          }
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
}

for (const configFile of programs) check(configFile)

// The TypeScript in the documentation.
function* markdownFiles(dir) {
  for (const entry of readdirSync(dir)) {
    if (skipped.has(entry)) continue
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) yield* markdownFiles(path)
    else if (entry.endsWith('.md')) yield path
  }
}
for (const path of markdownFiles(root)) {
  const text = readFileSync(path, 'utf8')
  for (const block of text.matchAll(
    /```(?:ts|typescript|tsx)[^\n]*\n([\s\S]*?)```/g
  )) {
    const file = ts.createSourceFile(
      'snippet.ts',
      block[1],
      ts.ScriptTarget.ES2023
    )
    const visit = node => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        report(relative(root, path), 0, 'the keyword `any` in a code block')
      }
      ts.forEachChild(node, visit)
    }
    visit(file)
  }
}

if (problems.length > 0) {
  console.error(
    `${problems.length} place(s) with an \`any\`:\n${problems.join('\n')}`
  )
  process.exit(1)
}
console.log(
  'No `any` in the code, the tests, the examples or the documentation.'
)
