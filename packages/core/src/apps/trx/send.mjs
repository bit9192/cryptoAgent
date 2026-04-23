import { Interface, parseUnits } from "ethers";
import { resolveTrxNetProvider } from "./netprovider.mjs";
import { toTrxHexAddress, toTrxBase58Address, toEthHexAddress } from "./address-codec.mjs";
import { resolveTrxToken } from "./config/tokens.js";

const SUN_PER_TRX = 1_000_000;

function resolveRunnerAddress(signerOrAddress) {
  if (typeof signerOrAddress === "string") return signerOrAddress;
  if (signerOrAddress?.address) return signerOrAddress.address;
  if (signerOrAddress?.runner?.address) return signerOrAddress.runner.address;
  return null;
}

async function ensureSignerAddress(signer) {
  if (typeof signer?.getAddress === "function") return signer.getAddress();
  const addr = resolveRunnerAddress(signer);
  if (!addr) throw new Error("signer 缺少地址或 getAddress");
  return addr;
}

async function signTrxTransaction(transaction, signer) {
  if (!signer || typeof signer.signTransaction !== "function") {
    throw new Error("signer 不支持 signTransaction");
  }
  const signed = await signer.signTransaction(transaction);
  if (signed?.result?.signedTx) return signed.result.signedTx;
  if (signed?.signedTx) return signed.signedTx;
  if (signed?.txID && Array.isArray(signed?.signature)) return signed;
  throw new Error("signTransaction 返回值无效");
}

export async function trxSend(signer, to, amountTrx, networkNameOrProvider = null) {
  const provider = resolveTrxNetProvider(networkNameOrProvider);
  const fromAddress = await ensureSignerAddress(signer);

  const toHex = toTrxHexAddress(to);
  const fromHex = toTrxHexAddress(fromAddress);
  const amountNum = Number(amountTrx);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    throw new Error("amount 必须是正数（TRX）");
  }

  const tx = await provider.walletCall("createtransaction", {
    to_address: toHex,
    owner_address: fromHex,
    amount: Math.floor(amountNum * SUN_PER_TRX),
    visible: false,
  });
  if (!tx || tx.Error) {
    throw new Error(`createtransaction 失败: ${tx?.Error ?? "unknown"}`);
  }

  const signedTx = await signTrxTransaction(tx, signer);
  const broadcast = await provider.walletCall("broadcasttransaction", signedTx);
  const txHash = String(tx?.txID ?? signedTx?.txID ?? broadcast?.txid ?? "").trim() || null;

  return {
    ok: true,
    txHash,
    from: toTrxBase58Address(fromHex),
    to: toTrxBase58Address(toHex),
    amount: amountNum,
    raw: broadcast,
  };
}

function selectorOf(iface, method) {
  const frag = iface.getFunction(method);
  return `${frag.name}(${frag.inputs.map((i) => i.type).join(",")})`;
}

async function triggerConstant(provider, signer, contractAddress, iface, method, args = []) {
  const owner = await ensureSignerAddress(signer);
  const data = iface.encodeFunctionData(method, args);
  const result = await provider.walletCall("triggerconstantcontract", {
    owner_address: toTrxHexAddress(owner),
    contract_address: toTrxHexAddress(contractAddress),
    function_selector: selectorOf(iface, method),
    parameter: data.slice(10),
    visible: false,
  });

  const hex = result?.constant_result?.[0];
  if (!hex) {
    throw new Error(`triggerconstantcontract 失败: ${JSON.stringify(result)}`);
  }
  return iface.decodeFunctionResult(method, `0x${hex}`);
}

async function triggerStateChanging(provider, signer, contractAddress, iface, method, args = [], feeLimitSun = 100_000_000) {
  const owner = await ensureSignerAddress(signer);
  const data = iface.encodeFunctionData(method, args);
  const built = await provider.walletCall("triggersmartcontract", {
    owner_address: toTrxHexAddress(owner),
    contract_address: toTrxHexAddress(contractAddress),
    function_selector: selectorOf(iface, method),
    parameter: data.slice(10),
    fee_limit: Number(feeLimitSun),
    call_value: 0,
    visible: false,
  });

  const tx = built?.transaction ?? built;
  if (!tx?.txID) {
    throw new Error(`triggersmartcontract 返回无交易: ${JSON.stringify(built)}`);
  }

  const signedTx = await signTrxTransaction(tx, signer);
  const broadcast = await provider.walletCall("broadcasttransaction", signedTx);
  const txHash = String(tx.txID ?? broadcast?.txid ?? "").trim() || null;
  return { txHash, raw: broadcast };
}

const TRC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address,uint256) returns (bool)",
];

export function createTrc20(options = {}) {
  const provider = resolveTrxNetProvider(options.networkNameOrProvider ?? options.netProvider ?? null);
  const networkName = String(provider.networkName ?? options.network ?? options.networkName ?? "mainnet").trim().toLowerCase();
  const tokenKey = String(options.token ?? options.key ?? options.symbol ?? "").trim();
  const tokenMeta = tokenKey
    ? resolveTrxToken({
      network: networkName,
      key: tokenKey,
    })
    : null;

  const tokenName = String(options.tokenName ?? tokenMeta?.name ?? "TRC20");
  const contractAddress = String(options.address ?? tokenMeta?.address ?? "").trim();
  const signer = options.signer;
  if (!contractAddress) throw new Error("TRC20 合约地址不能为空");
  if (!signer) throw new Error("TRC20 需要 signer");

  const iface = new Interface(TRC20_ABI);

  const api = {
    tokenName,
    symbolHint: String(tokenMeta?.symbol ?? "").trim().toUpperCase() || null,
    decimalsHint: Number.isFinite(Number(tokenMeta?.decimals)) ? Number(tokenMeta?.decimals) : null,
    address: toTrxBase58Address(contractAddress),
    runner: signer,
    connect(nextSigner) {
      return createTrc20({
        tokenName,
        address: contractAddress,
        netProvider: provider,
        signer: nextSigner,
      });
    },
    async symbol() {
      const [value] = await triggerConstant(provider, signer, contractAddress, iface, "symbol", []);
      return value;
    },
    async decimals() {
      const [value] = await triggerConstant(provider, signer, contractAddress, iface, "decimals", []);
      return Number(value);
    },
    async balanceOf(owner) {
      const ownerEth = toEthHexAddress(owner);
      const [value] = await triggerConstant(provider, signer, contractAddress, iface, "balanceOf", [ownerEth]);
      return value;
    },
    async transfer(to, amountRaw, transferOptions = {}) {
      const toEth = toEthHexAddress(to);
      const amount = typeof amountRaw === "bigint" ? amountRaw : BigInt(String(amountRaw));
      return triggerStateChanging(
        provider,
        signer,
        contractAddress,
        iface,
        "transfer",
        [toEth, amount],
        Number(transferOptions.feeLimitSun ?? 100_000_000),
      );
    },
    async transferHuman(to, amount, transferOptions = {}) {
      const decimals = await api.decimals();
      const raw = parseUnits(String(amount), decimals);
      return api.transfer(to, raw, transferOptions);
    },
  };

  return api;
}

export default {
  trxSend,
  createTrc20,
};
