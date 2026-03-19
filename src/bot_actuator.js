// bot_actuator.js
const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const ForgeHandshakeStateMachine = require('./forge_handshake_state_machine');
const DynamicRegistryInjector = require('./dynamic_registry_injector');
const nbt = require('prismarine-nbt');

// Robust Crash Protection
process.on('uncaughtException', (err) => {
    console.error(`[Actuator] CRITICAL UNCAUGHT EXCEPTION: ${err.message}`);
    console.error(err.stack);
    process.send({ type: 'ERROR', category: 'BotError', details: err.message });
});

const botId = process.env.BOT_ID || 'Bot';
const botOptions = process.env.BOT_OPTIONS ? JSON.parse(process.env.BOT_OPTIONS) : {};

console.log(`[Actuator] Initializing ${botId}...`);

// Protocol & NBT Bypasses
try {
    const mcDataGlobal = require('minecraft-data')('1.20.1');
    const types = mcDataGlobal.protocol.play.toClient.types;
    const bypass = ['declare_recipes', 'tags', 'advancements', 'declare_commands', 'unlock_recipes', 'craft_recipe_response', 'nbt_query_response'];
    bypass.forEach(p => { 
        types[p] = 'restBuffer'; 
        if (types['packet_' + p]) types['packet_' + p] = 'restBuffer'; 
    });
    
    const nbtProto = nbt.protos.big;
    const originalRead = nbtProto.read;
    nbtProto.read = function (buffer, offset) {
        try { return originalRead.call(this, buffer, offset); } catch (e) { return nbtProto.readAnon(buffer, offset); }
    };
    console.log('[Actuator] Protocol bypasses and NBT leniency applied.');
} catch (e) { console.error(`[Actuator] Patch failed: ${e.message}`); }

const bot = mineflayer.createBot({
    host: (botOptions.host || 'localhost') + '\0FML3\0',
    port: botOptions.port || 25565,
    username: botId,
    version: '1.20.1',
    maxPacketSize: 10 * 1024 * 1024,
    disableChatSigning: true
});

const mcData = require('minecraft-data')(bot.version);

bot.on('inject_allowed', () => {
    console.log('[Actuator] Connection allowed. Starting handshake machine...');
    const handshake = new ForgeHandshakeStateMachine(bot._client);
    handshake.on('handshake_complete', (registrySyncBuffer) => {
        console.log('[Actuator] Handshake complete. Processing registries via Vanilla-First Mode...');
        const injector = new DynamicRegistryInjector(bot.registry);
        const parsed = injector.parseRegistryPayload(registrySyncBuffer);
        injector.injectBlockToRegistry(parsed);
    });
});

bot.loadPlugin(pathfinder);

bot.on('spawn', () => {
    console.log(`[Actuator] Bot spawned. Initializing physics and pathfinder...`);
    
    // Vanilla-standard physics
    bot.physics.enabled = true;
    
    // Vanilla-standard movements
    const movements = new Movements(bot, mcData); 
    movements.canDig = true;
    movements.allowSprinting = true;
    movements.allow1by1towers = false; // Prevent digging beneath own feet
    
    bot.pathfinder.setMovements(movements);
    bot.pathfinder.thinkTimeout = 5000;
    
    console.log('[Actuator] Pathfinder and Physics initialized.');
    bot.chat('Forge AI Player Ready.');
});

async function handleCommand(username, payload) {
    const action = payload.action;
    try {
        if (action === 'come') {
            const targetName = payload.target || username;
            const player = bot.players[targetName];
            if (!player || !player.entity) {
                bot.chat('I cannot see you!');
                return;
            }
            bot.chat(`Coming to you, ${targetName}!`);
            bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 1), true);
        } else if (action === 'status') {
            const pos = bot.entity.position;
            const block = bot.blockAt(pos.offset(0, -0.5, 0));
            bot.chat(`Pos: ${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}, ${pos.z.toFixed(1)} | Ground: ${bot.entity.onGround} | Block: ${block ? block.name : '?'}`);
        } else if (action === 'stop') {
            bot.pathfinder.setGoal(null);
            bot.chat('Stopped.');
        } else if (action === 'goto') {
            const { x, y, z } = payload;
            if (x === undefined || y === undefined || z === undefined) {
                bot.chat('Missing coordinates for goto.');
                return;
            }
            bot.chat(`Going to ${x}, ${y}, ${z}...`);
            await bot.pathfinder.goto(new goals.GoalNear(x, y, z, 1));
            bot.chat(`Arrived at ${x}, ${y}, ${z}.`);
        } else if (action === 'search') {
            const targetBlockName = payload.target;
            const targetBlockData = bot.registry.blocksByName[targetBlockName];
            if (!targetBlockData) {
                bot.chat(`I don't know what ${targetBlockName} is.`);
                return;
            }
            bot.chat(`Searching for ${targetBlockName}...`);
            const blocks = bot.findBlocks({ matching: targetBlockData.id, maxDistance: 32, count: 10 });
            if (blocks.length === 0) {
                bot.chat(`Could not find any ${targetBlockName} nearby.`);
            } else {
                bot.chat(`Found ${blocks.length} ${targetBlockName}(s). Closest is at: ${blocks[0].x}, ${blocks[0].y}, ${blocks[0].z}`);
            }
        } else if (action === 'collect') {
            const targetBlockName = payload.target;
            const targetBlockData = bot.registry.blocksByName[targetBlockName];
            if (!targetBlockData) {
                bot.chat(`I don't know what ${targetBlockName} is.`);
                return;
            }
            let quantity = payload.quantity || 1;
            const bounds = payload.bounds;

            bot.chat(`Starting collection of ${quantity} ${targetBlockName}(s).`);

            let collected = 0;
            while (collected < quantity) {
                const searchCount = bounds ? Math.max(quantity * 2, 256) : quantity * 2;
                let blocks = bot.findBlocks({ matching: targetBlockData.id, maxDistance: 64, count: searchCount });

                if (bounds) {
                    blocks = blocks.filter(p =>
                        p.x >= bounds.min.x && p.x <= bounds.max.x &&
                        p.y >= bounds.min.y && p.y <= bounds.max.y &&
                        p.z >= bounds.min.z && p.z <= bounds.max.z
                    );
                }

                if (blocks.length === 0) {
                    bot.chat(`No more ${targetBlockName} found in range.`);
                    break;
                }

                const targetPos = blocks[0];
                try {
                    await bot.pathfinder.goto(new goals.GoalNear(targetPos.x, targetPos.y, targetPos.z, 1));
                    const targetBlock = bot.blockAt(targetPos);
                    if (targetBlock && targetBlock.name === targetBlockName) {
                        await bot.dig(targetBlock);
                        collected++;
                    }
                } catch (digErr) {
                    console.error(`[Actuator] Collect step failed: ${digErr.message}`);
                    bot.chat(`Failed to collect block at ${targetPos.x}, ${targetPos.y}, ${targetPos.z}`);
                    break; // Prevent infinite loop on inaccessible block
                }
            }
            bot.chat(`Collection finished. Got ${collected}/${quantity} ${targetBlockName}(s).`);
        } else if (action === 'give') {
            const targetPlayerName = payload.target;
            const itemName = payload.item;
            const quantity = payload.quantity || 1;

            const targetPlayer = bot.players[targetPlayerName];
            if (!targetPlayer || !targetPlayer.entity) {
                bot.chat(`I cannot see ${targetPlayerName} to give them items!`);
                return;
            }

            const itemData = bot.registry.itemsByName[itemName];
            if (!itemData) {
                bot.chat(`I don't know what item ${itemName} is.`);
                return;
            }

            bot.chat(`Going to ${targetPlayerName} to give ${quantity} ${itemName}(s).`);

            try {
                await bot.pathfinder.goto(new goals.GoalNear(targetPlayer.entity.position.x, targetPlayer.entity.position.y, targetPlayer.entity.position.z, 2));
                bot.chat(`Here is your ${itemName}.`);
                await bot.toss(itemData.id, null, quantity);
            } catch (err) {
                console.error(`[Actuator] Give step failed: ${err.message}`);
                bot.chat(`Failed to give item to ${targetPlayerName}.`);
            }
        } else {
            bot.chat(`Unknown action: ${action}`);
        }
    } catch (e) {
        console.error(`[Actuator] Error handling command: ${e.message}`);
        bot.chat(`Error executing action ${action}.`);
    }
}

// Command Handler
bot.on('chat', (username, message) => {
    if (username === bot.username) return;

    // Try parsing as JSON first (from AI)
    const jsonMatch = message.match(/\{[\s\S]*?\}/);
    if (jsonMatch) {
        try {
            const payload = JSON.parse(jsonMatch[0]);
            handleCommand(username, payload);
            return;
        } catch (e) {
            console.error(`[Actuator] Failed to parse JSON payload: ${e.message}`);
        }
    }

    // Fallback to basic text commands
    const cmd = message.toLowerCase();
    try {
        if (cmd === 'come') {
            handleCommand(username, { action: 'come' });
        } else if (cmd === 'status') {
            handleCommand(username, { action: 'status' });
        } else if (cmd === 'stop') {
            handleCommand(username, { action: 'stop' });
        }
    } catch (e) {
        console.error(`[Actuator] Chat Command Error: ${e.message}`);
    }
});

// Global Error Handling
bot.on('kicked', (reason) => {
    console.log(`[Actuator] Kicked: ${reason}`);
    process.send({ type: 'ERROR', category: 'Kicked', details: reason });
});

bot.on('error', (err) => {
    console.error(`[Actuator] Bot Error: ${err.message}`);
    process.send({ type: 'ERROR', category: 'BotError', details: err.message });
});

bot.on('end', () => console.log('[Actuator] Disconnected from server.'));
