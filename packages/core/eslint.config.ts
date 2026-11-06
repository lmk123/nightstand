import globals from 'globals'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import {defineConfig} from 'eslint/config'

export default defineConfig([
  {ignores: ['dist/**']},
  {
    files: ['**/*.{js,mjs,ts,mts}'],
    extends: [js.configs.recommended, tseslint.configs.recommended]
  },
  {
    // Config files run in Node.
    files: ['*.config.{js,mjs,ts,mts}'],
    languageOptions: {globals: globals.node}
  }
])
