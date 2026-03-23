1. *Fix noisy logging:*
  - Edit `src/bot_actuator.js` to wrap specific `console.log` calls in `if (process.env.DEBUG === 'true') { ... }`.
  - The target lines are `[ServerPos]` (line 100), `[MoveDiag]` (line 266), `[SpawnDiag]` (line 281), and `[GroundDiag]` (line 484).
  - Use `replace_with_git_merge_diff` to apply these conditionals.
  - Verify changes via `cat src/bot_actuator.js | grep "process.env.DEBUG"`.

2. *Improve tool crafting (Stone Upgrade & Chests):*
  - Edit `src/bot_actuator.js` `ensureToolFor` function.
  - Insert the following chest scanning logic at the beginning of `ensureToolFor` (after basic validation):
    ```javascript
    const chestId = bot.registry.blocksByName.chest?.id;
    if (chestId !== undefined) {
        const chests = bot.findBlocks({ matching: chestId, maxDistance: 16, count: 5 });
        for (const cpos of chests) {
            if (currentCancelToken.cancelled) return;
            try {
                const chestBlock = bot.blockAt(cpos);
                if (chestBlock) {
                    await withTimeout(bot.pathfinder.goto(new goals.GoalNear(cpos.x, cpos.y, cpos.z, 2)), 10000, 'goto chest', () => bot.pathfinder.setGoal(null));
                    const chestWindow = await bot.openContainer(chestBlock);
                    const neededItems = [`iron_${toolCat}`, `stone_${toolCat}`, `wooden_${toolCat}`, 'iron_ingot', 'cobblestone'];
                    for (const item of chestWindow.containerItems()) {
                        if (neededItems.includes(item.name)) {
                            await chestWindow.withdraw(item.type, null, item.name.endsWith(toolCat) ? 1 : Math.min(item.count, 64));
                        }
                    }
                    bot.closeWindow(chestWindow);
                }
            } catch(e) {
                console.log(`[Actuator] ensureToolFor chest scan: ${e.message}`);
            }
            // Re-check if we now have a tool after looting
            const itemsPostChest = bot.inventory.items();
            if (itemsPostChest.some(i => (hasRequirement && block.harvestTools[i.type]) || (!hasRequirement && i.name.endsWith(toolSuffix)))) {
                await equipBestTool(block); return;
            }
        }
    }
    ```
  - Modify the tool name resolution before crafting. Replace the block from line 1115 (`const toolName = \`wooden_\${toolCat}\`;`) in `ensureToolFor` to:
    ```javascript
        let toolName = `wooden_${toolCat}`;
        const invNames = new Set(bot.inventory.items().map(i => i.name));
        if (invNames.has('iron_ingot')) { toolName = `iron_${toolCat}`; }
        else if (invNames.has('cobblestone')) { toolName = `stone_${toolCat}`; }

        const toolId = bot.registry.itemsByName[toolName]?.id;
        if (toolId !== undefined) {
            const toolR = bot.recipesFor(toolId, null, 1, true)[0];
            if (toolR) {
                try {
                    await withTimeout(bot.pathfinder.goto(new goals.GoalNear(craftingTable.position.x, craftingTable.position.y, craftingTable.position.z, 1)), 15000, 'goto table (auto-tool)', () => bot.pathfinder.setGoal(null));
                    if (currentCancelToken.cancelled) return;
                    await bot.craft(toolR, 1, craftingTable);
                    bot.chat(`Crafted a ${toolName}!`);
                } catch (e) { console.log(`[Actuator] auto-tool craft ${toolName}: ${e.message}`); }
            }
        }
    ```
  - Use `replace_with_git_merge_diff` to insert this code into `ensureToolFor`.
  - Verify changes via `cat src/bot_actuator.js | grep "openContainer"`.

3. *Implement vein mining (一括破壊):*
  - Edit `src/bot_actuator.js` inside the `collect` action.
  - Replace the `debouncer.isCascadingWait` block (lines 1464-1470) with a concrete BFS loop.
  - Code to insert:
    ```javascript
                                let veinMined = 1;
                                const queue = [blockPos];
                                const visited = new Set([`${blockPos.x},${blockPos.y},${blockPos.z}`]);
                                const offsets = [{x:1,y:0,z:0}, {x:-1,y:0,z:0}, {x:0,y:1,z:0}, {x:0,y:-1,z:0}, {x:0,y:0,z:1}, {x:0,y:0,z:-1}];

                                while(queue.length > 0 && veinMined < 64 && collected + veinMined < quantity && !currentCancelToken.cancelled) {
                                    const curr = queue.shift();
                                    for (const off of offsets) {
                                        const nx = curr.x + off.x, ny = curr.y + off.y, nz = curr.z + off.z;
                                        const key = `${nx},${ny},${nz}`;
                                        if (!visited.has(key)) {
                                            visited.add(key);
                                            const adjBlock = bot.blockAt(new Vec3(nx, ny, nz));
                                            if (adjBlock && searchIds.includes(adjBlock.type)) {
                                                const held = bot.inventory.slots[bot.getEquipmentDestSlot('hand')];
                                                if (held && held.maxDurability) {
                                                    const usesLeft = held.maxDurability - (held.durabilityUsed || 0);
                                                    if (usesLeft <= 5) break;
                                                }
                                                try {
                                                    await withTimeout(bot.pathfinder.goto(new goals.GoalNear(nx, ny, nz, 2)), 5000, 'vein goto', () => bot.pathfinder.setGoal(null));
                                                    await bot.lookAt(adjBlock.position.offset(0.5, 0.5, 0.5));
                                                    await withTimeout(bot.dig(adjBlock, true), maxDigMs, 'vein dig', () => {});
                                                    queue.push(adjBlock.position);
                                                    veinMined++;
                                                } catch(e) {}
                                            }
                                        }
                                    }
                                }
    ```
  - Apply changes using `replace_with_git_merge_diff`.
  - Verify changes via `cat src/bot_actuator.js | grep "veinMined"`.

4. *Support multiple bots:*
  - Edit `index.js`.
  - Replace the lines:
    ```javascript
    const botId = process.env.BOT_NAME || 'AI_Bot_01';
    ```
    with:
    ```javascript
    const botNamesStr = process.env.BOT_NAMES || process.env.BOT_NAME || 'AI_Bot_01';
    const botNames = botNamesStr.split(',').map(n => n.trim());
    ```
  - And replace the lines:
    ```javascript
    // Start a single bot instance for now
    manager.startBot(botId, { host, port });
    ```
    with:
    ```javascript
    // Start bot instances
    for (const name of botNames) {
        manager.startBot(name, { host, port });
    }
    ```
  - Apply changes using `replace_with_git_merge_diff`.
  - Verify changes via `cat index.js`.

5. *Run tests:*
  - Run project tests via `npm test` and `npm run test:e2e` to ensure changes are correct and no regressions were introduced.

6. *Pre commit steps:*
  - Complete pre-commit steps to ensure proper testing, verification, review, and reflection are done.

7. *Submit the change.*
