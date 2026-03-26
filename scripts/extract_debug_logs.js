const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'bot_system.log');

// Target words indicating failure
const ERROR_KEYWORDS = ['error', 'exception', 'failed', 'timeout', 'crash', 'cannot', 'unhandled', 'rejected', 'died'];

function parseJsonLog(file) {
    if (!fs.existsSync(file)) return null;
    try {
        const content = fs.readFileSync(file, 'utf8');
        return JSON.parse(content);
    } catch (e) {
        console.error(`Failed to parse ${file}: ${e.message}`);
        return null;
    }
}

function extractLogs() {
    console.log('--- Extracting Debug Logs ---');

    // 1. Parse bot_system.log
    if (fs.existsSync(LOG_FILE)) {
        const content = fs.readFileSync(LOG_FILE, 'utf8');
        const lines = content.split('\n');

        let errorBlocks = [];
        let inErrorBlock = false;
        let currentBlock = [];

        lines.forEach((line, index) => {
            const lowerLine = line.toLowerCase();
            const hasError = ERROR_KEYWORDS.some(kw => lowerLine.includes(kw));

            if (hasError) {
                if (!inErrorBlock) {
                    inErrorBlock = true;
                    // Grab 3 lines before context
                    for (let i = Math.max(0, index - 3); i < index; i++) {
                        currentBlock.push(`[CONTEXT] ${lines[i]}`);
                    }
                }
                currentBlock.push(`[ERROR] ${line}`);
            } else if (inErrorBlock) {
                // Grab 3 lines after context
                currentBlock.push(`[CONTEXT] ${line}`);
                if (currentBlock.length > 7) { // 3 before + 1 error + 3 after
                    errorBlocks.push(currentBlock.join('\n'));
                    currentBlock = [];
                    inErrorBlock = false;
                }
            }
        });

        if (currentBlock.length > 0) {
            errorBlocks.push(currentBlock.join('\n'));
        }

        if (errorBlocks.length > 0) {
            console.log('\n--- Found System Errors ---\n');
            errorBlocks.forEach((block, idx) => {
                console.log(`\n--- Block ${idx + 1} ---`);
                console.log(block);
            });
        } else {
            console.log('No significant errors found in bot_system.log.');
        }

    } else {
        console.log(`bot_system.log not found at ${LOG_FILE}`);
    }

    // 2. Parse ai_debug_AI_Bot_*.json files
    const cwdFiles = fs.readdirSync(process.cwd());
    const debugFiles = cwdFiles.filter(f => f.startsWith('ai_debug_') && f.endsWith('.json'));

    debugFiles.forEach(file => {
        const data = parseJsonLog(path.join(process.cwd(), file));
        if (data) {
            console.log(`\n--- State from ${file} ---`);
            console.log(`Timestamp: ${data.timestamp}`);
            console.log(`Health: ${data.health}, Food: ${data.food}`);
            console.log(`Position: X:${data.position?.x} Y:${data.position?.y} Z:${data.position?.z}`);
            console.log(`Action Queue (${data.actionQueue?.length || 0} items):`, data.actionQueue);

            // Highlight issues
            if (data.health <= 0) console.log(`[WARNING] Bot is dead.`);
            if (data.food <= 6) console.log(`[WARNING] Bot is starving.`);
            if (data.actionQueue?.some(a => a.action === 'recover_gravestone')) console.log(`[WARNING] Bot is currently in recovery mode.`);
        }
    });

    console.log('\n--- Extraction Complete ---');
}

extractLogs();
