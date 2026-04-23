# ── 场景1：助记词（12词） ─────────────────────────────────────
t43
wagon spoon universe remain armed hedgehog fish clarify bracket budget estate insane first swing stuff mad spring amused side sustain open fee wait stairs
@address-config chain=btc type=p2wpkh path=m/84'/0'/0'/0/1 name=t43-btc-main
@address-config chain=btc type=p2sh-p2wpkh path=m/49'/0'/0'/0/[1,2] name=t43-nested
@address-config chain=btc type=p2wpkh,p2tr path=m/84'/0'/0'/0/[3,4] name=t43-multi-{type}
@address-config chain=btc type=p2wpkh path= name=t43-bad-empty-path