// dynamic_registry_injector.js

class DynamicRegistryInjector {
    constructor(registry) {
        this.registry = registry;
    }

    readVarInt(buffer, offset) {
        let numRead = 0, result = 0, read;
        do {
            if (offset + numRead >= buffer.length) throw new Error('Buffer overflow');
            read = buffer.readUInt8(offset + numRead);
            result |= ((read & 0x7F) << (7 * numRead++));
        } while ((read & 0x80) !== 0);
        return { value: result, bytesRead: numRead };
    }

    parseRegistryPayload(payloadBuffers) {
        console.log(`[DynamicRegistry] Scanning ${payloadBuffers.length} buffers...`);
        const parsedEntries = [];
        for (const buf of payloadBuffers) {
            let offset = 0;
            while (offset < buf.length) {
                const colonIndex = buf.indexOf(0x3A, offset); // ':'
                if (colonIndex === -1) break;
                let start = colonIndex - 1;
                while (start >= 0 && /[a-z0-9_.-]/.test(String.fromCharCode(buf[start]))) start--;
                start++;
                let end = colonIndex + 1;
                while (end < buf.length && /[a-z0-9_/.-]/.test(String.fromCharCode(buf[end]))) end++;
                
                const name = buf.toString('utf8', start, end);
                if (name.includes(':')) {
                    let entryId = undefined;
                    try {
                        const { value } = this.readVarInt(buf, end);
                        if (value >= 0 && value < 32767) entryId = value;
                    } catch (e) {}
                    
                    if (entryId === undefined) entryId = 30000 + parsedEntries.length;
                    
                    if (!parsedEntries.find(e => e.name === name)) {
                        const lower = name.toLowerCase();
                        const isBlock = lower.includes('block') || lower.includes('stone') || lower.includes('ore') || 
                                        lower.includes('dirt') || lower.includes('grass') || lower.includes('planks') ||
                                        lower.includes('log') || lower.includes('plate') || lower.includes('base');
                        parsedEntries.push({ id: entryId, name, type: isBlock ? 'block' : 'item' });
                    }
                }
                offset = end;
            }
        }
        return parsedEntries;
    }

    injectBlockToRegistry(parsedEntries) {
        console.log(`[DynamicRegistry] Injecting ${parsedEntries.length} entries...`);
        const template = this.registry.blocksByName['stone']; // 未知のMOD用フォールバック

        for (const entry of parsedEntries) {
            if (entry.type === 'block') {
                // "minecraft:" や "forge:" などの名前空間を削除してバニラ名を取得
                const shortName = entry.name.replace(/^[^:]+:/, '');

                let finalBlockData;

                if (this.registry.blocksByName[shortName]) {
                    // ① バニラブロックの場合：既存の正確な物理データ（空気なら非固体）をコピーしてIDのみ更新
                    const vanillaData = this.registry.blocksByName[shortName];
                    finalBlockData = { ...vanillaData, id: entry.id, name: entry.name };
                } else {
                    // ② 完全な未知のMODブロックの場合：落下防止のためStoneとして登録
                    finalBlockData = {
                        ...template,
                        id: entry.id,
                        name: entry.name,
                        displayName: entry.name,
                        states: [],
                        minStateId: entry.id,
                        maxStateId: entry.id,
                        defaultState: entry.id
                    };

                    if (this.registry.blockCollisionShapes) {
                        this.registry.blockCollisionShapes.blocks[entry.name] = 1; // 1 = 固体キューブ
                    }
                }

                // DIRECT INJECTION - NO PROXIES
                this.registry.blocks[entry.id] = finalBlockData;
                this.registry.blocksByName[entry.name] = finalBlockData;
                if (this.registry.blocksByStateId) this.registry.blocksByStateId[entry.id] = finalBlockData;
                if (this.registry.blocksArray) this.registry.blocksArray.push(finalBlockData);
            } else {
                if (this.registry.itemsByName[entry.name]) continue;
                const itemData = { id: entry.id, name: entry.name, displayName: entry.name, stackSize: 64 };
                this.registry.items[entry.id] = itemData;
                this.registry.itemsByName[entry.name] = itemData;
                if (this.registry.itemsArray) this.registry.itemsArray.push(itemData);
            }
        }
        console.log('[DynamicRegistry] Injection complete.');
    }
}

module.exports = DynamicRegistryInjector;
