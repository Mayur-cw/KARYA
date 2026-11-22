import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';
export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, {
  ignores: ['dist/**','dist-server/**','coverage/**','node_modules/**']
}, {
  files: ['src/**/*.{ts,tsx}','tests/**/*.{ts,tsx}'],
  plugins: { 'jsx-a11y': jsxA11y },
  languageOptions: { globals: { ...globals.browser, ...globals.node } },
  rules: { ...jsxA11y.configs.recommended.rules }
});
