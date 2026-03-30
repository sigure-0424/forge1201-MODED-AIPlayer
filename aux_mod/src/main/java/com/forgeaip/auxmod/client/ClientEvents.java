package com.forgeaip.auxmod.client;

import com.forgeaip.auxmod.AuxMod;
import com.forgeaip.auxmod.ForgeAIPConfig;
import com.forgeaip.auxmod.data.SafeZoneManager;
import com.forgeaip.auxmod.network.OrchestratorClient;
import com.mojang.blaze3d.platform.InputConstants;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.core.BlockPos;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;
import net.minecraft.world.phys.Vec3;
import net.minecraftforge.api.distmarker.Dist;
import net.minecraftforge.client.event.*;
import net.minecraftforge.event.TickEvent;
import net.minecraftforge.eventbus.api.SubscribeEvent;
import net.minecraftforge.fml.common.Mod;
import org.joml.Matrix3f;
import org.joml.Matrix4f;
import org.lwjgl.glfw.GLFW;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Client-side event handlers: keybind registration, tick-based entity tracking,
 * and login/logout lifecycle management for the OrchestratorClient.
 */
@Mod.EventBusSubscriber(modid = AuxMod.MOD_ID, value = Dist.CLIENT)
public class ClientEvents {

    // F8 = toggle HUD, F9 = open Macro screen
    public static KeyMapping HUD_TOGGLE_KEY;
    public static KeyMapping MACRO_SCREEN_KEY;

    private static int entityTrackTick = 0;
    private static final int ENTITY_TRACK_INTERVAL = 100; // every 5 seconds (20 ticks/s)

    // -------------------------------------------------------------------------
    // Keybind registration (mod event bus — handled in AuxMod constructor)
    // -------------------------------------------------------------------------

    /**
     * Must be called from the mod event bus during FMLClientSetupEvent (or
     * RegisterKeyMappingsEvent). We expose static fields so AuxMod can call this.
     */
    public static void registerKeyMappings(RegisterKeyMappingsEvent event) {
        HUD_TOGGLE_KEY = new KeyMapping(
                "key.forgeaip.hud_toggle",
                InputConstants.Type.KEYSYM,
                GLFW.GLFW_KEY_F8,
                "key.categories.forgeaip"
        );
        MACRO_SCREEN_KEY = new KeyMapping(
                "key.forgeaip.macro_screen",
                InputConstants.Type.KEYSYM,
                GLFW.GLFW_KEY_F9,
                "key.categories.forgeaip"
        );
        event.register(HUD_TOGGLE_KEY);
        event.register(MACRO_SCREEN_KEY);
        AuxMod.LOGGER.info("[ForgeAIP] Key mappings registered (F8=HUD, F9=Macros).");
    }

    // -------------------------------------------------------------------------
    // Key input handling
    // -------------------------------------------------------------------------

    @SubscribeEvent
    public static void onKeyInput(InputEvent.Key event) {
        if (HUD_TOGGLE_KEY != null && HUD_TOGGLE_KEY.consumeClick()) {
            BotStatusHUD.toggleVisible();
            Minecraft mc = Minecraft.getInstance();
            if (mc.player != null) {
                mc.player.displayClientMessage(
                        net.minecraft.network.chat.Component.literal(
                                "[ForgeAIP] HUD " + (BotStatusHUD.isVisible() ? "enabled" : "disabled")),
                        true);
            }
        }
        if (MACRO_SCREEN_KEY != null && MACRO_SCREEN_KEY.consumeClick()) {
            Minecraft mc = Minecraft.getInstance();
            if (mc.screen == null) {
                mc.setScreen(new MacroScreen());
            }
        }
    }

    // -------------------------------------------------------------------------
    // Client tick — entity tracking
    // -------------------------------------------------------------------------

    @SubscribeEvent
    public static void onClientTick(TickEvent.ClientTickEvent event) {
        if (event.phase != TickEvent.Phase.END) return;
        if (!ForgeAIPConfig.CLIENT.entityTrackingEnabled.get()) return;

        entityTrackTick++;
        if (entityTrackTick < ENTITY_TRACK_INTERVAL) return;
        entityTrackTick = 0;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;
        if (!OrchestratorClient.getInstance().isConnected()) return;

        try {
            Vec3 playerPos = mc.player.position();
            String dimension = mc.level.dimension().location().toString();
            String playerName = mc.player.getName().getString();

            List<Map<String, Object>> entities = new ArrayList<>();
            for (Entity entity : mc.level.entitiesForRendering()) {
                if (entity == mc.player) continue;
                double dist = entity.distanceTo(mc.player);
                if (dist > 64) continue;

                Map<String, Object> e = new HashMap<>();
                e.put("type", entity.getType().getDescriptionId());
                e.put("name", entity.getName().getString());
                e.put("x", Math.round(entity.getX() * 10.0) / 10.0);
                e.put("y", Math.round(entity.getY() * 10.0) / 10.0);
                e.put("z", Math.round(entity.getZ() * 10.0) / 10.0);
                entities.add(e);
            }

            // Build JSON manually (no Gson dependency)
            StringBuilder sb = new StringBuilder();
            sb.append("{\"playerName\":\"").append(escapeJson(playerName)).append("\"");
            sb.append(",\"position\":{\"x\":").append(Math.round(playerPos.x * 10.0) / 10.0)
              .append(",\"y\":").append(Math.round(playerPos.y * 10.0) / 10.0)
              .append(",\"z\":").append(Math.round(playerPos.z * 10.0) / 10.0).append("}");
            sb.append(",\"dimension\":\"").append(escapeJson(dimension)).append("\"");
            sb.append(",\"nearbyEntities\":[");
            for (int i = 0; i < entities.size(); i++) {
                Map<String, Object> e = entities.get(i);
                if (i > 0) sb.append(",");
                sb.append("{\"type\":\"").append(escapeJson((String) e.get("type"))).append("\"");
                sb.append(",\"name\":\"").append(escapeJson((String) e.get("name"))).append("\"");
                sb.append(",\"x\":").append(e.get("x"));
                sb.append(",\"y\":").append(e.get("y"));
                sb.append(",\"z\":").append(e.get("z")).append("}");
            }
            sb.append("]}");

            OrchestratorClient.getInstance().postJson("/api/entity_updates", sb.toString());
        } catch (Exception ex) {
            AuxMod.LOGGER.debug("[ForgeAIP] Entity tracking error: {}", ex.getMessage());
        }
    }

    // -------------------------------------------------------------------------
    // Login / logout lifecycle
    // -------------------------------------------------------------------------

    @SubscribeEvent
    public static void onPlayerLogin(ClientPlayerNetworkEvent.LoggingIn event) {
        AuxMod.LOGGER.info("[ForgeAIP] Player logged in — connecting to orchestrator.");
        OrchestratorClient.getInstance().connect();
    }

    @SubscribeEvent
    public static void onPlayerLogout(ClientPlayerNetworkEvent.LoggingOut event) {
        AuxMod.LOGGER.info("[ForgeAIP] Player logged out — disconnecting from orchestrator.");
        OrchestratorClient.getInstance().disconnect();
    }

    // -------------------------------------------------------------------------
    // Utilities
    // -------------------------------------------------------------------------

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"")
                .replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t");
    }

    // -------------------------------------------------------------------------
    // Safe zone outline rendering
    // -------------------------------------------------------------------------

    /**
     * Renders a green outline around the block the player is looking at when that
     * block is inside a registered safe zone.
     */
    @SubscribeEvent
    public static void onRenderLevelStage(RenderLevelStageEvent event) {
        if (event.getStage() != RenderLevelStageEvent.Stage.AFTER_TRANSLUCENT_BLOCKS) return;

        Minecraft mc = Minecraft.getInstance();
        if (mc.player == null || mc.level == null) return;

        HitResult hitResult = mc.hitResult;
        if (hitResult == null || hitResult.getType() != HitResult.Type.BLOCK) return;

        BlockPos pos = ((BlockHitResult) hitResult).getBlockPos();
        SafeZoneManager.SafeZone zone = SafeZoneManager.getInstance()
                .findContaining(pos.getX() + 0.5, pos.getY() + 0.5, pos.getZ() + 0.5);
        if (zone == null) return;

        // Inflate the block AABB slightly for visibility
        net.minecraft.world.phys.AABB box = new net.minecraft.world.phys.AABB(pos).inflate(0.003);
        Vec3 camPos = mc.gameRenderer.getMainCamera().getPosition();

        com.mojang.blaze3d.vertex.PoseStack poseStack = event.getPoseStack();
        poseStack.pushPose();
        poseStack.translate(-camPos.x, -camPos.y, -camPos.z);

        com.mojang.blaze3d.vertex.VertexConsumer consumer = mc.renderBuffers()
                .bufferSource()
                .getBuffer(net.minecraft.client.renderer.RenderType.lines());

        renderAABBOutline(poseStack, consumer, box, 0.0f, 1.0f, 0.0f, 0.7f);

        mc.renderBuffers().bufferSource().endBatch(net.minecraft.client.renderer.RenderType.lines());
        poseStack.popPose();
    }

    private static void renderAABBOutline(com.mojang.blaze3d.vertex.PoseStack poseStack,
                                           com.mojang.blaze3d.vertex.VertexConsumer consumer,
                                           net.minecraft.world.phys.AABB box,
                                           float r, float g, float b, float a) {
        float x1 = (float) box.minX, y1 = (float) box.minY, z1 = (float) box.minZ;
        float x2 = (float) box.maxX, y2 = (float) box.maxY, z2 = (float) box.maxZ;
        com.mojang.blaze3d.vertex.PoseStack.Pose pose = poseStack.last();
        Matrix4f mat = pose.pose();
        Matrix3f norm = pose.normal();

        // Bottom edges
        line(consumer, mat, norm, x1,y1,z1, x2,y1,z1, r,g,b,a);
        line(consumer, mat, norm, x2,y1,z1, x2,y1,z2, r,g,b,a);
        line(consumer, mat, norm, x2,y1,z2, x1,y1,z2, r,g,b,a);
        line(consumer, mat, norm, x1,y1,z2, x1,y1,z1, r,g,b,a);
        // Top edges
        line(consumer, mat, norm, x1,y2,z1, x2,y2,z1, r,g,b,a);
        line(consumer, mat, norm, x2,y2,z1, x2,y2,z2, r,g,b,a);
        line(consumer, mat, norm, x2,y2,z2, x1,y2,z2, r,g,b,a);
        line(consumer, mat, norm, x1,y2,z2, x1,y2,z1, r,g,b,a);
        // Vertical edges
        line(consumer, mat, norm, x1,y1,z1, x1,y2,z1, r,g,b,a);
        line(consumer, mat, norm, x2,y1,z1, x2,y2,z1, r,g,b,a);
        line(consumer, mat, norm, x2,y1,z2, x2,y2,z2, r,g,b,a);
        line(consumer, mat, norm, x1,y1,z2, x1,y2,z2, r,g,b,a);
    }

    private static void line(com.mojang.blaze3d.vertex.VertexConsumer c,
                              Matrix4f mat, Matrix3f norm,
                              float x1, float y1, float z1,
                              float x2, float y2, float z2,
                              float r, float g, float b, float a) {
        float dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
        float len = (float) Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (len > 0) { dx /= len; dy /= len; dz /= len; }
        c.vertex(mat, x1, y1, z1).color(r, g, b, a).normal(norm, dx, dy, dz).endVertex();
        c.vertex(mat, x2, y2, z2).color(r, g, b, a).normal(norm, dx, dy, dz).endVertex();
    }
}
