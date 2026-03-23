const mcData = require('minecraft-data')('1.20.1');

function resolveRequiredMaterials(targetItemName, initialQuantity, inventoryMap = {}) {
    const required = {};
    // Clone inventory to keep track of what we consume during resolution
    const available = { ...inventoryMap };

    function consume(name, amount) {
        let remaining = amount;
        if (available[name]) {
            const used = Math.min(available[name], remaining);
            available[name] -= used;
            remaining -= used;
        }

        // Hack for fungible generic materials
        if (name === 'oak_log' && remaining > 0) {
            for (const logName of Object.keys(available).filter(n => n.endsWith('_log') || n.endsWith('_wood'))) {
                if (available[logName] > 0) {
                    const used = Math.min(available[logName], remaining);
                    available[logName] -= used;
                    remaining -= used;
                }
                if (remaining <= 0) break;
            }
        } else if (name === 'oak_planks' && remaining > 0) {
            for (const plankName of Object.keys(available).filter(n => n.endsWith('_planks'))) {
                if (available[plankName] > 0) {
                    const used = Math.min(available[plankName], remaining);
                    available[plankName] -= used;
                    remaining -= used;
                }
                if (remaining <= 0) break;
            }
        }
        return remaining;
    }

    function recurse(itemName, qty, path = []) {
        if (qty <= 0) return;

        if (path.includes(itemName)) {
            required[itemName] = (required[itemName] || 0) + qty;
            return;
        }

        const remainingQty = consume(itemName, qty);
        if (remainingQty <= 0) return;

        const item = mcData.itemsByName[itemName] || mcData.blocksByName[itemName];
        if (!item) {
            required[itemName] = (required[itemName] || 0) + remainingQty;
            return;
        }

        const recipes = mcData.recipes[item.id];
        if (!recipes || recipes.length === 0) {
            required[itemName] = (required[itemName] || 0) + remainingQty;
            return;
        }

        const baseMaterials = [
            'iron_ingot', 'gold_ingot', 'copper_ingot', 'netherite_ingot',
            'coal', 'charcoal', 'diamond', 'emerald', 'lapis_lazuli', 'redstone',
            'quartz', 'flint', 'clay_ball', 'glowstone_dust', 'string', 'feather',
            'gunpowder', 'leather', 'rabbit_hide', 'blaze_rod', 'ender_pearl',
            'ghast_tear', 'slime_ball', 'magma_cream', 'nether_wart', 'bone',
            'spider_eye', 'rotten_flesh', 'phantom_membrane'
        ];

        // Stop recursion at fungible or fundamental raw materials
        if (baseMaterials.includes(itemName) || itemName.endsWith('_log') || itemName.endsWith('_wood') || itemName.endsWith('_planks') || itemName === 'stick') {
            required[itemName] = (required[itemName] || 0) + remainingQty;
            return;
        }

        let bestRecipe = null;
        for (const r of recipes) {
            let createsCycle = false;
            let isUncrafting = false;

            const getIngs = (recipe) => {
                const ings = [];
                if (recipe.ingredients) {
                    for (const ing of recipe.ingredients) ings.push(Array.isArray(ing) ? ing[0] : ing);
                } else if (recipe.inShape) {
                    for (const row of recipe.inShape) {
                        for (const ing of row) ings.push(Array.isArray(ing) ? ing[0] : ing);
                    }
                }
                return ings;
            };

            const ings = getIngs(r);
            // Heuristic for uncrafting: yielding > 1 of item from EXACTLY 1 ingredient.
            // Also, we don't want to use recipes that uncraft a block back into 9 ingots OR 9 nuggets.
            if (r.result && r.result.count > 1 && new Set(ings).size === 1) {
                isUncrafting = true;
            }

            for (const ingId of ings) {
                const ingItem = mcData.items[ingId] || mcData.blocks[ingId];
                if (ingItem && path.includes(ingItem.name)) createsCycle = true;
            }

            if (!createsCycle && !isUncrafting) {
                if (!bestRecipe) {
                    bestRecipe = r;
                } else {
                    const getNames = (ingsList) => ingsList.map(id => (mcData.items[id] || mcData.blocks[id] || {}).name).filter(Boolean);
                    const isOakPreferable = (names) => names.some(n => n.includes('oak')) && !names.some(n => n.includes('bamboo'));

                    const currentNames = getNames(ings);
                    const bestNames = getNames(getIngs(bestRecipe));

                    if (isOakPreferable(currentNames) && !isOakPreferable(bestNames)) {
                        bestRecipe = r;
                    }
                }
            }
        }

        if (!bestRecipe) {
            required[itemName] = (required[itemName] || 0) + remainingQty;
            return;
        }

        const recipeYield = bestRecipe.result ? bestRecipe.result.count : 1;
        const craftsNeeded = Math.ceil(remainingQty / recipeYield);
        const newPath = [...path, itemName];

        let hasIngredients = false;
        if (bestRecipe.ingredients) {
            hasIngredients = true;
            for (const ing of bestRecipe.ingredients) {
                const ingId = Array.isArray(ing) ? ing[0] : ing;
                const ingItem = mcData.items[ingId] || mcData.blocks[ingId];
                if (ingItem) recurse(ingItem.name, craftsNeeded, newPath);
            }
        } else if (bestRecipe.inShape) {
            hasIngredients = true;
            const ingCounts = {};
            for (const row of bestRecipe.inShape) {
                for (const ing of row) {
                    const ingId = Array.isArray(ing) ? ing[0] : ing;
                    const ingItem = mcData.items[ingId] || mcData.blocks[ingId];
                    if (ingItem) ingCounts[ingItem.name] = (ingCounts[ingItem.name] || 0) + 1;
                }
            }
            for (const [ingName, ingQty] of Object.entries(ingCounts)) {
                recurse(ingName, ingQty * craftsNeeded, newPath);
            }
        }

        if (!hasIngredients) {
            required[itemName] = (required[itemName] || 0) + remainingQty;
        }
    }

    recurse(targetItemName, initialQuantity);
    return required;
}

console.log(resolveRequiredMaterials('iron_pickaxe', 1, { stick: 2 }));
console.log(resolveRequiredMaterials('dispenser', 1, { bow: 1 }));
console.log(resolveRequiredMaterials('iron_ingot', 1));
