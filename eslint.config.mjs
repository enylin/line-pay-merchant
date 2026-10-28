import js from '@eslint/js'
import { defineConfig, globalIgnores } from 'eslint/config'
import prettier from 'eslint-config-prettier'
import simpleImportSort from 'eslint-plugin-simple-import-sort'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig([
  globalIgnores([
    'dist',
    'coverage',
    'node_modules',
    'docs/.vitepress/cache',
    'docs/.vitepress/dist',
    'docs/api',
    'docs/en/api'
  ]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs']
        },
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: { 'simple-import-sort': simpleImportSort },
    rules: {
      'simple-import-sort/imports': 'error',
      'simple-import-sort/exports': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // No `as T` and no `<T>x`: narrow with a check, a guard or a generic, so
      // that the compiler is told the truth. (`as const` is always allowed.)
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'never' }
      ],
      // No `x!` either: it is an assertion that a value is there. Check it, or
      // let the structure of the code make it certain.
      '@typescript-eslint/no-non-null-assertion': 'error',
      // No `any`, not even in a rest parameter. The unsafe uses of an `any` that
      // comes from somewhere else (`JSON.parse`, a library) are errors too, in the
      // rules of `recommendedTypeChecked`; `scripts/check-no-any.mjs` looks at the
      // types the compiler works out for names that are declared.
      '@typescript-eslint/no-explicit-any': [
        'error',
        { ignoreRestArgs: false }
      ],
      // `Array.isArray` narrows to `any[]`: use `isArray` of `src/core/guard.ts`.
      'no-restricted-properties': [
        'error',
        {
          object: 'Array',
          property: 'isArray',
          message:
            'Array.isArray narrows to any[]. Use isArray from src/core/guard.ts, which narrows to unknown[].'
        }
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },
  {
    // Tests simulate rejections that are not Error instances on purpose.
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/prefer-promise-reject-errors': 'off' }
  },
  {
    // `isArray` is where `Array.isArray` is called; the examples and the
    // documentation config stand on their own and cannot import it.
    files: ['src/core/guard.ts', 'examples/**/*.ts', 'docs/**/*.ts'],
    rules: { 'no-restricted-properties': 'off' }
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    extends: [tseslint.configs.disableTypeChecked]
  },
  prettier
])
