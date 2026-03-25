# BUGFIX-20260319-001-missing-collectblock

## Issue
Running `node index.js` resulted in a critical uncaught exception originating from `src/bot_actuator.js`: `Cannot find module 'mineflayer-collectblock'`.

## Cause
The `mineflayer-collectblock` package was imported in `src/bot_actuator.js` but was not listed in `package.json`'s dependencies, causing the application to crash upon launch.

## Resolution
Installed `mineflayer-collectblock` via `npm install mineflayer-collectblock`, automatically adding it to the `package.json` dependencies. Verified `index.js` startup no longer crashes.
