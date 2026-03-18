# Minecraft Forge 1.20.1 AI Player System

This framework provides an autonomous AI player system using Mineflayer designed specifically for Minecraft 1.20.1 Forge environments. It resolves the fundamental protocol and registry incompatibilities between standard Mineflayer and Forge servers.

## Core Architecture

The system is split into an **Agent Manager** (main process) and isolated **Bot Actuators** (child processes). This ensures stability and prevents pathfinding loops from crashing the main orchestrator.

### Key Components

| Component | Responsibility |
| :--- | :--- |
| `forge_handshake_state_machine.js` | **FML3 Protocol Bridge**: Handles the complex Forge Mod Loader (FML3) handshake, spoofing mod lists and registry acknowledgments to allow standard Mineflayer login. |
| `dynamic_registry_injector.js` | **Vanilla-First Mapping**: Intercepts dynamic registry synchronization packets and maps Forge-specific ID shifts back to valid Vanilla block definitions. This prevents crashes in the Pathfinder and Physics engine. |
| `bot_actuator.js` | **Autonomous Execution**: Manages the bot instance, Mineflayer plugins (Pathfinder), and physics stabilization. |
| `agent_manager.js` | **Lifecycle Management**: Orchestrates multiple bot processes and handles automatic recovery from kicks or crashes. |

## Forge 1.20.1 Compatibility (Final Resolution)

The system achieves stability in modded environments through a **Vanilla-Mapping strategy**:
- **Protocol Bypasses**: Problematic modded packets (recipes, tags, advancements) are intercepted and ignored at the protocol level to prevent stream desync.
- **Pathfinder Stability**: Uses a strictly validated block mapping that prevents the common `TypeError: reading 'length'` crash in `mineflayer-pathfinder`.
- **Physics Synchronization**: Resolves "floating mid-air" issues by ensuring the bot's internal registry accurately reflects the server's solid ground, even when block IDs are shifted by mods.
- **Server as Truth**: Implements logic to immediately synchronize position and velocity with the server, ensuring natural knockback and gravity.

## Getting Started

1.  **Configure**: Set your server details in environment variables or `index.js`.
2.  **Install**: `npm install`
3.  **Run**: `node index.js`

## Commands

Once the bot is online, you can use the following in-game chat commands:
- `come`: Calculates a path and moves to your position.
- `status`: Reports current coordinates, health, and ground state.
- `stop`: Immediately cancels all current goals.

---
*Note: This framework is optimized for reliability on vanilla blocks within a Forge environment. Modded block entities are treated as non-solid by default to ensure safe gravity and movement.*
