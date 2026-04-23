import prompts from "prompts";
import readline from "node:readline";

function toCamelCase(input) {
	return String(input ?? "")
		.trim()
		.replace(/^-+/, "")
		.replace(/-([a-zA-Z0-9])/g, (_, ch) => ch.toUpperCase());
}

function parseLiteralValue(value) {
	const raw = String(value ?? "").trim();
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (/^-?\d+$/.test(raw)) return Number.parseInt(raw, 10);
	return value;
}

/**
 * 通用命令解析：
 * input: ["create", "--name", "demo", "--backup"]
 * output: { com: "create", args: { name: "demo", backup: true } }
 */
export function parseCliCommand(argv = []) {
	const list = Array.isArray(argv) ? argv : [];
	const com = list.length > 0 ? String(list[0] ?? "").trim() : "";
	const args = {};
	const positional = [];

	for (let i = 1; i < list.length; i += 1) {
		const token = String(list[i] ?? "");
		if (!token.startsWith("--")) {
			positional.push(token);
			continue;
		}

		const key = toCamelCase(token);
		const next = list[i + 1];
		if (next !== undefined && !String(next).startsWith("--")) {
			args[key] = parseLiteralValue(next);
			i += 1;
			continue;
		}

		args[key] = true;
	}

	if (positional.length > 0) {
		args._ = positional;
	}

	return { com, args };
}

export async function askText(message, options = {}) {
	const response = await prompts(
		{
			type: "text",
			name: "value",
			message,
			initial: options.initial,
			validate: (value) => {
				if (options.required && !String(value ?? "").trim()) {
					return "该字段不能为空";
				}
				return true;
			},
		},
		{
			onCancel: () => {
				throw new Error("已取消操作");
			},
		},
	);

	return String(response.value ?? "").trim();
}

export async function askPassword(options = {}) {
	const message = options.message ?? "请输入密码";
	const minLength = Number(options.minLength ?? 8);
	const needConfirm = options.confirm !== false;

	const first = await prompts(
		{
			type: "password",
			name: "password",
			message,
			validate: (value) => {
				if (String(value ?? "").length < minLength) {
					return `密码至少 ${minLength} 位`;
				}
				return true;
			},
		},
		{
			onCancel: () => {
				throw new Error("已取消操作");
			},
		},
	);

	const password = String(first.password ?? "");
	if (!needConfirm) {
		return password;
	}

	const second = await prompts(
		{
			type: "password",
			name: "password2",
			message: "请再次输入密码",
			validate: (value) => (String(value ?? "") === password ? true : "两次输入的密码不一致"),
		},
		{
			onCancel: () => {
				throw new Error("已取消操作");
			},
		},
	);

	return String(second.password2 ?? "");
}

export async function askConfirm(message, options = {}) {
	const response = await prompts(
		{
			type: "confirm",
			name: "ok",
			message,
			initial: Boolean(options.initial),
		},
		{
			onCancel: () => {
				throw new Error("已取消操作");
			},
		},
	);

	return Boolean(response.ok);
}

export async function askSelect(message, choices = [], options = {}) {
	const response = await prompts(
		{
			type: "select",
			name: "value",
			message,
			choices,
			initial: Number(options.initial ?? 0),
		},
		{
			onCancel: () => {
				throw new Error("已取消操作");
			},
		},
	);

	return response.value;
}

export async function readMultilineInput(options = {}) {
	const title = String(options.title ?? "请输入内容，按 Esc 或单独输入 EOF 结束");
	return await new Promise((resolve, reject) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: true,
		});

		const lines = [];
		let settled = false;
		console.log(title);

		function cleanup() {
			process.stdin.off("keypress", onKeypress);
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false);
			}
		}

		function finish() {
			if (settled) return;
			settled = true;

			const currentLine = String(rl.line ?? "").trim();
			if (currentLine) {
				lines.push(currentLine);
			}

			cleanup();
			rl.close();
			resolve(lines.join("\n").trim());
		}

		function fail(error) {
			if (settled) return;
			settled = true;
			cleanup();
			rl.close();
			reject(error);
		}

		function onKeypress(_str, key) {
			if (key?.name === "escape") {
				process.stdout.write("\n");
				finish();
				return;
			}

			if (key?.name === "c" && key?.ctrl) {
				fail(new Error("已取消操作"));
			}
		}

		readline.emitKeypressEvents(process.stdin, rl);
		if (process.stdin.isTTY) {
			process.stdin.setRawMode(true);
		}
		process.stdin.on("keypress", onKeypress);

		rl.on("line", (line) => {
			if (settled) return;
			if (String(line ?? "") === "EOF") {
				finish();
				return;
			}
			lines.push(String(line ?? ""));
		});

		rl.on("close", () => {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(lines.join("\n").trim());
		});

		rl.on("SIGINT", () => {
			fail(new Error("已取消操作"));
		});
	});
}

async function readAllFromStdin() {
	if (process.stdin.isTTY) {
		return "";
	}

	return await new Promise((resolve, reject) => {
		let data = "";
		process.stdin.setEncoding("utf8");
		process.stdin.on("data", (chunk) => {
			data += String(chunk ?? "");
		});
		process.stdin.on("end", () => {
			resolve(String(data).replace(/\r\n/g, "\n"));
		});
		process.stdin.on("error", (error) => {
			reject(error);
		});
	});
}

function splitLinesKeepEmpty(text) {
	const normalized = String(text ?? "").replace(/\r\n/g, "\n");
	const lines = normalized.split("\n");
	return lines.length > 0 ? lines : [""];
}

function clamp(n, min, max) {
	return Math.max(min, Math.min(max, n));
}

function isDirectiveLine(line) {
	const trimmed = String(line ?? "").trim().toLowerCase();
	return trimmed.startsWith("@address-config") || trimmed.startsWith("@passphrase");
}

function collectSecretLineIndices(lines) {
	const sensitive = new Set();
	let block = [];

	const flush = () => {
		if (block.length >= 2) {
			sensitive.add(block[1]);
		}
		block = [];
	};

	for (let i = 0; i < lines.length; i += 1) {
		const text = String(lines[i] ?? "");
		const trimmed = text.trim();
		if (!trimmed) {
			flush();
			continue;
		}
		if (trimmed.startsWith("#")) {
			continue;
		}
		if (isDirectiveLine(trimmed)) {
			continue;
		}
		block.push(i);
	}
	flush();

	return sensitive;
}

function maskText(text) {
	const raw = String(text ?? "");
	if (!raw) return "";
	return "*".repeat(raw.length);
}

function renderTuiEditor(lines, cursor, options) {
	const title = String(options.title ?? "安全输入模式（仅内存，不落盘）");
	const hint = "Ctrl+X 保存并退出 | Ctrl+S 兼容保存 | Ctrl+C 取消 | Enter 换行 | 密钥行掩码显示";
	const gutterWidth = 4;
	const secretLineIndices = options.maskSecretLines ? collectSecretLineIndices(lines) : new Set();

	let out = "\x1b[2J\x1b[H";
	out += `\x1b[1m${title}\x1b[0m\n`;
	out += `${hint}\n`;
	out += `${"-".repeat(80)}\n`;

	for (let i = 0; i < lines.length; i += 1) {
		const lineNo = String(i + 1).padStart(gutterWidth, " ");
		const text = lines[i] ?? "";
		const displayText = secretLineIndices.has(i) ? maskText(text) : text;
		if (i === cursor.row) {
			const left = displayText.slice(0, cursor.col);
			const right = displayText.slice(cursor.col);
			out += `\x1b[36m${lineNo}\x1b[0m ${left}\x1b[7m${right[0] ?? " "}\x1b[0m${right.slice(1)}\n`;
		} else {
			out += `\x1b[90m${lineNo}\x1b[0m ${displayText}\n`;
		}
	}

	process.stdout.write(out);
}

function insertTextAtCursor(lines, cursor, inputText) {
	const chunk = String(inputText ?? "");
	if (!chunk) return;

	const parts = chunk.replace(/\r\n/g, "\n").split("\n");
	const current = lines[cursor.row] ?? "";
	const left = current.slice(0, cursor.col);
	const right = current.slice(cursor.col);

	if (parts.length === 1) {
		lines[cursor.row] = `${left}${parts[0]}${right}`;
		cursor.col += parts[0].length;
		return;
	}

	lines[cursor.row] = `${left}${parts[0]}`;
	const middle = parts.slice(1, -1);
	for (let i = 0; i < middle.length; i += 1) {
		lines.splice(cursor.row + 1 + i, 0, middle[i]);
	}
	const last = parts[parts.length - 1];
	lines.splice(cursor.row + parts.length - 1, 0, `${last}${right}`);
	cursor.row += parts.length - 1;
	cursor.col = last.length;
}

export async function readTuiDocumentInput(options = {}) {
	if (!process.stdin.isTTY || !process.stdout.isTTY) {
		const piped = await readAllFromStdin();
		if (String(piped).trim()) {
			return piped;
		}
		throw new Error("当前终端不支持交互 TUI 输入，请改用管道输入、--content 或 --input");
	}

	const initialLines = splitLinesKeepEmpty(options.initial ?? "");
	const lines = [...initialLines];
	const defaultInitialRow = Math.max(0, lines.length - 1);
	const cursor = {
		row: clamp(Number(options.initialRow ?? defaultInitialRow), 0, lines.length - 1),
		col: 0,
	};

	return await new Promise((resolve, reject) => {
		let settled = false;

		function cleanup() {
			process.stdin.off("keypress", onKeypress);
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(false);
			}
			process.stdin.pause();
			// 3J: clear scrollback (supported by many terminals), 2J: clear screen, H: move cursor home
			process.stdout.write("\x1b[0m\x1b[3J\x1b[2J\x1b[H");
		}

		function finish() {
			if (settled) return;
			settled = true;
			cleanup();
			resolve(lines.join("\n"));
		}

		function fail(error) {
			if (settled) return;
			settled = true;
			cleanup();
			reject(error);
		}

		function onKeypress(str, key) {
			if (settled) return;

			if (key?.ctrl && key.name === "c") {
				fail(new Error("已取消操作"));
				return;
			}
			if (key?.ctrl && key.name === "x") {
				finish();
				return;
			}
			if (key?.ctrl && key.name === "s") {
				finish();
				return;
			}

			if (key?.name === "up") {
				cursor.row = clamp(cursor.row - 1, 0, lines.length - 1);
				cursor.col = clamp(cursor.col, 0, (lines[cursor.row] ?? "").length);
				renderTuiEditor(lines, cursor, options);
				return;
			}
			if (key?.name === "down") {
				cursor.row = clamp(cursor.row + 1, 0, lines.length - 1);
				cursor.col = clamp(cursor.col, 0, (lines[cursor.row] ?? "").length);
				renderTuiEditor(lines, cursor, options);
				return;
			}
			if (key?.name === "left") {
				if (cursor.col > 0) {
					cursor.col -= 1;
				} else if (cursor.row > 0) {
					cursor.row -= 1;
					cursor.col = (lines[cursor.row] ?? "").length;
				}
				renderTuiEditor(lines, cursor, options);
				return;
			}
			if (key?.name === "right") {
				const currentLen = (lines[cursor.row] ?? "").length;
				if (cursor.col < currentLen) {
					cursor.col += 1;
				} else if (cursor.row < lines.length - 1) {
					cursor.row += 1;
					cursor.col = 0;
				}
				renderTuiEditor(lines, cursor, options);
				return;
			}

			if (key?.name === "return") {
				insertTextAtCursor(lines, cursor, "\n");
				renderTuiEditor(lines, cursor, options);
				return;
			}

			if (key?.name === "backspace") {
				if (cursor.col > 0) {
					const row = lines[cursor.row] ?? "";
					lines[cursor.row] = `${row.slice(0, cursor.col - 1)}${row.slice(cursor.col)}`;
					cursor.col -= 1;
				} else if (cursor.row > 0) {
					const prev = lines[cursor.row - 1] ?? "";
					const curr = lines[cursor.row] ?? "";
					lines[cursor.row - 1] = `${prev}${curr}`;
					lines.splice(cursor.row, 1);
					cursor.row -= 1;
					cursor.col = prev.length;
				}
				renderTuiEditor(lines, cursor, options);
				return;
			}

			if (key?.name === "delete") {
				const row = lines[cursor.row] ?? "";
				if (cursor.col < row.length) {
					lines[cursor.row] = `${row.slice(0, cursor.col)}${row.slice(cursor.col + 1)}`;
				} else if (cursor.row < lines.length - 1) {
					lines[cursor.row] = `${row}${lines[cursor.row + 1] ?? ""}`;
					lines.splice(cursor.row + 1, 1);
				}
				renderTuiEditor(lines, cursor, options);
				return;
			}

			if (key?.meta && key.name === "backspace") {
				const row = lines[cursor.row] ?? "";
				let cut = cursor.col;
				while (cut > 0 && row[cut - 1] === " ") cut -= 1;
				while (cut > 0 && row[cut - 1] !== " ") cut -= 1;
				lines[cursor.row] = `${row.slice(0, cut)}${row.slice(cursor.col)}`;
				cursor.col = cut;
				renderTuiEditor(lines, cursor, options);
				return;
			}

			if (key?.ctrl && key.name === "u") {
				const row = lines[cursor.row] ?? "";
				lines[cursor.row] = row.slice(cursor.col);
				cursor.col = 0;
				renderTuiEditor(lines, cursor, options);
				return;
			}

			if (typeof str === "string" && str.length > 0 && !key?.ctrl && !key?.meta) {
				insertTextAtCursor(lines, cursor, str);
				renderTuiEditor(lines, cursor, options);
			}
		}

		readline.emitKeypressEvents(process.stdin);
		process.stdin.resume();
		process.stdin.setRawMode(true);
		process.stdin.on("keypress", onKeypress);
		renderTuiEditor(lines, cursor, options);
	});
}

