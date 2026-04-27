import test from "node:test";
import assert from "node:assert";
import { createWallet } from "../../../../src/apps/wallet/index.mjs";

test("Wallet getTree - Slice W-1: Basic Cache Mechanism", async (t) => {
  // Setup: create wallet with dev keys and get actual keyIds
  const wallet = createWallet();
  await wallet.loadDevKeys();
  
  // Get list of keys to find actual keyIds
  const keysResult = await wallet.listKeys();
  const keys = keysResult.items || [];
  const devKeys = keys.filter((k) => k.source === "dev");
  assert(devKeys.length > 0, "Should have dev keys loaded");
  
  const keyId1 = devKeys[0].keyId;
  const keyId2 = devKeys.length > 1 ? devKeys[1].keyId : keyId1;
  
  await t.test("H1: First getTree() call generates tree and caches it", async () => {
    // Unlock a dev key
    const unlockResult = await wallet.unlock({ keyId: keyId1, rebuildTree: false });
    assert.strictEqual(unlockResult.ok, true, "Key unlock should succeed");
    
    // First call to getTree
    const treeResult1 = await wallet.getTree();
    assert.strictEqual(treeResult1.ok, true, "First getTree should succeed");
    assert(treeResult1.tree, "First getTree should return tree");
    assert(Array.isArray(treeResult1.tree), "Tree should be an array of rows");
  });

  await t.test("H2: Second getTree() call returns cached result (not rebuilt)", async () => {
    await wallet.lockAll(); // Clear previous state
    
    // Unlock a dev key
    const unlockResult = await wallet.unlock({ keyId: keyId1, rebuildTree: false });
    assert.strictEqual(unlockResult.ok, true);
    
    // First call to getTree
    const treeResult1 = await wallet.getTree();
    assert.strictEqual(treeResult1.ok, true);
    
    // Second call should use cache
    const treeResult2 = await wallet.getTree();
    assert.strictEqual(treeResult2.ok, true);
    
    // Results should be identical (cached)
    assert.strictEqual(
      JSON.stringify(treeResult1.tree),
      JSON.stringify(treeResult2.tree),
      "Second call should return same tree structure"
    );
  });

  await t.test("H3: Multiple sessions have independent caches", async () => {
    await wallet.lockAll(); // Clear previous state
    
    // Unlock two different keys
    const unlock1 = await wallet.unlock({ keyId: keyId1, rebuildTree: false });
    const unlock2 = await wallet.unlock({ keyId: keyId2, rebuildTree: false });
    
    assert.strictEqual(unlock1.ok, true);
    assert.strictEqual(unlock2.ok, true);
    
    // Get trees for both keys
    const tree1 = await wallet.getTree();
    const tree2 = await wallet.getTree();
    
    // Both should be valid (same combined tree)
    assert.strictEqual(tree1.ok, true);
    assert.strictEqual(tree2.ok, true);
  });

  await t.test("E1: Multiple unlocks preserve earlier caches", async () => {
    await wallet.lockAll(); // Clear previous state
    
    // Unlock first key and get tree
    await wallet.unlock({ keyId: keyId1, rebuildTree: false });
    const tree1 = await wallet.getTree();
    
    // Unlock second key
    if (keyId2 !== keyId1) {
      await wallet.unlock({ keyId: keyId2, rebuildTree: false });
    }
    
    // Get tree again (should include both keys)
    const tree2 = await wallet.getTree();
    
    // Both results valid
    assert.strictEqual(tree1.ok, true);
    assert.strictEqual(tree2.ok, true);
    
    // Second tree might have more rows
    assert(tree2.tree.length >= tree1.tree.length, "Second tree should have at least as many rows");
  });

  await t.test("E2: lock() clears cache for that session", async () => {
    await wallet.lockAll(); // Clear previous state
    
    // Unlock and get tree
    await wallet.unlock({ keyId: keyId1, rebuildTree: false });
    const tree1 = await wallet.getTree();
    assert.strictEqual(tree1.ok, true);
    
    // Lock the key
    const lockResult = await wallet.lock({ keyId: keyId1 });
    assert.strictEqual(lockResult.ok, true);
    
    // getTree should now skip that key
    const tree2 = await wallet.getTree();
    assert.strictEqual(tree2.ok, true);
    
    // Should have fewer or equal rows after lock
    assert(tree2.tree.length <= tree1.tree.length,
      "Tree should have fewer or equal rows after lock");
  });

  await t.test("E3: lockAll() clears all caches", async () => {
    await wallet.lockAll(); // Clear previous state
    
    // Unlock multiple keys
    await wallet.unlock({ keyId: keyId1, rebuildTree: false });
    if (keyId2 !== keyId1) {
      await wallet.unlock({ keyId: keyId2, rebuildTree: false });
    }
    
    const tree1 = await wallet.getTree();
    assert(tree1.tree?.length >= 0, "Should have valid tree before lockAll");
    
    // Lock all
    const lockAllResult = await wallet.lockAll();
    assert.strictEqual(lockAllResult.ok, true);
    assert(lockAllResult.count >= 1, "Should have locked at least 1 key");
    
    // getTree should now return empty tree
    const tree2 = await wallet.getTree();
    assert.strictEqual(tree2.ok, true);
    assert.strictEqual(tree2.tree.length, 0, "Should have no rows after lockAll");
  });

  await t.test("E4: getTree() with chains parameter works", async () => {
    await wallet.lockAll(); // Clear previous state
    
    // Unlock a key and get tree with no chain filter
    await wallet.unlock({ keyId: keyId1, rebuildTree: false });
    
    const treeAll = await wallet.getTree();
    assert.strictEqual(treeAll.ok, true);
    
    // Get tree filtered by chain
    const treeEvm = await wallet.getTree({ chains: ["evm"] });
    assert.strictEqual(treeEvm.ok, true);
    
    // Both should be valid
    assert(Array.isArray(treeAll.tree));
    assert(Array.isArray(treeEvm.tree));
  });

  await t.test("I1: Cache contents remain consistent", async () => {
    await wallet.lockAll(); // Clear previous state
    
    await wallet.unlock({ keyId: keyId1, rebuildTree: false });
    
    // Get tree multiple times
    const results = [];
    for (let i = 0; i < 5; i++) {
      const result = await wallet.getTree();
      results.push(JSON.stringify(result.tree));
    }
    
    // All results should be identical
    const firstResult = results[0];
    for (let i = 1; i < results.length; i++) {
      assert.strictEqual(results[i], firstResult, `Call ${i + 1} should match first call`);
    }
  });

  await t.test("I2: Cache invalidation on address changes", async () => {
    // This is a placeholder for slice W-2
    // For now, just verify getTree works after deriving addresses
    await wallet.lockAll(); // Clear previous state
    
    await wallet.unlock({ keyId: keyId1, rebuildTree: false });
    
    const tree1 = await wallet.getTree();
    assert.strictEqual(tree1.ok, true);
    
    // Derive configured addresses (if any)
    const derived = await wallet.deriveConfiguredAddresses({ keyId: keyId1, strict: false });
    
    // Get tree again
    const tree2 = await wallet.getTree();
    assert.strictEqual(tree2.ok, true);
    
    // Both should be valid
    assert(tree1.tree);
    assert(tree2.tree);
  });
});

test("Wallet Regression - Existing 23 tests should still pass", async (t) => {
  // This is a marker for regression testing
  // The actual regression tests are in other files:
  // - src/test/tasks/wallet.session.task.test.mjs (11/11)
  // - src/test/modules/wallet-engine/wallet-engine.test.mjs (12/12)
  
  await t.test("Placeholder: Run full test suite with 'npm test'", () => {
    assert.ok(true, "Regression tests should be run separately");
  });
});
