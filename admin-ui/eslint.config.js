import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import { reactRefresh } from 'eslint-plugin-react-refresh';

export default [
    { ignores: ['dist'] },
    js.configs.recommended,
    reactHooks.configs.flat.recommended,
    // Context files export their hook next to the provider (useAuth, useWeek, useToast).
    reactRefresh.configs.vite({ allowExportNames: ['useAuth', 'useWeek', 'useToast'] }),
    {
        files: ['**/*.{js,jsx}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.browser,
            parserOptions: { ecmaFeatures: { jsx: true } }
        },
        rules: {
            // JSX components count as used; the core rule cannot see JSX by itself.
            'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z]', argsIgnorePattern: '^_' }]
        }
    }
];
