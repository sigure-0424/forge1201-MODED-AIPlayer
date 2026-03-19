# BUGFIX-20260319-003-fix-oom-during-pathfinding

## Issue
The bot crashed with a `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory` during a `collect` operation. 
This was caused by two main factors:
1. `mineflayer-pathfinder`'s `A*` algorithm running out of memory. This happened because `canDig` was enabled with a broad search radius (`maxDistance: 64`) and an excessively high `thinkTimeout` without proper yielding, leading to memory bloat over millions of node calculations for far or unreachable blocks. 
2. The `AgentManager` improperly sanitizing JSON where `action` was nested deeply as an object key (e.g., `{"action": {"collect": {...}}}`). This resulted in undefined properties causing the bot to mistakenly search for enormous quantities in an unbounded path.

## Resolution
1. **AgentManager Sanitization Update**: Enhanced `sanitizeLLMAction` in `src/agent_manager.js` to correctly extract the innermost action logic even if wrapped in redundant object keys like `{"action": {"collect": {...}}}`.
2. **Pathfinder Memory Optimization**: 
   - Reduced `bot.pathfinder.thinkTimeout` from 3000ms to 1000ms.
   - Introduced `bot.pathfinder.tickTimeout = 10` to allow the event loop to breathe.
   - Added `movements.maxDropDown = 4` to prevent exploring deep ravines during block collections.
   - Reduced `maxDistance` in the block search query from `64` to `32`, limiting the target volume to mitigate unbounded search spaces.
   - Forced integer parsing for block `quantity`.
