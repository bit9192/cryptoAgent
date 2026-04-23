/**
 * BTC Write APIs
 *
 * btcTxBuild    — 构建未签名 PSBT（含 UTXO 选择与找零）
 * btcTxSign     — 通过 wallet signer 签名 PSBT
 * btcTxBroadcast— 广播已签名交易
 *
 * 使用流程：
 *   const built  = await btcTxBuild({ fromAddresses, to, amountSats, feeRateSatVb }, network)
 *   const signed = await btcTxSign(built, signer)
 *   const result = await btcTxBroadcast(signed.result.txHex, network)
 */

import * as bitcoin from "bitcoinjs-lib";
import { resolveBtcProvider } from "./netprovider.mjs";
import { btcUtxoList } from "./core.mjs";

// ── bitcoinjs 网络解析 ─────────────────────────────────────────────────────────
function resolveBtcJsNetwork(networkName) {
  const n = String(networkName ?? "mainnet").toLowerCase();
  if (n === "testnet" || n === "signet") return bitcoin.networks.testnet;
  if (n === "regtest") return bitcoin.networks.regtest;
  return bitcoin.networks.bitcoin;
}

// ── UTXO 字段归一化（统一为 satoshi 整数的 value 字段）─────────────────────────
// 适配器可能返回 amount（BTC 浮点）或 value（sats 整数），统一转换成 value（sats）
function normalizeUtxoValue(utxo) {
  if (typeof utxo.value === "number") return utxo; // 已经是 sats
  if (typeof utxo.amount === "number") {
    // amount > 21e6 视为已是 sats（不可能有这么多 BTC），否则按 BTC 换算
    const sats = utxo.amount > 21e6 ? Math.round(utxo.amount) : Math.round(utxo.amount * 1e8);
    return { ...utxo, value: sats };
  }
  return { ...utxo, value: 0 };
}

// ── 简单 UTXO 选择（最大优先 greedy）─────────────────────────────────────────
// 无 coinselect 依赖；足够用于普通转账场景
function selectUtxos(utxos, targetSat, estimatedFeeSat) {
  const needed = targetSat + estimatedFeeSat;
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected = [];
  let total = 0;
  for (const u of sorted) {
    selected.push(u);
    total += u.value;
    if (total >= needed) break;
  }
  if (total < needed) {
    throw Object.assign(
      new Error(`余额不足：可用 ${total} sat，需要约 ${needed} sat（含手续费）`),
      { code: "BTC_INSUFFICIENT_FUNDS", available: total, needed },
    );
  }
  return { selected, total };
}

// 估算交易虚字节（P2WPKH 输入为主，粗略）
function estimateTxVbytes(inputCount, outputCount) {
  // overhead=10, input=~68vb, output=~31vb  （P2WPKH / P2TR 近似）
  return 10 + inputCount * 68 + outputCount * 31;
}

// ── PSBT 输入构建（支持四种地址类型）────────────────────────────────────────
function buildPsbtInput(utxo, addrInfo, btcJsNet) {
  const addressType = String(addrInfo.addressType ?? "p2wpkh").toLowerCase();
  const outputScript = bitcoin.address.toOutputScript(utxo.address, btcJsNet);

  const input = {
    hash: utxo.txid,
    index: utxo.vout,
    sequence: 0xfffffffd, // RBF 开启
  };

  if (addressType === "p2pkh") {
    // 遗留输入需要 nonWitnessUtxo（完整前一笔交易 hex）
    // 调用方如有 rawTxHex 可通过 addrInfo.nonWitnessUtxoHex 传入
    if (addrInfo.nonWitnessUtxoHex) {
      input.nonWitnessUtxo = Buffer.from(addrInfo.nonWitnessUtxoHex, "hex");
    } else {
      // 退而求其次：只提供 witnessUtxo（某些验证器可接受）
      input.witnessUtxo = { script: outputScript, value: BigInt(utxo.value) };
    }
    return input;
  }

  // 所有 segwit 类型都使用 witnessUtxo，bitcoinjs-lib v7 要求 value 为 BigInt
  input.witnessUtxo = { script: outputScript, value: BigInt(utxo.value) };

  if (addressType === "p2sh-p2wpkh") {
    // 需要 redeemScript；可从调用方 publicKey 计算，或直接传入
    if (addrInfo.publicKey) {
      const pubKey = Buffer.isBuffer(addrInfo.publicKey)
        ? addrInfo.publicKey
        : Buffer.from(addrInfo.publicKey, "hex");
      const inner = bitcoin.payments.p2wpkh({ pubkey: pubKey, network: btcJsNet });
      input.redeemScript = inner.output;
    } else if (addrInfo.redeemScript) {
      input.redeemScript = Buffer.isBuffer(addrInfo.redeemScript)
        ? addrInfo.redeemScript
        : Buffer.from(addrInfo.redeemScript, "hex");
    }
  }

  if (addressType === "p2tr") {
    // 需要 tapInternalKey（x-only 32-byte pubkey）
    if (addrInfo.tapInternalKey) {
      input.tapInternalKey = Buffer.isBuffer(addrInfo.tapInternalKey)
        ? addrInfo.tapInternalKey
        : Buffer.from(addrInfo.tapInternalKey, "hex");
    } else if (addrInfo.publicKey) {
      // 从 33-byte compressed pubkey 取后 32 字节作为 x-only
      const pub = Buffer.isBuffer(addrInfo.publicKey)
        ? addrInfo.publicKey
        : Buffer.from(addrInfo.publicKey, "hex");
      input.tapInternalKey = pub.length === 33 ? pub.slice(1) : pub;
    }
    // 如未提供 tapInternalKey，签名仍可尝试，但部分验证可能失败
  }

  if (addressType === "p2wsh" || addressType === "p2wsh-multisig") {
    // p2wsh 多签需要 witnessScript（通常为 p2ms.output）
    if (addrInfo.witnessScript) {
      input.witnessScript = Buffer.isBuffer(addrInfo.witnessScript)
        ? addrInfo.witnessScript
        : Buffer.from(addrInfo.witnessScript, "hex");
    } else if (Array.isArray(addrInfo.publicKeys) && addrInfo.publicKeys.length > 0) {
      const m = Number(addrInfo.requiredSignatures ?? addrInfo.m ?? 2);
      const pubkeys = addrInfo.publicKeys.map((pk) => (
        Buffer.isBuffer(pk) ? pk : Buffer.from(pk, "hex")
      ));
      const p2ms = bitcoin.payments.p2ms({ m, pubkeys, network: btcJsNet });
      input.witnessScript = p2ms.output;
    } else {
      throw Object.assign(
        new Error("p2wsh 输入缺少 witnessScript 或 publicKeys"),
        { code: "BTC_TX_BUILD_FAILED" },
      );
    }
  }

  return input;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * 构建未签名 PSBT。
 *
 * options:
 *   fromAddresses  — Array<{ address, derivePath?, derivePaths?, addressType,
 *                             publicKey?,       // p2sh-p2wpkh / p2tr 建议提供
 *                             publicKeys?,      // p2wsh 多签可选（与 witnessScript 二选一）
 *                             witnessScript?,   // p2wsh 多签推荐显式传入
 *                             requiredSignatures?, // p2wsh + publicKeys 时可选
 *                             tapInternalKey?,  // p2tr 优先
 *                             nonWitnessUtxoHex? // p2pkh 可选
 *                           }>
 *   to             — 目标地址
 *   amountSats     — 发送金额（satoshi）
 *   feeRateSatVb   — 手续费率（sat/vbyte，默认 10）
 *   changeAddress  — 找零地址（默认 fromAddresses[0].address）
 *   dustThreshold  — dust 阈值（默认 546 sat）
 *
 * returns: { ok, psbtBase64, signingRequests, estimatedFeeSats,
 *            selectedUtxos, changeSats, target }
 */
export async function btcTxBuild(options = {}, networkNameOrProvider) {
  const resolved = await resolveBtcProvider(networkNameOrProvider);
  const networkName = resolved.networkName ?? "mainnet";
  const provider = resolved.provider ?? resolved; // 兼容直接传 provider 对象
  const btcJsNet = resolveBtcJsNetwork(networkName);

  const {
    fromAddresses,
    to,
    amountSats,
    feeRateSatVb = 10,
    changeAddress,
    dustThreshold = 546,
  } = options;

  if (!fromAddresses?.length) {
    throw Object.assign(new Error("btcTxBuild: 缺少 fromAddresses"), { code: "BTC_TX_BUILD_FAILED" });
  }
  if (!to) {
    throw Object.assign(new Error("btcTxBuild: 缺少目标地址 to"), { code: "BTC_TX_BUILD_FAILED" });
  }
  if (!amountSats || amountSats <= 0) {
    throw Object.assign(new Error("btcTxBuild: amountSats 必须为正整数"), { code: "BTC_TX_BUILD_FAILED" });
  }
  if (amountSats < dustThreshold) {
    throw Object.assign(
      new Error(`btcTxBuild: 发送金额 ${amountSats} sat 低于 dust 阈值 ${dustThreshold} sat`),
      { code: "BTC_TX_BUILD_FAILED" },
    );
  }

  // 收集所有来源地址的 UTXO，并归一化字段（amount BTC → value sats）
  const fromAddrStrings = fromAddresses.map((a) => String(a.address));
  const utxoResult = await btcUtxoList({ addresses: fromAddrStrings }, provider);
  const allUtxos = (utxoResult.utxos ?? []).map(normalizeUtxoValue);

  if (allUtxos.length === 0) {
    throw Object.assign(new Error("btcTxBuild: 没有可用 UTXO"), { code: "BTC_TX_BUILD_FAILED" });
  }

  // 粗估手续费（1 输入 + 2 输出），UTXO 选择后再精算
  const roughFeeSat = feeRateSatVb * estimateTxVbytes(1, 2);
  const { selected, total } = selectUtxos(allUtxos, amountSats, roughFeeSat);

  // 精算手续费（基于实际输入数量）
  const preciseFee = feeRateSatVb * estimateTxVbytes(selected.length, 2);
  const change = total - amountSats - preciseFee;
  const hasChange = change > dustThreshold;
  const actualFee = hasChange ? preciseFee : total - amountSats; // 吸收 dust 到手续费

  // 从地址到 addrInfo 映射
  const addrMap = new Map(fromAddresses.map((a) => [String(a.address), a]));

  const psbt = new bitcoin.Psbt({ network: btcJsNet });
  const signingRequests = [];

  for (let i = 0; i < selected.length; i++) {
    const utxo = selected[i];
    const addrInfo = addrMap.get(utxo.address) ?? fromAddresses[0];
    psbt.addInput(buildPsbtInput(utxo, addrInfo, btcJsNet));

    const derivePaths = Array.isArray(addrInfo.derivePaths) && addrInfo.derivePaths.length > 0
      ? addrInfo.derivePaths
      : [addrInfo.derivePath];

    for (const derivePath of derivePaths) {
      if (!derivePath) {
        throw Object.assign(
          new Error(`btcTxBuild: 地址 ${String(addrInfo.address ?? "")} 缺少 derivePath/derivePaths`),
          { code: "BTC_TX_BUILD_FAILED" },
        );
      }
      signingRequests.push({
        inputIndex: i,
        derivePath,
        addressType: addrInfo.addressType ?? "p2wpkh",
      });
    }
  }

  // bitcoinjs-lib v7 addOutput 的 value 也需要 BigInt
  psbt.addOutput({ address: to, value: BigInt(amountSats) });
  if (hasChange) {
    const changeAddr = changeAddress ?? fromAddresses[0].address;
    psbt.addOutput({ address: changeAddr, value: BigInt(change) });
  }

  return {
    ok: true,
    psbtBase64: psbt.toBase64(),
    signingRequests,
    estimatedFeeSats: actualFee,
    selectedUtxos: selected.length,
    changeSats: hasChange ? change : 0,
    target: { to, amount: String(amountSats) },
  };
}

/**
 * 通过 wallet signer 签名 PSBT。
 *
 * options: 来自 btcTxBuild 的返回值（含 psbtBase64 / signingRequests / target）
 * signer:  来自 wallet.getSigner({ chain: "btc", keyId })
 *
 * returns: signer.signPsbt 的结果
 */
export async function btcTxSign(options, signer) {
  if (!signer?.signPsbt) {
    throw Object.assign(
      new Error("btcTxSign: signer 无效，缺少 signPsbt（确认已注册 BTC provider）"),
      { code: "BTC_TX_SIGN_FAILED" },
    );
  }
  return signer.signPsbt(options);
}

/**
 * 广播已签名交易。
 *
 * rawTxHex:           签名后的交易 hex
 * networkNameOrProvider: 网络名称或 provider 对象
 *
 * returns: { ok, txid }
 */
export async function btcTxBroadcast(rawTxHex, networkNameOrProvider) {
  if (!rawTxHex) {
    throw Object.assign(new Error("btcTxBroadcast: 缺少 rawTxHex"), { code: "BTC_TX_BROADCAST_FAILED" });
  }

  const resolved = await resolveBtcProvider(networkNameOrProvider);
  const provider = resolved.provider ?? resolved;

  if (typeof provider?.adapter?.sendTx !== "function") {
    throw Object.assign(
      new Error("btcTxBroadcast: provider 不支持 sendTx，请检查 provider 配置"),
      { code: "BTC_TX_BROADCAST_FAILED" },
    );
  }

  const txid = await provider.adapter.sendTx(String(rawTxHex));
  return { ok: true, txid };
}
