// Setup for the `app` (component) test project only. The `core` project runs on
// plain Node with no setup at all — see jest.config.js.
//
// @testing-library/react-native v12.4+ registers its own matchers
// (toBeOnTheScreen, toBeDisabled, ...) on import, so there is nothing to wire up
// by hand. This file exists as the place for future global test setup.

export {};
