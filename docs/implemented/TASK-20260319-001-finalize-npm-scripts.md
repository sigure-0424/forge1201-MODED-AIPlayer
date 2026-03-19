# TASK-20260319-001-finalize-npm-scripts

## Description
Finalize `package.json` npm scripts to properly hook up the test suite (e.g., executing the E2E integration test via `npm test`).

## Acceptance Criteria
- `package.json` contains a `test` script running `node tests/test_e2e_integration.js`.
- `npm test` runs successfully.
