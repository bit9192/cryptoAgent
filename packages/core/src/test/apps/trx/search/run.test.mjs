import { createTrxTokenSearchProvider } from "../../../../apps/trx/search/token-provider.mjs";
import { createTrxAddressSearchProvider } from "../../../../apps/trx/search/address-provider.mjs";
import { createTrxTradeSearchProvider } from "../../../../apps/trx/search/trade-provider.mjs";

// Edit inputs here before running:
// node src/test/apps/trx/search/run.test.mjs

const inputs = {
  searchToken: {
    query: "usdt",
    network: "mainnet",
    limit: 5,
  },
  searchAddress: {
    address: "TN3W4H6rK2ce4vX9YnFQHwKENnHjoxb3m9",
    network: "mainnet",
  },
  searchTrade: {
    query: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
    network: "mainnet",
    limit: 5,
  },
};

async function main() {
  const tokenProvider = createTrxTokenSearchProvider();
  const addressProvider = createTrxAddressSearchProvider();
  const tradeProvider = createTrxTradeSearchProvider();

  const [tokenItems, addressItems, tradeItems] = await Promise.all([
    tokenProvider.searchToken(inputs.searchToken),
    addressProvider.searchAddress(inputs.searchAddress),
    tradeProvider.searchTrade(inputs.searchTrade),
  ]);

  const output = {
    input: inputs,
    output: {
      searchToken: {
        type: "SearchItem[]",
        count: Array.isArray(tokenItems) ? tokenItems.length : 0,
        firstItem: Array.isArray(tokenItems) && tokenItems.length > 0 ? tokenItems[0] : null,
      },
      searchAddress: {
        type: "SearchItem[]",
        count: Array.isArray(addressItems) ? addressItems.length : 0,
        firstTwo: Array.isArray(addressItems) ? addressItems.slice(0, 2) : [],
      },
      searchTrade: {
        type: "TradeItem[]",
        count: Array.isArray(tradeItems) ? tradeItems.length : 0,
        firstItem: Array.isArray(tradeItems) && tradeItems.length > 0 ? tradeItems[0] : null,
      },
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error("trx-search run.test failed:", error?.message || error);
  process.exitCode = 1;
});
