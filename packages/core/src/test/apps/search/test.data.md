# tokens
ordi
sats
rats
UNI
uni
usdt
arkm
sei
sun
trx
bnb
eth
btc
crv
cvx
vusdt
usdc

### bsc

- 0x23fe903be385832fd7bb82bf1fee93f696278888
- 0xfdc66a08b0d0dc44c17bbd471b88f49f50cdd20f
- 0xb8a677e6d805c8d743e6f14c8bc9c19305b5defc
- 0xac51066d7bec65dc4589368da368b212745d63e8
- 0x8dedf84656fa932157e27c060d8613824e7979e3
- 0xda05ca5303d75f14e298fb8aeff51fd2f2105803
- 0x72449ED79841981B19d4552861007A63Da3963fE
- 0x55d398326f99059ff775485246999027b3197955
- 0xfd5840cd36d94d7229439859c0112a4185bc0255

### bsc old
- 0xfC69c8a4192130F5d3295876BeC43F22704DF1E2

### bsc multi route
- 0xF89712b7C0b6136E1436a8c4E3f4B9C1a1276dfC
- 0xc353950E65Ad19D4FC57Ce655Be474831ADC26Cc

### eth

- 0x44e89d34601b8d0155e16634d2553ef7f54dbab2
- 0xcb84d72e61e383767c4dfeb2d8ff7f4fb89abc6e
- 0x84018071282d4B2996272659D9C01cB08DD7327F
- 0xfd1450a131599ff34f3be1775d8c8bf79e353d8c
- 0x777172d858dc1599914a1c4c6c9fc48c99a60990
- 0x55a380d134d722006A5CE2d510562e1239D225B1
- 0x7483e83b481c69a93cb025395194e0dc4F32d9C4
- 0xdac17f958d2ee523a2206206994597c13d831ec7
- 0x39AA39c021dfbaE8faC545936693aC917d5E7563

### trc20
TUjwNG28iEa18s8WVnbxChu7g6SN2VCxUP
TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t
TMacq4TDUw5q8NFBwmbY4RLXvzvG5JTkvi

### nile
TU1ntBzpGPp7GJkzxLTKwYsneJ9JKUmBCK

# addresses
TGiadwLepcnXD8RMsT9ZrhaA4JL9A7be8h
TP3wnPRXr7zUWExZXb4qKxjfGHBgTkC15N
TPsMJ3BE9ixSQ7guFbVLZ4eou6SATBSqHH

bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6
bc1ps793rn2savj7u7stawzly7uua62nuay7pzq027ck8hfrdzffdnnqf3gegf
1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa
1EYTGtG4LnFfiMvjJdsU7GMGCQvsRSjYhx
## btc P2PK
04bff063a080c07aa9d8e7038c9d1bd7e5076fc28dd3e905b76517ad958e9df65e83abefcdbdcd7310231aaaf16a53e9bc24598826a3291e5dab338675618e7f12

0x63320F728777d332a1F1031019481A94144779fB
0xed70EBC39d5445FeBccc96B60E88bC0D2B6dfD9c
0x120a951B11AA88E17CF121b71108b293e2307c8d
0x6Fb8aa6fc6f27e591423009194529aE126660027
0x436693FF266F9E495dbD1DCa2f48B65B03Dc0198



## token risk test

### happy (EVM)
# ETH mainnet - USDT (大市值稳定币，low risk)
chain: evm
network: eth
tokenAddress: 0xdac17f958d2ee523a2206206994597c13d831ec7

# BSC mainnet - USDT (已知安全)
chain: evm
network: bsc
tokenAddress: 0x55d398326f99059ff775485246999027b3197955

### edge (unsupported chain)
# BTC → 不支持，返回 notSupported
chain: btc
network: mainnet
tokenAddress: 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa

# TRX → 不支持，返回 notSupported
chain: trx
network: mainnet
tokenAddress: TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t

### invalid
# 缺少 tokenAddress → 应抛错或返回 error
chain: evm
network: eth
tokenAddress: (empty)

# 非法地址格式 → 应抛错
chain: evm
network: eth
tokenAddress: not-an-address

### happy

SUN USDT TRX
TPsMJ3BE9ixSQ7guFbVLZ4eou6SATBSqHH
TLaGjwhvA8XQYSxFAcAXy7Dvuue9eGYitv

ORDI SATS BTC
bc1ps793rn2savj7u7stawzly7uua62nuay7pzq027ck8hfrdzffdnnqf3gegf
bc1p8w6zr5e2q60s0r8al4tvmsfer77c0eqc8j55gk8r7hzv39zhs2lqa8p0k6
1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa

usdt bnb eth 
0x6Fb8aa6fc6f27e591423009194529aE126660027
0x436693FF266F9E495dbD1DCa2f48B65B03Dc0198

### edge

BTC
04bff063a080c07aa9d8e7038c9d1bd7e5076fc28dd3e905b76517ad958e9df65e83abefcdbdcd7310231aaaf16a53e9bc24598826a3291e5dab338675618e7f12

ETH
0x63320F728777d332a1F1031019481A94144779fB

### invalid

not-an-address
0x1234
T111111111111111111111111111111111

## token price

btc: ordi sats rats btc
trx: trx usdt sun
eth: dog cusd armk crv
bsc: usdt bnb folk cake

## fuzzy
fxs, cvx, aave

## network scope config

### chain provider contract

- input: `chain + scope`
- output: `networks[]`
- search/task/run must not map scope by chain themselves

### btc provider

- mainnet -> [mainnet]
- testnet -> [testnet]
- fork -> [regtest]

### trx provider

- mainnet -> [mainnet]
- testnet -> [nile]
- fork -> [nile]

### evm provider

- mainnet -> from config dynamic list, expected includes eth / bsc
- testnet -> [fork]
- fork -> [fork]

### config rules

- per-chain scope expansion belongs to chain provider, not search central switch
- EVM mainnet networks must be generated from config metadata, not hardcoded in task/run/search
- scope means environment class, not always equal to final network name
- adding a new chain should require provider registration only
