import { resolveTrxNetProvider } from "./netprovider.mjs";
import { toTrxHexAddress, toTrxBase58Address } from "./address-codec.mjs";

const SUN_PER_TRX = 1_000_000;

function sunToTrx(sun) {
  return Number(sun ?? 0) / SUN_PER_TRX;
}

function parseAccountBalance(raw) {
  const available = sunToTrx(raw?.balance ?? 0);
  const frozenV1 = Array.isArray(raw?.frozen)
    ? raw.frozen.reduce((sum, item) => sum + Number(item?.frozen_balance ?? 0), 0)
    : 0;
  const frozenV2Bandwidth = Number(raw?.frozenV2?.frozen_balance ?? 0);
  const frozenBandwidth = sunToTrx(frozenV1 + frozenV2Bandwidth);

  const frozenEnergyRaw = raw?.account_resource?.frozen_balance_for_energy?.frozen_balance
    ?? raw?.account_resource?.frozenBalanceForEnergy?.frozen_balance
    ?? 0;
  const frozenEnergy = sunToTrx(frozenEnergyRaw);

  return {
    available,
    frozenBandwidth,
    frozenEnergy,
    total: available + frozenBandwidth + frozenEnergy,
  };
}

export async function trxBalanceGet(address, networkNameOrProvider = null) {
  const provider = resolveTrxNetProvider(networkNameOrProvider);
  const hexAddr = toTrxHexAddress(address);
  const raw = await provider.walletCall("getaccount", { address: hexAddr });
  const exists = Boolean(raw && (raw.balance !== undefined || raw.address));
  const parsed = parseAccountBalance(raw ?? {});

  return {
    address: toTrxBase58Address(hexAddr),
    networkName: provider.networkName,
    exists,
    ...parsed,
  };
}

export async function trxBalanceBatch(addresses = [], networkNameOrProvider = null) {
  if (!Array.isArray(addresses) || addresses.length === 0) {
    throw new Error("addresses 不能为空");
  }
  const items = [];
  for (const address of addresses) {
    items.push(await trxBalanceGet(address, networkNameOrProvider));
  }
  return { ok: true, items, total: items.length };
}

export default {
  trxBalanceGet,
  trxBalanceBatch,
};
