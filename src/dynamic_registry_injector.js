// dynamic_registry_injector.js

class DynamicRegistryInjector {
    constructor(registry) {
        this.registry = registry;
    }

    readVarInt(buffer, offset) {
        let numRead = 0;
        let result = 0;
        let read;
        do {
            if (offset + numRead >= buffer.length) throw new Error('Buffer overflow reading VarInt');
            read = buffer.readUInt8(offset + numRead);
            let value = (read & 0b01111111);
            result |= (value << (7 * numRead));
            numRead++;
        } while ((read & 0b10000000) != 0);
        return { value: result, bytesRead: numRead };
    }

    readUtf(buffer, offset) {
        const { value: len, bytesRead } = this.readVarInt(buffer, offset);
        const str = buffer.toString('utf8', offset + bytesRead, offset + bytesRead + len);
        return { value: str, newOffset: offset + bytesRead + len };
    }

    parseRegistryPayload(payloadBuffers) {
        console.log(`[DynamicRegistry] Parsing ${payloadBuffers.length} registry payload buffers...`);
        const parsedEntries = [];
        
        for (const buf of payloadBuffers) {
            try {
                let offset = 0;
                const disc = buf[offset++];
                if (disc !== 3) continue; // Only process S2CRegistry (Disc 3)

                const { value: registryName, newOffset: o1 } = this.readUtf(buf, offset);
                offset = o1;
                
                // We mainly care about blocks and items for protocol parsing and pathfinding
                const isBlock = registryName === 'minecraft:block';
                const isItem = registryName === 'minecraft:item';
                
                if (!isBlock && !isItem) continue;

                const { value: entriesCount, bytesRead: br1 } = this.readVarInt(buf, offset);
                offset += br1;
                
                const type = isBlock ? 'block' : 'item';
                console.log(`[DynamicRegistry] Registry ${registryName} contains ${entriesCount} entries.`);

                for (let i = 0; i < entriesCount; i++) {
                    const { value: entryName, newOffset: o2 } = this.readUtf(buf, offset);
                    offset = o2;
                    const { value: entryId, bytesRead: br2 } = this.readVarInt(buf, offset);
                    offset += br2;
                    
                    // In some FML3 versions, there might be a boolean for "has data"
                    if (offset < buf.length) {
                        // Check if the next byte looks like a boolean or another entry start
                        // Actually, just push for now. If it fails, we'll see.
                    }

                    if (!parsedEntries.find(e => e.name === entryName)) {
                        parsedEntries.push({ id: entryId, name: entryName, type });
                    }
                }
            } catch (e) {
                console.warn(`[DynamicRegistry] Failed to parse a registry buffer: ${e.message}`);
            }
        }
        
        console.log(`[DynamicRegistry] Discovered ${parsedEntries.length} entries.`);
        return parsedEntries;
    }

    injectBlockToRegistry(parsedEntries) {
        console.log(`[DynamicRegistry] Injecting ${parsedEntries.length} entries into bot registry.`);

        for (const entry of parsedEntries) {
            if (entry.type === 'block') {
                // Skip if already exists in Vanilla registry to avoid overwriting with potentially wrong data
                if (this.registry.blocksByName[entry.name]) continue;

                let boundingBox = 'block';
                if (entry.name.includes('slab') || entry.name.includes('panel') || entry.name.includes('plate')) {
                    boundingBox = 'empty';
                }

                this.registry.blocks[entry.id] = {
                    id: entry.id,
                    name: entry.name,
                    displayName: entry.name,
                    hardness: 1.0,
                    diggable: true,
                    boundingBox: boundingBox,
                    material: 'rock',
                    harvestTools: {},
                    states: [] // Forge 1.20.1 needs this for some internal Mineflayer lookups
                };
                this.registry.blocksByName[entry.name] = this.registry.blocks[entry.id];
            } else if (entry.type === 'item') {
                if (this.registry.itemsByName[entry.name]) continue;

                this.registry.items[entry.id] = {
                    id: entry.id,
                    name: entry.name,
                    displayName: entry.name,
                    stackSize: 64
                };
                this.registry.itemsByName[entry.name] = this.registry.items[entry.id];
            }
        }
        console.log('[DynamicRegistry] Injection complete.');
    }
}

module.exports = DynamicRegistryInjector;
