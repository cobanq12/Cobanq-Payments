import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

/**
 * The important rule here is the boundary around src/core/: it must stay free of
 * the DOM, the web layer and Tailwind so the mobile app can import it unchanged.
 */
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'scripts'] },
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/core/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['@web/*', '**/web/**'], message: 'src/core must not import from src/web.' },
          { group: ['react-dom', 'react-dom/*', 'react-router', 'react-router-dom', 'lucide-react', 'jspdf', 'tailwindcss', 'tailwindcss/*', '*.css'], message: 'src/core must stay platform-neutral (no DOM, router, icons, PDF or Tailwind).' },
        ],
      }],
      'no-restricted-globals': ['error',
        { name: 'window', message: 'src/core must not use browser globals. Use an adapter.' },
        { name: 'document', message: 'src/core must not use browser globals. Use an adapter.' },
        { name: 'localStorage', message: 'Use the StorageAdapter.' },
        { name: 'sessionStorage', message: 'Use the StorageAdapter.' },
        { name: 'navigator', message: 'src/core must not use browser globals. Use an adapter.' },
        { name: 'location', message: 'src/core must not use browser globals.' },
        { name: 'alert', message: 'src/core must not use browser globals.' },
      ],
    },
  },
);
