import fs from "node:fs/promises";
import path from "node:path";

import {
	sanitizeForChannel,
} from "../../modules/data-engine/index.mjs";

const ENCRYPTED_FILE_SUFFIX = ".enc.json";

async function walkEncryptedFiles(dirPath) {
	const entries = await fs.readdir(dirPath, { withFileTypes: true });
	entries.sort((a, b) => a.name.localeCompare(b.name));

	const files = [];
	for (const entry of entries) {
		const abs = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...await walkEncryptedFiles(abs));
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(ENCRYPTED_FILE_SUFFIX)) {
			files.push(abs);
		}
	}
	return files;
}

/**
 * 列出本地 storage/key 下所有加密 key 文件。
 *
 * @param {object} [options]
 * @param {string} [options.storageRoot='storage']
 * @param {'ai'|'ui'|'internal'|'secure'} [options.outputChannel]
 * @param {Object<string,'public'|'internal'|'private'|'secret'>} [options.outputFieldLevels]
 * @returns {Promise<{ok:boolean,keyRoot:string,total:number,items:Array}>}
 */
export async function walletList(options = {}) {
	const storageRoot = String(options.storageRoot ?? "storage");
	const keyRoot = path.resolve(process.cwd(), storageRoot, "key");

	let stat;
	try {
		stat = await fs.stat(keyRoot);
	} catch {
		const empty = {
			ok: true,
			keyRoot,
			total: 0,
			items: [],
		};
		return options.outputChannel
			? sanitizeForChannel({
				data: empty,
				channel: options.outputChannel,
				fieldLevels: options.outputFieldLevels ?? {
					keyRoot: "internal",
					abs: "internal",
					"items.abs": "internal",
				},
			})
			: empty;
	}

	if (!stat.isDirectory()) {
		throw new Error(`key 目录不是文件夹: ${keyRoot}`);
	}

	const files = await walkEncryptedFiles(keyRoot);
	const items = await Promise.all(
		files.map(async (abs) => {
			const st = await fs.stat(abs);
			const rel = path.relative(process.cwd(), abs) || abs;
			const shortName = path.basename(abs, ENCRYPTED_FILE_SUFFIX);
			return {
				name: path.basename(abs),
				shortName,
				abs,
				rel,
				dir: path.dirname(rel),
				size: st.size,
				mtimeMs: st.mtimeMs,
			};
		})
	);

	const payload = {
		ok: true,
		keyRoot,
		total: items.length,
		items,
	};

	if (!options.outputChannel) {
		return payload;
	}

	return sanitizeForChannel({
		data: payload,
		channel: options.outputChannel,
		fieldLevels: options.outputFieldLevels ?? {
			keyRoot: "internal",
			abs: "internal",
			"items.abs": "internal",
		},
	});
}

export default walletList;
