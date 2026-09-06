import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  { ignores: ['out/**', 'dist/**', 'release/**', 'node_modules/**', 'scripts/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module'
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-restricted-globals': [
        'error',
        { name: 'eval', message: 'Запрещено политикой безопасности RayLauncher.' }
      ],
      'no-restricted-properties': [
        'error',
        { object: 'child_process', property: 'exec', message: 'Только spawn/execFile без shell.' }
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'semver',
              message:
                'Версии Minecraft не semver (26.2 > 1.21.11). Порядок берётся из version_manifest_v2 по releaseTime.'
            },
            {
              name: 'minecraft-launcher-lib',
              message: 'Пакет заброшен с 2021 года, пайплайн запуска реализован в src/main/minecraft.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules
  },
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'Динамическая компиляция кода запрещена.'
        }
      ]
    }
  }
)
