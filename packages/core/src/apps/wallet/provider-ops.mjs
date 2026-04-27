export function createProviderOps(providerRegistry) {
  async function registerProvider(input = {}) {
    const provider = input?.provider;
    if (!provider || typeof provider !== "object") {
      throw new Error("provider 不能为空");
    }

    const chain = String(provider.chain ?? "").trim();
    if (!chain) {
      throw new Error("provider.chain 不能为空");
    }
    if (typeof provider.createSigner !== "function") {
      throw new Error(`provider.createSigner 必须是函数: ${chain}`);
    }

    const operations = Array.isArray(provider.operations)
      ? Array.from(new Set(provider.operations.map((op) => String(op).trim()).filter(Boolean)))
      : [];

    const replaced = providerRegistry.has(chain);
    if (replaced && !input.allowOverride) {
      throw new Error(`provider 已存在: ${chain}`);
    }

    const normalizedProvider = {
      ...provider,
      chain,
      operations,
      supports: typeof provider.supports === "function"
        ? provider.supports.bind(provider)
        : (operation) => operations.includes(String(operation ?? "")),
    };

    providerRegistry.set(chain, normalizedProvider);
    return {
      ok: true,
      chain,
      replaced,
    };
  }

  async function listChains() {
    const items = [...providerRegistry.values()]
      .map((provider) => ({
        chain: provider.chain,
        operations: [...provider.operations],
      }))
      .sort((a, b) => a.chain.localeCompare(b.chain));

    return {
      ok: true,
      items,
    };
  }

  async function supports(input = {}) {
    const chain = String(input.chain ?? "").trim();
    const operation = String(input.operation ?? "").trim();
    const provider = providerRegistry.get(chain);

    return {
      ok: true,
      chain,
      operation,
      supported: Boolean(provider && operation && provider.supports(operation)),
    };
  }

  return {
    registerProvider,
    listChains,
    supports,
  };
}
