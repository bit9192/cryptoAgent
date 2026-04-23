
import { walletList } from "./wallet/wallet-list.mjs"
import { extractData } from "../modules/data-engine/index.mjs"

import {
    unlockWallets,
    unlockDev
} from "./wallet/unlock.mjs"
import { createBtcProvider } from "../apps/btc/provider.mjs";


export async function run({
    network,
    wallet,
    confirm,
    interact,
    args
}) {
    const listed = await walletList()

    const chainState = await wallet.listChains();
    console.log(
        chainState, " chainState"
    )

    // 展示本地可见钱包文件：按当前 session 分为已解锁/未解锁
    let unlockedSourceFiles = new Set()
    if (wallet && typeof wallet.listKeys === "function") {
        try {
            const keyState = await wallet.listKeys({ enabled: true })
            unlockedSourceFiles = new Set(
                (keyState.items ?? [])
                    .filter((item) => item.status === "unlocked" && item.source !== "dev")
                    .map((item) => String(item.sourceFile ?? "").trim())
                    .filter(Boolean)
            )
        } catch {
            // 非关键路径：状态获取失败时退化为全部“未解锁”展示
        }
    }
    
		

    const unlockedItems = listed.items.filter((item) => unlockedSourceFiles.has(item.rel))
    const lockedItems = listed.items.filter((item) => !unlockedSourceFiles.has(item.rel))

    console.log("[wallet files] 已解锁")
    console.table(unlockedItems.map((v) => ({ shortName: v.shortName, rel: v.rel })))
    console.log("[wallet files] 未解锁")
    console.table(lockedItems.map((v) => ({ shortName: v.shortName, rel: v.rel })))

    // 1) 获取筛选关键词（支持 args.name 直传）
    let walletNames = String(args?.name ?? "").trim()
    if (!walletNames && typeof interact === "function") {
        const pick = await interact({
            type: "wallet.filter.input",
            fields: [
                {
                    name: "walletNames",
                    type: "text",
                    label: "请输入要解锁的钱包名称关键词",
                    message: "例如: h / demo / btc",
                },
            ],
        })
        const payload = pick?.payload ?? pick
        walletNames = String(payload?.walletNames ?? "").trim()
    }

    // 2) 按关键词选出目标钱包文件（空关键词=全选）
    const filters = walletNames
        ? [{ field: "shortName", op: "contains", value: walletNames }]
        : []
    const matched = extractData({
        input: { items: listed.items },
        sourcePath: "items[*]",
        filters,
    })

    const paths = matched.map(v => v.abs)
    if (paths.length === 0) {
        return {
            ok: false,
            filterByName: walletNames,
            total: listed.total,
            matched: [],
            message: "未匹配到需要解锁的钱包文件",
        }
    }

    console.table(paths)

    // 3) 获取密码（支持 args.password 直传）
    let password = String(args?.password ?? "").trim()
    if (!password && typeof interact === "function") {
        const interaction = await interact({
            type: "wallet.password.input",
            fields: [
                {
                    name: "password",
                    type: "password",
                    label: "请输入密码",
                    message: "用于解锁选中的钱包文件",
                },
            ],
        })
        const payload = interaction?.payload ?? interaction
        password = String(payload?.password ?? "").trim()
    }
    if (!password) {
        return {
            ok: false,
            filterByName: walletNames,
            total: listed.total,
            matched,
            message: "未提供密码，取消解锁",
        }
    }

    // 4) 二次确认（可选）
    if (typeof confirm === "function") {
        const approved = await confirm({
            message: `将解锁 ${paths.length} 个钱包文件，是否继续？`,
            level: "warn",
        })
        if (!approved) {
            return {
                ok: false,
                filterByName: walletNames,
                total: listed.total,
                matched,
                message: "用户取消解锁",
            }
        }
    }

    // 5) 解锁文件钱包 + dev 钱包
    const unlocked = await unlockWallets(wallet, paths, password)
    const devs = await unlockDev(wallet)
    // 6) 打印解锁摘要
    // console.log({
    //     fileWalletUnlock: {
    //         ok: unlocked.ok,
    //         totalRequested: unlocked.totalRequested,
    //         totalUnlocked: unlocked.totalUnlocked,
    //         totalFailed: unlocked.totalFailed,
    //         unlockedFails: unlocked.unlockedFails,
    //     },
    //     devUnlock: {
    //         ok: devs.ok,
    //         totalUnlocked: devs.totalUnlocked,
    //     },
    // })

    try {
        await wallet.registerProvider({ provider: createBtcProvider() });
    } catch (error) {
        console.log(error.message)
    }
    
    console.log(
        unlocked, " wallet"
    )

    const signerRes = await wallet.getSigner({
        chain: "btc",
        keyId: "eba6db0d1919d1f5fc0c3af1",
    })

    // console.log(
    //     signerRes
    // )

    // const address = await signerRes.signer.getAddress();
    // type=p2sh-p2wpkh path=m/49'/0'/0'/0/[1,2]
    console.log(
        await signerRes.signer.getAddress({
            addressType: "p2sh-p2wpkh",
            paths: [
                "m/49'/0'/0'/0/1",
                "m/49'/0'/0'/0/2",
            ],

        }),
        await signerRes.signer.getAddress({
            addressType: "p2wpkh",
            paths: ["m/111'/0'/111'/0/1"],
        })
    )

    // 打印所有配置地址
    const configuredAddrs = await wallet.deriveConfiguredAddresses({
        // keyId: "782e9feb9a77975581b528fe"
    })
    
    console.log("[configured addresses] total:", configuredAddrs.items.length ?? 0)
    for (const item of configuredAddrs.items) {
        console.log(`  [${item.keyId ?? item.keyName}] ${item.name ?? ""} ${item.addressType ?? ""} ${item.path ?? ""} => ${item.address}`)
    }
    if (configuredAddrs.warnings?.length) {
        console.log("[configured addresses] warnings:", configuredAddrs.warnings)
    }

    return {}
    // 7) 组装返回结果
    const result = {
        ok: unlocked.ok,
        filterByName: walletNames,
        total: listed.total,
        matched,
        wallet: {
            hd: unlocked.hd,
            key: unlocked.key,
            hdList: unlocked.hdList,
            keyList: unlocked.keyList,
            unlockedFails: unlocked.unlockedFails,
            warnings: unlocked.warnings,
        },
        dev: {
            devHd: devs.devHd,
            devKey: devs.devKey,
            devHdList: devs.devHdList,
            devKeyList: devs.devKeyList,
            warnings: devs.warnings,
        }
    }

    return result
}