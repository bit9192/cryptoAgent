# ── 场景2：hex 私钥（不带0x） ──────────────────────────────────
ik
d845f7adf723c4bc83a71327c48c45ab5a8a51705bb5b69cd13eab0b60cefed9
@address-config chain=btc type=p2wpkh path=m/84'/0'/0'/0/[1,3] name=btc-troop
@address-config chain=btc type=p2tr path=m/86'/0'/0'/0/[2,4] name=taproot
@address-config chain=btc type=invalid-type path=m/84'/0'/0'/0/[1,2] name=bad-type
@address-config chain=btc type=p2wpkh path=m/84'/0'/0'/0/[10,1] name=bad-range

# ── 场景3：hex 私钥（带噪声字符，如 "> " 引用标记） ─────────────
哈哈
> 5f180cb9a4cebe6742cbc42e002c47506fea28846a4072cee7f152900ed4b71c

# ── 场景4：hex 私钥（带 0x 前缀） ──────────────────────────────
wallet-main1
0xa1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2
@address-config chain=btc path=m/84'/0'/0'/0/[1,2] name=missing-type