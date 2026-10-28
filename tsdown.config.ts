import { readFile, writeFile } from 'node:fs/promises'

import { defineConfig } from 'tsdown'

const DECLARATIONS = ['dist/index.d.ts', 'dist/index.d.cts']

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
  platform: 'neutral',
  outDir: 'dist',
  // The maps of the declarations are not written, and the comment at the end of
  // a declaration file that points to one would name a file that is not in the
  // package.
  onSuccess: async () => {
    for (const file of DECLARATIONS) {
      const text = await readFile(file, 'utf8')
      await writeFile(
        file,
        text.replace(/\n\/\/# sourceMappingURL=.*\n?$/, '\n')
      )
    }
  }
})
