import crypto from "node:crypto";
import { fetch } from "undici";

/**
 * Binance CEX API 客户端基类
 *
 * 功能：
 * - 签名请求 (HMAC SHA256)
 * - 通用 HTTP 封装
 * - 重试机制
 * - 速率限制感知
 */
export class BinanceApiClient {
  constructor(options = {}) {
    this.baseUrl = String(options.baseUrl ?? "https://api.binance.com").replace(/\/$/, "");
    this.apiKey = String(options.apiKey ?? "");
    this.apiSecret = String(options.apiSecret ?? "");
    this.timeout = Number(options.timeout ?? 5000);
    this.recvWindow = Number(options.recvWindow ?? 5000);
    this.logger = options.logger || console;
    this.retryAttempts = Number(options.retryAttempts ?? 3);
    this.retryDelay = Number(options.retryDelay ?? 100);
  }

  /**
   * 请求权限检查
   */
  requireAuth(needsSignature = false) {
    if (!this.apiKey) {
      throw new Error("API Key 不能为空");
    }
    if (needsSignature && !this.apiSecret) {
      throw new Error("API Secret 不能为空（需要签名）");
    }
  }

  /**
   * 生成签名
   */
  sign(params = {}, recvWindow = null) {
    const timestamp = Date.now();
    const queryParams = {
      ...params,
      timestamp,
      recvWindow: recvWindow ?? this.recvWindow,
    };

    const queryString = Object.entries(queryParams)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value ?? ""))}`)
      .join("&");

    const signature = crypto
      .createHmac("sha256", this.apiSecret)
      .update(queryString)
      .digest("hex");

    queryParams.signature = signature;
    return { queryString: `${queryString}&signature=${signature}`, params: queryParams };
  }

  /**
   * 执行 HTTP 请求（带重试）
   */
  async request(method, endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const isGet = method.toUpperCase() === "GET";
    const needsAuth = Boolean(options.auth);
    const needsSignature = Boolean(options.signature);

    if (needsAuth) {
      this.requireAuth(needsSignature);
    }

    let finalUrl = url;
    let body = null;

    if (needsSignature) {
      const signed = this.sign(options.data ?? {}, options.recvWindow);
      if (isGet) {
        finalUrl = `${url}?${signed.queryString}`;
      } else {
        body = new URLSearchParams(signed.params).toString();
      }
    } else if (!isGet && options.data) {
      body = new URLSearchParams(options.data).toString();
    }

    const headers = {
      "Content-Type": "application/x-www-form-urlencoded",
      ...(needsAuth && { "X-MBX-APIKEY": this.apiKey }),
      ...options.headers,
    };

    let lastError;
    for (let attempt = 0; attempt < this.retryAttempts; attempt += 1) {
      try {
        const response = await fetch(finalUrl, {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(this.timeout),
        });

        if (!response.ok) {
          const text = await response.text();
          const status = response.status;
          if (status === 429) {
            // 速率限制，延迟后重试
            if (attempt < this.retryAttempts - 1) {
              await new Promise((resolve) => setTimeout(resolve, this.retryDelay * (2 ** attempt)));
              continue;
            }
          }
          throw new Error(`HTTP ${status}: ${text}`);
        }

        const json = await response.json();
        return {
          ok: true,
          data: json,
          status: response.status,
        };
      } catch (error) {
        lastError = error;
        if (attempt < this.retryAttempts - 1) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelay * (attempt + 1)));
        }
      }
    }

    throw new Error(`请求失败（${this.retryAttempts} 次重试后）: ${lastError?.message ?? "未知错误"}`);
  }

  /**
   * GET 请求
   */
  async get(endpoint, options = {}) {
    return this.request("GET", endpoint, options);
  }

  /**
   * POST 请求
   */
  async post(endpoint, options = {}) {
    return this.request("POST", endpoint, options);
  }

  /**
   * DELETE 请求
   */
  async delete(endpoint, options = {}) {
    return this.request("DELETE", endpoint, options);
  }

  /**
   * PUT 请求
   */
  async put(endpoint, options = {}) {
    return this.request("PUT", endpoint, options);
  }
}

export default BinanceApiClient;
