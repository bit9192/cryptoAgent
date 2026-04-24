import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(MODULE_DIR, "..");
const PACKAGE_ENV_PATH = path.join(PACKAGE_ROOT, ".env");

if (fs.existsSync(PACKAGE_ENV_PATH)) {
  dotenv.config({ path: PACKAGE_ENV_PATH });
} else {
  dotenv.config();
}

export const packageEnvPath = PACKAGE_ENV_PATH;
