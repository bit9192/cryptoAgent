function normalizeString(value) {
  return String(value ?? "").trim();
}

function truncateText(text, maxLength = 160) {
  const value = normalizeString(text);
  if (!value) return "";
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`;
}

function sanitizeForPanel(value) {
  if (value == null) return value;
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map((item) => sanitizeForPanel(item));
  if (typeof value !== "object") return value;

  const out = {};
  for (const [key, current] of Object.entries(value)) {
    const lowerKey = key.toLowerCase();
    if (["privatekey", "mnemonic", "seed", "password", "secret", "apikey"].some((part) => lowerKey.includes(part))) {
      continue;
    }
    out[key] = sanitizeForPanel(current);
  }
  return out;
}

function summarizeInteractFields(fields = []) {
  const list = Array.isArray(fields) ? fields : [];
  const parts = [];

  for (const field of list) {
    if (!field || typeof field !== "object") continue;
    const name = normalizeString(field.name);
    if (!name) continue;
    const type = normalizeString(field.type || "text").toLowerCase() || "text";
    const required = field.required ? "*" : "";
    parts.push(`${name}<${type}>${required}`);
  }

  if (parts.length === 0) return "任务请求输入";
  return `输入字段: ${parts.join(", ")}`;
}

function summarizeEntryPayload(entry = {}) {
  if (entry.status === "error") {
    return truncateText(entry.error || "任务失败");
  }
  if (entry.status === "paused") {
    return truncateText(`任务已暂停，token=${entry.token ?? "(unknown)"}`);
  }
  if (entry.status !== "ok") {
    return "暂无结果";
  }

  try {
    const safe = sanitizeForPanel(entry.result ?? null);
    const text = JSON.stringify(safe);
    if (!text || text === "null") return "执行成功";
    return truncateText(text);
  } catch {
    return "执行成功";
  }
}

export function createLonPanelState() {
  return {
    status: "idle",
    title: "等待命令",
    task: null,
    summary: "暂无结果",
    updatedAt: null,
  };
}

export function setPanelRunning(panel, taskId) {
  panel.status = "running";
  panel.title = "任务执行中";
  panel.task = normalizeString(taskId) || panel.task;
  panel.updatedAt = new Date().toISOString();
}

export function setPanelAwaitingInput(panel, message, fields = []) {
  panel.status = "awaiting_input";
  panel.title = "等待输入";
  const base = normalizeString(message) || "任务请求输入";
  const fieldSummary = summarizeInteractFields(fields);
  panel.summary = truncateText(`${base} | ${fieldSummary}`);
  panel.updatedAt = new Date().toISOString();
}

export function applyExecEntryToPanel(panel, entry = {}) {
  const status = normalizeString(entry.status) || "idle";
  panel.status = status;
  panel.task = normalizeString(entry.task) || panel.task;
  panel.updatedAt = normalizeString(entry.timestamp) || new Date().toISOString();

  if (status === "ok") {
    panel.title = "最近任务成功";
  } else if (status === "paused") {
    panel.title = "最近任务已暂停";
  } else if (status === "error") {
    panel.title = "最近任务失败";
  } else {
    panel.title = "等待命令";
  }
  panel.summary = summarizeEntryPayload(entry);
}

export function renderLonTopPanel(session = {}) {
  const panel = session.panel ?? createLonPanelState();
  const lines = [
    "┌───────────────── Result Panel ─────────────────┐",
    `│ status: ${truncateText(panel.status || "idle", 42).padEnd(42)} │`,
    `│ title:  ${truncateText(panel.title || "等待命令", 42).padEnd(42)} │`,
    `│ task:   ${truncateText(panel.task || "(none)", 42).padEnd(42)} │`,
    `│ time:   ${truncateText(panel.updatedAt || "(none)", 42).padEnd(42)} │`,
    `│ info:   ${truncateText(panel.summary || "暂无结果", 42).padEnd(42)} │`,
    "└─────────────────────────────────────────────────┘",
    "────────────────── Input ──────────────────",
    "",
  ];
  return lines.join("\n");
}
