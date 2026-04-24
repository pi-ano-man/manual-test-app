import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { index: 'src/index.ts' },
    format: ['cjs'],
    dts: true,
    clean: true,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: { types: 'src/types.ts' },
    format: ['cjs'],
    dts: true,
    clean: false,
  },
])
