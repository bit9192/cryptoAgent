import test from "node:test";
import assert from "node:assert/strict";

import { createSssShareBundle, recoverSecretFromSssShares } from "../../../modules/key/sss.mjs";

test("SSS 分片与恢复：2/3 可恢复原 secret", () => {
  const secretHex = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
  const bundle = createSssShareBundle({
    secretHex,
    threshold: 2,
    sharesCount: 3,
    label: "unit-test",
  });

  assert.equal(bundle.threshold, 2);
  assert.equal(bundle.sharesCount, 3);
  assert.equal(bundle.shares.length, 3);

  const recovered = recoverSecretFromSssShares({
    bundle,
    shareHexList: [bundle.shares[0].shareHex, bundle.shares[2].shareHex],
  });

  assert.equal(recovered.secretHex, secretHex);
  assert.equal(recovered.groupId, bundle.groupId);
});

test("SSS 恢复：分片不足时应报错", () => {
  const secretHex = "ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100";
  const bundle = createSssShareBundle({
    secretHex,
    threshold: 3,
    sharesCount: 5,
  });

  assert.throws(() => {
    recoverSecretFromSssShares({
      bundle,
      shareHexList: [bundle.shares[0].shareHex, bundle.shares[1].shareHex],
    });
  }, /至少需要/);
});
