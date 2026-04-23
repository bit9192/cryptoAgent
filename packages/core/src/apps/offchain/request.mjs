const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_COUNT = 1;
const DEFAULT_RETRY_DELAY_MS = 400;

const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetryableError(error) {
  if (!error) return false;
  if (error.name === "AbortError") return false;
  return true;
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined || value === null) continue;
    normalized[String(key)] = String(value);
  }
  return normalized;
}

async function request(options = {}) {
  const {
    url,
    method = "GET",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retryCount = DEFAULT_RETRY_COUNT,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
    parse = "json",
  } = options;

  if (!url || typeof url !== "string") {
    throw new Error("request url 不能为空");
  }

  const finalHeaders = normalizeHeaders(headers);
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: finalHeaders,
        body,
        signal: controller.signal,
      });

      const responseText = await response.text();
      const payload = parse === "text" ? responseText : (responseText ? JSON.parse(responseText) : null);

      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
        error.status = response.status;
        error.url = url;
        error.payload = payload;

        if (attempt < retryCount && RETRYABLE_STATUS_CODES.has(response.status)) {
          attempt += 1;
          await wait(retryDelayMs * attempt);
          continue;
        }

        throw error;
      }

      return {
        ok: true,
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        data: payload,
      };
    } catch (error) {
      if (attempt < retryCount && isRetryableError(error)) {
        attempt += 1;
        await wait(retryDelayMs * attempt);
        continue;
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export async function offchainRequest(options = {}) {
  return await request({ ...options, parse: "json" });
}

export async function offchainGet(url, options = {}) {
  const headers = {
    Accept: "application/json",
    ...(options.headers ?? {}),
  };

  return await offchainRequest({
    ...options,
    url,
    method: "GET",
    headers,
  });
}

export async function offchainPost(url, body, options = {}) {
  const payload = typeof body === "string" ? body : JSON.stringify(body ?? {});
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...(options.headers ?? {}),
  };

  return await offchainRequest({
    ...options,
    url,
    method: "POST",
    body: payload,
    headers,
  });
}

export default {
  offchainRequest,
  offchainGet,
  offchainPost,
};