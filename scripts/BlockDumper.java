package com.example.blockdumper;

import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraftforge.fml.common.Mod;
import net.minecraftforge.fml.event.lifecycle.FMLCommonSetupEvent;
import net.minecraftforge.fml.javafmlmod.FMLJavaModLoadingContext;
import net.minecraft.world.phys.shapes.VoxelShape;
import net.minecraft.core.BlockPos;
import net.minecraft.world.phys.shapes.CollisionContext;
import net.minecraft.world.level.EmptyBlockGetter;

import java.io.FileWriter;
import java.io.IOException;
import java.util.HashMap;
import java.util.Map;

@Mod("blockdumper")
public class BlockDumper {

    public BlockDumper() {
        FMLJavaModLoadingContext.get().getModEventBus().addListener(this::setup);
    }

    private void setup(final FMLCommonSetupEvent event) {
        event.enqueueWork(() -> {
            Map<String, Map<String, Object>> blockData = new HashMap<>();

            for (Block block : BuiltInRegistries.BLOCK) {
                String registryName = BuiltInRegistries.BLOCK.getKey(block).toString();
                BlockState defaultState = block.defaultBlockState();

                Map<String, Object> properties = new HashMap<>();

                // Using standard methods available in Block/BlockState classes
                // The exact method names may vary slightly by mapping, but these are typical mappings (like Mojang mappings)
                try {
                    properties.put("solid", defaultState.isSolidRender(EmptyBlockGetter.INSTANCE, BlockPos.ZERO)); // or standard solid check
                } catch (Exception e) {
                    properties.put("solid", false); // safe fallback
                }

                // For collision box, check if it's empty
                try {
                    VoxelShape collisionShape = defaultState.getCollisionShape(EmptyBlockGetter.INSTANCE, BlockPos.ZERO, CollisionContext.empty());
                    boolean hasCollision = !collisionShape.isEmpty();
                    properties.put("boundingBox", hasCollision ? "block" : "empty");
                } catch (Exception e) {
                    properties.put("boundingBox", "empty"); // safe fallback
                }

                // Some general approximations if specific mapped methods aren't available
                // We will use standard Block properties we know exist.
                try {
                    properties.put("hardness", defaultState.getDestroySpeed(EmptyBlockGetter.INSTANCE, BlockPos.ZERO));
                } catch (Exception e) {
                    properties.put("hardness", 1.0f);
                }

                try {
                    properties.put("transparent", !defaultState.isSolidRender(EmptyBlockGetter.INSTANCE, BlockPos.ZERO)); // Basic proxy for transparency
                } catch (Exception e) {
                    properties.put("transparent", true);
                }

                blockData.put(registryName, properties);
            }

            try (FileWriter writer = new FileWriter("mod_blocks_dictionary.json")) {
                Gson gson = new GsonBuilder().setPrettyPrinting().create();
                gson.toJson(blockData, writer);
            } catch (IOException e) {
                e.printStackTrace();
            }
        });
    }
}
