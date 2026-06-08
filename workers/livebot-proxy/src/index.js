/**
 * LiveBot Proxy — Cloudflare Worker
 *
 * 功能:
 *   POST /api/chat        — DeepSeek API 代理（验证 License + 限流）
 *   POST /api/admin/set-key — 管理员更换 DeepSeek API Key
 *   GET  /api/health       — 健康检查
 *
 * 密钥管理（通过 wrangler secret 设置）:
 *   DEEPSEEK_API_KEY — DeepSeek API Key（首次部署必设）
 *   LICENSE_SECRET   — 授权 HMAC 密钥（必须与 LicenseManager.js 一致）
 *   ADMIN_SECRET     — 管理员密钥（用于更换 API Key）
 */

const EPOCH_DATE = new Date('2025-01-01');
const KEY_PREFIX = 'LIVEBOT-';

// === 限流 ===
class RateLimiter {
  constructor(maxRequests, windowSec) {
    this.max = maxRequests;
    this.windowMs = windowSec * 1000;
    this.store = new Map();
  }

  check(key) {
    const now = Date.now();
    let entry = this.store.get(key);
    if (!entry || now - entry.windowStart > this.windowMs) {
      entry = { windowStart: now, count: 0 };
      this.store.set(key, entry);
    }
    entry.count++;
    return entry.count <= this.max;
  }

  // 定期清理过期条目
  gc() {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.windowStart > this.windowMs * 2) {
        this.store.delete(key);
      }
    }
  }
}

// === HMAC License 验证（与 LicenseManager.js 逻辑完全一致）===
async function hmacSign(message, secretHex) {
  const encoder = new TextEncoder();
  const secretBytes = new Uint8Array(
    secretHex.match(/.{1,2}/g).map((b) => parseInt(b, 16))
  );
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function extractHex(rawKey) {
  return rawKey.replace(KEY_PREFIX, '').replace(/-/g, '');
}

async function validateLicense(machineCode, licenseKey, licenseSecret) {
  if (!machineCode || !licenseKey) {
    return { valid: false, reason: '缺少机器码或授权Key' };
  }

  const hexKey = extractHex(licenseKey);
  if (hexKey.length !== 16 || !/^[0-9a-f]{16}$/i.test(hexKey)) {
    return { valid: false, reason: '授权Key格式无效' };
  }

  const sigHex = hexKey.substring(0, 8).toLowerCase();
  const xoredHex = hexKey.substring(8, 16).toLowerCase();
  const sigNum = parseInt(sigHex, 16);
  const expiryDays = (parseInt(xoredHex, 16) ^ sigNum) >>> 0;
  const expiryDate = new Date(EPOCH_DATE.getTime() + expiryDays * 86400000);

  if (Date.now() > expiryDate.getTime()) {
    return { valid: false, reason: '授权已过期' };
  }

  const message = `${machineCode}:vip:${expiryDays}`;
  const expectedSig = (await hmacSign(message, licenseSecret)).substring(0, 8);

  if (sigHex !== expectedSig) {
    return { valid: false, reason: '授权签名无效，设备不匹配' };
  }

  return { valid: true, expiry: expiryDate.getTime() };
}

// === 请求处理 ===
async function handleChat(request, env) {
  const machineCode = request.headers.get('X-Machine-Code') || '';
  const licenseKey = request.headers.get('X-License-Key') || '';

  // License 验证
  const licenseSecret = env.LICENSE_SECRET;
  if (!licenseSecret) {
    return jsonResponse(500, { error: '服务未配置 LICENSE_SECRET' });
  }

  const licenseResult = await validateLicense(machineCode, licenseKey, licenseSecret);
  if (!licenseResult.valid) {
    return jsonResponse(403, { error: licenseResult.reason });
  }

  // 限流
  const limiter = new RateLimiter(
    parseInt(env.RATE_LIMIT_MAX) || 30,
    parseInt(env.RATE_LIMIT_WINDOW) || 60
  );
  if (!limiter.check(machineCode)) {
    return jsonResponse(429, { error: '请求过于频繁，请稍后再试' });
  }

  // DeepSeek API Key
  const apiKey = env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: '服务未配置 DEEPSEEK_API_KEY' });
  }

  // 读取请求体
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse(400, { error: '无效的请求体' });
  }

  // 转发到 DeepSeek
  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      return jsonResponse(res.status, {
        error: data.error?.message || 'DeepSeek API 请求失败',
      });
    }

    return jsonResponse(200, data);
  } catch (e) {
    return jsonResponse(502, { error: 'DeepSeek API 连接失败: ' + e.message });
  }
}

async function handleAdminSetKey(request, env) {
  const adminSecret = request.headers.get('X-Admin-Secret') || '';
  const expectedSecret = env.ADMIN_SECRET;

  if (!expectedSecret) {
    return jsonResponse(500, { error: '服务未配置 ADMIN_SECRET' });
  }
  if (adminSecret !== expectedSecret) {
    return jsonResponse(401, { error: '管理员密钥错误' });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: '无效的请求体' });
  }

  const newKey = body.apiKey;
  if (!newKey || !newKey.startsWith('sk-')) {
    return jsonResponse(400, { error: '无效的 API Key 格式，应以 sk- 开头' });
  }

  // Cloudflare Workers 不支持运行时更新 Secret
  // 返回提示，通过 wrangler CLI 或 Dashboard 更新
  return jsonResponse(200, {
    message: '请通过以下命令更新 API Key:',
    command: `wrangler secret put DEEPSEEK_API_KEY`,
    note: 'Cloudflare Workers Secrets 不支持运行时修改，请使用 wrangler CLI 或 Cloudflare Dashboard → Workers & Pages → livebot-proxy → Settings → Variables & Secrets',
  });
}

// === 入口 ===
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, X-Machine-Code, X-License-Key, X-Admin-Secret',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json',
    };

    try {
      if (url.pathname === '/api/chat' && request.method === 'POST') {
        return await handleChat(request, env);
      }

      if (url.pathname === '/api/admin/set-key' && request.method === 'POST') {
        return await handleAdminSetKey(request, env);
      }

      if (url.pathname === '/api/health') {
        return new Response(
          JSON.stringify({ status: 'ok', hasApiKey: !!env.DEEPSEEK_API_KEY }),
          { headers: corsHeaders }
        );
      }

      return new Response(JSON.stringify({ error: 'Not Found' }), {
        status: 404,
        headers: corsHeaders,
      });
    } catch (e) {
      return new Response(
        JSON.stringify({ error: '内部错误: ' + e.message }),
        { status: 500, headers: corsHeaders }
      );
    }
  },
};

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
