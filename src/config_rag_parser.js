// config_rag_parser.js
const fs = require('fs');
const toml = require('smol-toml');

class ConfigRAGParser {
    constructor(configDir) {
        this.configDir = configDir;
        this.constraints = {};
    }

    parseServerConfigs() {
        if (!fs.existsSync(this.configDir)) {
            console.warn(`[ConfigRAG] Config directory not found: ${this.configDir}`);
            return;
        }

        const files = fs.readdirSync(this.configDir).filter(f => f.endsWith('.toml'));
        
        for (const file of files) {
            const filePath = `${this.configDir}/${file}`;
            console.log(`[ConfigRAG] Parsing ${file}...`);
            try {
                const content = fs.readFileSync(filePath, 'utf-8');
                const parsed = toml.parse(content);
                this.extractConstraints(file, parsed);
            } catch (err) {
                console.error(`[ConfigRAG] Failed to parse ${file}: ${err.message}`);
            }
        }
    }

    extractConstraints(filename, parsed) {
        if (filename.includes('create')) {
            this.constraints.createMod = {
                maxStress: parsed.stress?.maxStress || 2048,
                baseSpeed: parsed.general?.baseSpeed || 16
            };
        }
        
        if (filename.includes('veinminer')) {
            this.constraints.veinMiner = {
                maxBlocks: parsed.general?.maxBlocks || 64,
                cooldownTicks: parsed.general?.cooldown || 20
            };
        }
    }

    generateLLMPromptContext() {
        let context = "=== SERVER CONSTRAINTS ===\n";
        
        if (this.constraints.createMod) {
            context += `- Create Mod: Max Stress = ${this.constraints.createMod.maxStress}, Base Speed = ${this.constraints.createMod.baseSpeed}\n`;
        }
        
        if (this.constraints.veinMiner) {
            context += `- VeinMiner: Max Blocks per vein = ${this.constraints.veinMiner.maxBlocks}, Cooldown = ${this.constraints.veinMiner.cooldownTicks} ticks\n`;
        }

        context += "\n=== AI INSTRUCTION FORMAT ===\n";
        context += "Output commands strictly in JSON format to be executed by the bot. Supported formats:\n";
        context += "- Follow a player: `{\"action\": \"come\", \"target\": \"player_name\"}`\n";
        context += "- Stop current task: `{\"action\": \"stop\"}`\n";
        context += "- Get status: `{\"action\": \"status\"}`\n";
        context += "- Go to coordinates: `{\"action\": \"goto\", \"x\": 100, \"y\": 64, \"z\": -200}`\n";
        context += "- Search for a block: `{\"action\": \"search\", \"target\": \"diamond_ore\"}`\n";
        context += "- Collect blocks: `{\"action\": \"collect\", \"target\": \"oak_log\", \"quantity\": 10, \"bounds\": {\"min\": {\"x\": 0, \"y\": 60, \"z\": 0}, \"max\": {\"x\": 10, \"y\": 70, \"z\": 10}}}` (bounds are optional)\n";
        context += "- Give an item to a player: `{\"action\": \"give\", \"target\": \"player_name\", \"item\": \"iron_ingot\", \"quantity\": 5}`\n";

        return context;
    }
}

module.exports = ConfigRAGParser;
