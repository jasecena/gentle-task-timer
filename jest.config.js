/**
 * Two projects, because the two halves of this codebase have different needs:
 *
 * - `core` runs the timer engine on plain Node. No React Native transform, no
 *   jsdom, no mocks — it is a few hundred milliseconds and it is the suite that
 *   actually guards correctness.
 * - `app` runs component tests through the jest-expo preset.
 *
 * Coverage thresholds are deliberately strict on `src/core` and absent
 * elsewhere: the engine is where bugs are expensive and testing is cheap.
 */
module.exports = {
  projects: [
    {
      displayName: 'core',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/core/**/*.test.ts'],
      // Type-stripping plus ESM->CJS, and nothing else. If the engine ever
      // needs more than this to compile, it has grown a dependency it should
      // not have. `configFile: false` keeps babel.config.js (and therefore all
      // of Expo's transforms) out of this project entirely.
      transform: {
        '^.+\\.ts$': [
          'babel-jest',
          {
            presets: ['@babel/preset-typescript'],
            plugins: ['@babel/plugin-transform-modules-commonjs'],
            babelrc: false,
            configFile: false,
          },
        ],
      },
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
    },
    {
      displayName: 'app',
      // Platform-specific preset: this app ships to iOS only, so component
      // tests should resolve .ios.tsx variants and iOS native mocks.
      preset: 'jest-expo/ios',
      testMatch: ['<rootDir>/src/!(core)/**/*.test.{ts,tsx}', '<rootDir>/src/*.test.{ts,tsx}'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
      setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
    },
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/**/*.test.{ts,tsx}', '!src/**/__tests__/**'],
  // Every core domain is gated, not just the timer: `src/core` is the part that
  // has to be correct, and it is the part that is cheap to test.
  coverageThreshold: {
    './src/core/timer/': { branches: 90, functions: 100, lines: 95, statements: 95 },
    './src/core/reminders/': { branches: 90, functions: 100, lines: 95, statements: 95 },
    './src/core/alerts/': { branches: 90, functions: 100, lines: 95, statements: 95 },
  },
  coverageReporters: ['text-summary', 'lcov'],
};
