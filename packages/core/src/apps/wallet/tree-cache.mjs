export function hasConfiguredAddress(items = [], input = {}) {
  const keyId = String(input.keyId ?? "").trim();
  const chain = String(input.chain ?? "").trim().toLowerCase();
  const addressType = String(input.addressType ?? "").trim().toLowerCase();
  if (!keyId || !chain) return false;

  return items.some((item) => {
    const itemKeyId = String(item?.keyId ?? "").trim();
    const itemChain = String(item?.chain ?? "").trim().toLowerCase();
    const itemAddress = String(item?.address ?? "").trim();
    const itemType = String(item?.addressType ?? "").trim().toLowerCase();
    if (!itemAddress) return false;
    if (itemKeyId !== keyId || itemChain !== chain) return false;
    if (!addressType) return true;
    return itemType === addressType;
  });
}

export function appendConfiguredAddress(items = [], input = {}) {
  const keyId = String(input.keyId ?? "").trim();
  const chain = String(input.chain ?? "").trim().toLowerCase();
  const address = String(input.address ?? "").trim();
  const addressType = String(input.addressType ?? "").trim().toLowerCase() || null;
  const pathValue = String(input.path ?? "").trim() || null;
  const name = String(input.name ?? "").trim() || null;
  if (!keyId || !chain || !address) return false;

  const duplicated = items.some((item) => {
    return String(item?.keyId ?? "").trim() === keyId
      && String(item?.chain ?? "").trim().toLowerCase() === chain
      && String(item?.address ?? "").trim() === address
      && (String(item?.addressType ?? "").trim().toLowerCase() || null) === addressType
      && (String(item?.path ?? "").trim() || null) === pathValue;
  });
  if (duplicated) return false;

  items.push({
    keyId,
    keyName: String(input.keyName ?? "").trim() || null,
    chain,
    network: String(input.network ?? "mainnet").trim().toLowerCase() || "mainnet",
    addressType,
    path: pathValue,
    name,
    address,
  });
  return true;
}

export async function ensureRequestedAddressesForRecord(record, session, chainRequests = [], deps = {}) {
  const warnings = [];
  if (!Array.isArray(chainRequests) || chainRequests.length === 0) {
    return { warnings };
  }

  if (!Array.isArray(session._configuredAddresses)) {
    session._configuredAddresses = [];
  }
  const items = session._configuredAddresses;

  const hasProvider = typeof deps.hasProvider === "function"
    ? deps.hasProvider
    : () => false;
  const getSigner = typeof deps.getSigner === "function"
    ? deps.getSigner
    : async () => ({ signer: null });

  for (const req of chainRequests) {
    const chain = String(req?.chain ?? "").trim().toLowerCase();
    if (!chain) continue;

    const requestedTypes = Array.isArray(req?.addressTypes) && req.addressTypes.length > 0
      ? req.addressTypes
      : [null];

    for (const addressType of requestedTypes) {
      const normalizedType = String(addressType ?? "").trim().toLowerCase() || null;
      if (hasConfiguredAddress(items, { keyId: record.keyId, chain, addressType: normalizedType })) {
        continue;
      }

      if (!hasProvider(chain)) {
        warnings.push(`chain provider 未注册: ${chain}`);
        continue;
      }

      try {
        const signerResult = await getSigner({ chain, keyId: record.keyId });
        const signer = signerResult?.signer;
        if (!signer || typeof signer.getAddress !== "function") {
          warnings.push(`chain signer 不支持 getAddress: ${chain}`);
          continue;
        }

        const address = normalizedType
          ? await signer.getAddress({ addressType: normalizedType })
          : await signer.getAddress({});
        const textAddress = String(address ?? "").trim();
        if (!textAddress) {
          warnings.push(`地址生成为空: ${record.keyId} ${chain}${normalizedType ? ` (${normalizedType})` : ""}`);
          continue;
        }

        appendConfiguredAddress(items, {
          keyId: record.keyId,
          keyName: record.name,
          chain,
          address: textAddress,
          addressType: normalizedType,
          path: null,
          name: record.name,
        });
      } catch (error) {
        warnings.push(
          `地址生成失败: ${record.keyId} ${chain}${normalizedType ? ` (${normalizedType})` : ""} - ${String(error?.message ?? error)}`,
        );
      }
    }
  }

  return { warnings };
}

export function collectDerivedAddressesFromSession(session) {
  const addresses = [];
  if (!Array.isArray(session?._configuredAddresses)) {
    return addresses;
  }

  for (const item of session._configuredAddresses) {
    const keyId = String(item?.keyId ?? "").trim();
    const chain = String(item?.chain ?? "").trim().toLowerCase();
    const address = String(item?.address ?? "").trim();
    if (!keyId || !chain || !address) continue;
    addresses.push({
      keyId,
      chain,
      address,
      name: String(item?.name ?? "").trim() || null,
      path: String(item?.path ?? "").trim() || null,
      sourceType: "derive",
    });
  }

  return addresses;
}
