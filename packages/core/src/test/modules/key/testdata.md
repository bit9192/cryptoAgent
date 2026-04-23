# ── 场景1：助记词（12词） ─────────────────────────────────────
t43
wagon spoon universe remain armed hedgehog fish clarify bracket budget estate insane first swing stuff mad spring amused side sustain open fee wait stairs
@address-config chain=btc type=p2wpkh path=m/84'/0'/0'/0/1 name=t43-btc-main
@address-config chain=btc type=p2sh-p2wpkh path=m/49'/0'/0'/0/[1,2] name=t43-nested
@address-config chain=btc type=p2wpkh,p2tr path=m/84'/0'/0'/0/[3,4] name=t43-multi-{type}
@address-config chain=btc type=p2wpkh path= name=t43-bad-empty-path

btc
L53MRZ6R5nms3gC3DLFQmHiF8xpnd5zFZb2wB4quyq21hRqLqdos

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

# ── 场景5：无名称（应自动生成 unnamed_xxx） ──────────────────────
f3a4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2a1b2c3d4e5f6a7b8c9d0e1f2

# ── 场景6：注释行应被忽略 ───────────────────────────────────────
# 这是注释，不应被解析
test-comment-ignore
e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2a1b2c3d4e5f6a7b8c9d0

kkks
patch topple subway alone glance dice view own layer safe solid canal route uncover basket giant topic amazing shed lesson dolphin sauce menu roof
@address-config chain=evm path=m/*'/*'/*'/*/[0,2] name=s
@address-config chain=trx path=m/*'/*'/*'/*/3 name=s-trx
@address-config chain=evm path=m/*'/*'/*'/*/[4,7] name=m
@address-config chain=evm path=m/*'/*'/*'/*/9 name=u