import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // server/ is its own project with its own ESLint config, run by its own
  // `npm run lint` (RII-36: linting it from here broke in CI, where the
  // frontend job doesn't install server/node_modules).
  globalIgnores(['dist', 'server']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        // Explicit, so typescript-eslint never has to guess between this
        // project's tsconfig and server/'s.
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
])
