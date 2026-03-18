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
            if (offset + numRead >= buffer.length) throw new Error('Buffer overflow');
            read = buffer.readUInt8(offset + numRead);
            let value = (read & 0b01111111);
            result |= (value << (7 * numRead));
            numRead++;
        } while ((read & 0b10000000) != 0);
        return { value: result, bytesRead: numRead };
    }

    parseRegistryPayload(payloadBuffers) {
        console.log(`[DynamicRegistry] Parsing ${payloadBuffers.length} registry payload buffers...`);
        const parsedEntries = [];
        
        for (const buf of payloadBuffers) {
            try {
                const str = buf.toString('utf8');
                // Highly lenient regex to find ResourceLocations in binary/NBT data
                const matches = str.match(/[a-z0-9_.-]+:[a-z0-9_.-]+/g);
                
                if (matches) {
                    for (const match of matches) {
                        const matchBuf = Buffer.from(match, 'utf8');
                        const matchIndex = buf.indexOf(matchBuf);
                        if (matchIndex === -1) continue;
                        
                        let offset = matchIndex + matchBuf.length;
                        let entryId;
                        
                        // Try to extract the REAL ID if it follows the name in the binary stream
                        try {
                            const { value, bytesRead } = this.readVarInt(buf, offset);
                            if (value >= 0 && value < 1000000) {
                                entryId = value;
                            }
                        } catch (e) {}
                        
                        // Fallback to synthetic ID if extraction fails
                        if (entryId === undefined) {
                            entryId = 20000 + parsedEntries.length;
                        }
                        
                        if (!parsedEntries.find(e => e.name === match)) {
                            const type = match.includes('block') || match.includes('ore') ? 'block' : 'item';
                            parsedEntries.push({ id: entryId, name: match, type });
                        }
                    }
                }
            } catch (e) {
                console.warn(`[DynamicRegistry] Failed to parse a registry buffer: ${e.message}`);
            }
        }
        
        console.log(`[DynamicRegistry] Discovered ${parsedEntries.length} entries via lenient heuristic.`);
        return parsedEntries;
    }

    injectBlockToRegistry(parsedEntries) {
        console.log(`[DynamicRegistry] Injecting ${parsedEntries.length} entries into bot registry.`);

        for (const entry of parsedEntries) {
            if (entry.type === 'block') {
                if (this.registry.blocksByName[entry.name]) continue;

                const blockData = {
                    id: entry.id,
                    name: entry.name,
                    displayName: entry.name,
                    hardness: 1.0,
                    diggable: true,
                    boundingBox: 'block',
                    transparent: false,
                    material: 'rock',
                    harvestTools: {},
                    states: []
                };
                this.registry.blocks[entry.id] = blockData;
                this.registry.blocksByName[entry.name] = blockData;
                if (this.registry.blocksArray && !this.registry.blocksArray.includes(blockData)) {
                    this.registry.blocksArray.push(blockData);
                }
            } else if (entry.type === 'item') {
                if (this.registry.itemsByName[entry.name]) continue;

                const itemData = {
                    id: entry.id,
                    name: entry.name,
                    displayName: entry.name,
                    stackSize: 64
                };
                this.registry.items[entry.id] = itemData;
                this.registry.itemsByName[entry.name] = itemData;
                if (this.registry.itemsArray && !this.registry.itemsArray.includes(itemData)) {
                    this.registry.itemsArray.push(itemData);
                }
            }
        }
        console.log('[DynamicRegistry] Injection complete.');
    }
}

module.exports = DynamicRegistryInjector;
