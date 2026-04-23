import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

if (!process.env.GOPLUSLABS_API_KEY) {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

export * from "./request.mjs";
export * from "./address-validators.mjs";
export * from "./goplus/index.mjs";
export * from "./token-risk/index.mjs";
export * from "./sources/dexscreener/index.mjs";
