import "../../../load-env.mjs";

const EMPTY_SOCIAL = Object.freeze({
  twitter: null,
  telegram: null,
  discord: null,
  github: null,
});

const EMPTY_PROJECT = Object.freeze({
  description: null,
  website: null,
  docs: null,
  logo: null,
  social: EMPTY_SOCIAL,
});

const EVM_TOKEN_PROFILES = Object.freeze({
  eth: Object.freeze({
    usdt: Object.freeze({
      description: "USDT stablecoin on Ethereum",
      website: "https://tether.to",
      docs: "https://tether.to/en/transparency/",
      logo: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
      social: Object.freeze({
        twitter: "https://x.com/Tether_to",
        telegram: null,
        discord: null,
        github: null,
      }),
    }),
    uni: Object.freeze({
      description: "UNI governance token",
      website: "https://uniswap.org",
      docs: "https://docs.uniswap.org",
      logo: "https://assets.coingecko.com/coins/images/12504/small/uni.jpg",
      social: Object.freeze({
        twitter: "https://x.com/Uniswap",
        telegram: null,
        discord: "https://discord.com/invite/uniswap",
        github: "https://github.com/Uniswap",
      }),
    }),
  }),
  bsc: Object.freeze({
    usdt: Object.freeze({
      description: "USDT stablecoin on BSC",
      website: "https://tether.to",
      docs: "https://tether.to/en/transparency/",
      logo: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
      social: Object.freeze({
        twitter: "https://x.com/Tether_to",
        telegram: null,
        discord: null,
        github: null,
      }),
    }),
  }),
});

function normalizeLower(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeProject(raw = {}) {
  const socialRaw = raw.social && typeof raw.social === "object" ? raw.social : {};
  return {
    description: raw.description == null ? null : String(raw.description),
    website: raw.website == null ? null : String(raw.website),
    docs: raw.docs == null ? null : String(raw.docs),
    logo: raw.logo == null ? null : String(raw.logo),
    social: {
      twitter: socialRaw.twitter == null ? null : String(socialRaw.twitter),
      telegram: socialRaw.telegram == null ? null : String(socialRaw.telegram),
      discord: socialRaw.discord == null ? null : String(socialRaw.discord),
      github: socialRaw.github == null ? null : String(socialRaw.github),
    },
  };
}

export function resolveEvmTokenProfile(input = {}) {
  const network = normalizeLower(input.network || "eth") || "eth";
  const profileBook = EVM_TOKEN_PROFILES[network] || {};

  const candidates = [
    normalizeLower(input.key),
    normalizeLower(input.symbol),
    normalizeLower(input.address),
    normalizeLower(input.tokenAddress),
  ].filter(Boolean);

  for (const token of candidates) {
    const found = profileBook[token];
    if (found && typeof found === "object") {
      return normalizeProject(found);
    }
  }

  return normalizeProject(EMPTY_PROJECT);
}

export { EVM_TOKEN_PROFILES };
