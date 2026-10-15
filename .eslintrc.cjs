module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  ignorePatterns: ['dist', 'node_modules', '.eslintrc.cjs', 'supabase/functions/**'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'react-refresh'],
  rules: {
    // Требование ТЗ: код с типами, без any.
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'react-refresh/only-export-components': [
      'error',
      // Экспорт вариантов компонента рядом с самим компонентом — это
      // стандартный паттерн shadcn/cva. Разрешаем его явно, чтобы не
      // разносить связанный код по файлам ради правила HMR.
      { allowConstantExport: true, allowExportNames: ['buttonVariants', 'badgeVariants'] },
    ],
    'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
    eqeqeq: ['error', 'always'],
  },
};
