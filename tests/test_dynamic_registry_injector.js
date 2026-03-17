const DynamicRegistryInjector = require('../src/dynamic_registry_injector');
const assert = require('assert');

// Mock bot registry structure
function createMockRegistry() {
    return {
        blocks: {},
        blocksByName: {},
        items: {},
        itemsByName: {}
    };
}

function writeVarInt(value) {
    const bytes = [];
    do {
        let temp = (value & 0b01111111);
        value >>>= 7;
        if (value != 0) temp |= 0b10000000;
        bytes.push(temp);
    } while (value != 0);
    return Buffer.from(bytes);
}

function writeUtf(str) {
    const strBuf = Buffer.from(str, 'utf8');
    return Buffer.concat([writeVarInt(strBuf.length), strBuf]);
}

async function runTest() {
    console.log('--- Starting DynamicRegistryInjector Test ---');
    
    const registry = createMockRegistry();
    const injector = new DynamicRegistryInjector(registry);
    
    // Build a mock Disc 3 payload for minecraft:item
    const payload = Buffer.concat([
        Buffer.from([3]), // Disc 3
        writeUtf('minecraft:item'),
        writeVarInt(1), // 1 entry
        writeUtf('create:andesite_alloy'),
        writeVarInt(4001)
    ]);
    
    const parsed = injector.parseRegistryPayload([payload]);
    
    assert.strictEqual(parsed.length, 1);
    assert.strictEqual(parsed[0].name, 'create:andesite_alloy');
    assert.strictEqual(parsed[0].id, 4001);
    
    injector.injectBlockToRegistry(parsed);
    
    // Verify injection
    assert.ok(registry.items[4001]);
    assert.strictEqual(registry.items[4001].name, 'create:andesite_alloy');
    
    console.log('--- DynamicRegistryInjector Test Passed ---');
}

runTest().catch(err => {
    console.error('[Test] Failed:', err);
    process.exit(1);
});
