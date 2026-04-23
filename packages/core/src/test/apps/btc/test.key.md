side dog pig sausage retire trap voyage wool fox awake ripple defense remove bright palm unknown rail grocery embody recipe absurd rude boat useless

# BTC test vectors

说明：
- 第一行必须保持为助记词，现有脚本会直接读取第一行。
- 下方地址由当前仓库的 BTC 派生逻辑生成，可作为回归测试基线。
- Bitcoin Core 可导入派生后的 key/descriptors，但这份文件里的助记词与地址矩阵是当前框架侧生成和整理的。

## Path 规则

- `p2pkh`: mainnet `m/44'/0'/0'/0/i`，testnet/regtest `m/44'/1'/0'/0/i`
- `p2sh-p2wpkh`: mainnet `m/49'/0'/0'/0/i`，testnet/regtest `m/49'/1'/0'/0/i`
- `p2wpkh`: mainnet `m/84'/0'/0'/0/i`，testnet/regtest `m/84'/1'/0'/0/i`
- `p2tr`: mainnet `m/86'/0'/0'/0/i`，testnet/regtest `m/86'/1'/0'/0/i`

## Mainnet

| id | type | path | address |
| --- | --- | --- | --- |
| 0 | p2pkh | m/44'/0'/0'/0/0 | 1Pv6K53HSbXVdjFPdL9PLUm46SiZZvwMKg |
| 1 | p2pkh | m/44'/0'/0'/0/1 | 122LkK2GEaWMgtjE57b4G1izAT6K8sqBnX |
| 0 | p2sh-p2wpkh | m/49'/0'/0'/0/0 | 39vqbVsLHuFav7S74vagQo7TeGAzJH2rPG |
| 1 | p2sh-p2wpkh | m/49'/0'/0'/0/1 | 3G4SrWFjjTMAv1famnAST6pxuynSqZLbQc |
| 0 | p2wpkh | m/84'/0'/0'/0/0 | bc1qah24v94c3l0qm8e9l7a55y8r5zypx6nx53j88y |
| 1 | p2wpkh | m/84'/0'/0'/0/1 | bc1qujm2cvze6qy5hask4c3pcjj8kw52ggk2pd97cy |
| 0 | p2tr | m/86'/0'/0'/0/0 | bc1pypnf0zx2ql6jsvd876nek349y8n5gz3f8xa2qm205vxw4evc58nq88q739 |
| 1 | p2tr | m/86'/0'/0'/0/1 | bc1pkqk8g6xrx9p5f7pes56qrhgus2tdupmh9cc0hycvgatddysj5pzsc0zdh9 |


## Testnet

| id | type | path | address |
| --- | --- | --- | --- |
| 0 | p2pkh | m/44'/1'/0'/0/0 | mst17ksxiY6Z5mHnnuBqUiZ2AQL3TiJH8P |
| 1 | p2pkh | m/44'/1'/0'/0/1 | ms8as5qTkKUNDkKFeg3a1VuWtMYNXPfGu2 |
| 0 | p2sh-p2wpkh | m/49'/1'/0'/0/0 | 2N5ytgTQ84z2TQN9kEX2ydJsHjcy2qR6ad6 |
| 1 | p2sh-p2wpkh | m/49'/1'/0'/0/1 | 2NB1ni469UUmJm17fv2F5EALG9pwPwCNrEW |
| 0 | p2wpkh | m/84'/1'/0'/0/0 | tb1qe38akah45pc230agwmzx5wawwxrs0v429hws9e |
| 1 | p2wpkh | m/84'/1'/0'/0/1 | tb1qaj7xjx360uzkd88kclp2pmv2qj0g6dkycv3spc |
| 0 | p2tr | m/86'/1'/0'/0/0 | tb1pk6qs37n2awsscuavqp2rmcpqlhpvzjfytp00nslhg8ql5cmdp7ws6pwhvv |
| 1 | p2tr | m/86'/1'/0'/0/1 | tb1pcwc7dnht3kvc2cseujcwdnrqutwjshfd8pp89lxtvtaf3g5uxuks5d77u8 |

## Regtest

| id | type | path | address |
| --- | --- | --- | --- |
| 0 | p2pkh | m/44'/1'/0'/0/0 | mst17ksxiY6Z5mHnnuBqUiZ2AQL3TiJH8P |
| 1 | p2pkh | m/44'/1'/0'/0/1 | ms8as5qTkKUNDkKFeg3a1VuWtMYNXPfGu2 |
| 0 | p2sh-p2wpkh | m/49'/1'/0'/0/0 | 2N5ytgTQ84z2TQN9kEX2ydJsHjcy2qR6ad6 |
| 1 | p2sh-p2wpkh | m/49'/1'/0'/0/1 | 2NB1ni469UUmJm17fv2F5EALG9pwPwCNrEW |
| 0 | p2wpkh | m/84'/1'/0'/0/0 | bcrt1qe38akah45pc230agwmzx5wawwxrs0v4287hajs |
| 1 | p2wpkh | m/84'/1'/0'/0/1 | bcrt1qaj7xjx360uzkd88kclp2pmv2qj0g6dky69gak3 |
| 0 | p2tr | m/86'/1'/0'/0/0 | bcrt1pk6qs37n2awsscuavqp2rmcpqlhpvzjfytp00nslhg8ql5cmdp7wshcy3ek |
| 1 | p2tr | m/86'/1'/0'/0/1 | bcrt1pcwc7dnht3kvc2cseujcwdnrqutwjshfd8pp89lxtvtaf3g5uxukse55cfa |