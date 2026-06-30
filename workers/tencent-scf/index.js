/**
 * LiveBot Proxy — 腾讯云函数 SCF + Function URL
 *
 * 端点:
 *   POST /api/chat          — DeepSeek API 代理（验证 License）
 *   POST /api/verify        — License 验证
 *   POST /api/activate      — License 激活
 *   POST /api/generate-key  — 管理端生成授权 Key（需 ADMIN_SECRET）
 *   GET  /api/health        — 健康检查
 *
 * 环境变量（SCF 控制台 → 函数配置 → 环境变量）:
 *   DEEPSEEK_API_KEY — DeepSeek API Key
 *   LICENSE_SECRET   — 授权 HMAC 密钥（32字节 hex，仅存服务端）
 *   ADMIN_SECRET     — 管理端密钥（用于生成授权 Key）
 *   REVOKED_KEYS     — 已撤销的 Key，逗号分隔（可选）
 */

const crypto = require('crypto');

const EPOCH_DATE = new Date('2025-01-01');
const KEY_PREFIX = 'LIVEBOT-';
const MAX_DEVICES = parseInt(process.env.ACTIVE_DEVICES || '1');

// 激活设备追踪 (生产环境替换为持久化数据库)
const deviceRegistry = new Map(); // licenseKey → Set of machineCodes

// === HMAC ===
function hmacSign(message, secretHex) {
  return crypto.createHmac('sha256', Buffer.from(secretHex, 'hex'))
    .update(message)
    .digest('hex');
}

function extractHex(rawKey) {
  return rawKey.replace(KEY_PREFIX, '').replace(/-/g, '');
}

function isRevoked(licenseKey) {
  const revoked = (process.env.REVOKED_KEYS || '').split(',').map(s => s.trim().toUpperCase());
  return revoked.includes(licenseKey.trim().toUpperCase());
}

function parseLicenseKey(hexKey) {
  if (hexKey.length !== 16 || !/^[0-9a-f]{16}$/i.test(hexKey)) return null;
  const sigHex = hexKey.substring(0, 8).toLowerCase();
  const xoredHex = hexKey.substring(8, 16).toLowerCase();
  const sigNum = parseInt(sigHex, 16);
  const expiryDays = (parseInt(xoredHex, 16) ^ sigNum) >>> 0;
  const expiryDate = new Date(EPOCH_DATE.getTime() + expiryDays * 86400000);
  return { sigHex, expiryDays, expiryDate };
}

function validateLicenseInternal(machineCode, licenseKey, licenseSecret) {
  if (!machineCode || !licenseKey) {
    return { valid: false, reason: '缺少机器码或授权Key' };
  }

  const hexKey = extractHex(licenseKey);
  const parsed = parseLicenseKey(hexKey);
  if (!parsed) {
    return { valid: false, reason: '授权Key格式无效' };
  }

  if (Date.now() > parsed.expiryDate.getTime()) {
    return { valid: false, reason: '授权已过期' };
  }

  if (isRevoked(licenseKey)) {
    return { valid: false, reason: '授权已被撤销' };
  }

  const message = `${machineCode}:vip:${parsed.expiryDays}`;
  const expectedSig = hmacSign(message, licenseSecret).substring(0, 8);

  if (parsed.sigHex !== expectedSig) {
    return { valid: false, reason: '授权签名无效，设备不匹配' };
  }

  return { valid: true, expiry: parsed.expiryDate.getTime() };
}

// === 响应 ===
function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify(body)
  };
}

function readBody(event) {
  if (!event.body) return null;
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    return typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

// === 主入口 ===
exports.main_handler = async (event) => {
  const path = event.path || '/';
  const method = (event.httpMethod || event.requestContext?.httpMethod || 'GET').toUpperCase();

  // CORS 预检
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Machine-Code, X-License-Key',
        'Access-Control-Max-Age': '86400'
      },
      body: ''
    };
  }

  const licenseSecret = process.env.LICENSE_SECRET;
  if (!licenseSecret) {
    return jsonResponse(500, { error: '服务未配置 LICENSE_SECRET' });
  }

  // 健康检查
  if (path === '/api/health' && method === 'GET') {
    return jsonResponse(200, {
      status: 'ok',
      hasApiKey: !!process.env.DEEPSEEK_API_KEY,
      hasLicenseSecret: true
    });
  }

  // DeepSeek 代理
  if (path === '/api/chat' && method === 'POST') {
    return handleChat(event, licenseSecret);
  }

  // License 验证
  if (path === '/api/verify' && method === 'POST') {
    return handleVerify(event, licenseSecret);
  }

  // License 激活
  if (path === '/api/activate' && method === 'POST') {
    return handleActivate(event, licenseSecret);
  }

  // License 续期
  if (path === '/api/renew' && method === 'POST') {
    return handleRenew(event, licenseSecret);
  }

  // 管理端: 生成授权 Key
  if (path === '/api/generate-key' && method === 'POST') {
    return handleGenerateKey(event, licenseSecret);
  }

  // 管理端: 撤销授权 Key
  if (path === '/api/revoke' && method === 'POST') {
    return handleRevoke(event, licenseSecret);
  }

  return jsonResponse(404, { error: 'Not Found' });
};

// === POST /api/chat ===
async function handleChat(event, licenseSecret) {
  const headers = event.headers || {};
  const machineCode = headers['x-machine-code'] || headers['X-Machine-Code'] || '';
  const licenseKey = headers['x-license-key'] || headers['X-License-Key'] || '';

  const licenseResult = validateLicenseInternal(machineCode, licenseKey, licenseSecret);
  if (!licenseResult.valid) {
    return jsonResponse(403, { error: licenseResult.reason });
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: '服务未配置 DEEPSEEK_API_KEY' });
  }

  const payload = readBody(event);
  if (!payload) {
    return jsonResponse(400, { error: '无效的请求体' });
  }

  try {
    const https = require('https');
    const body = JSON.stringify(payload);

    const result = await new Promise((resolve, reject) => {
      const req = https.request('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey
        },
        timeout: 30000
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode, data: { error: '响应解析失败' } });
          }
        });
      });
      req.on('error', (e) => reject(e));
      req.on('timeout', () => { req.destroy(); reject(new Error('请求超时')); });
      req.write(body);
      req.end();
    });

    if (result.status !== 200) {
      return jsonResponse(result.status, {
        error: result.data.error?.message || 'DeepSeek API 请求失败'
      });
    }

    return jsonResponse(200, result.data);
  } catch (e) {
    return jsonResponse(502, { error: 'DeepSeek API 连接失败: ' + e.message });
  }
}

// === POST /api/verify ===
function handleVerify(event, licenseSecret) {
  const body = readBody(event);
  if (!body) return jsonResponse(400, { error: '无效的请求体' });

  const { machineCode, licenseKey } = body;
  const result = validateLicenseInternal(machineCode, licenseKey, licenseSecret);

  if (!result.valid) {
    return jsonResponse(200, { valid: false, tier: 'free', reason: result.reason });
  }

  return jsonResponse(200, { valid: true, tier: 'vip', expiry: result.expiry });
}

// === POST /api/activate ===
function handleActivate(event, licenseSecret) {
  const body = readBody(event);
  if (!body) return jsonResponse(400, { error: '无效的请求体' });

  const { machineCode, licenseKey } = body;
  const formatted = (licenseKey || '').trim().toUpperCase();

  if (!formatted.startsWith(KEY_PREFIX)) {
    return jsonResponse(200, { success: false, error: '授权Key格式无效' });
  }

  const result = validateLicenseInternal(machineCode, formatted, licenseSecret);

  if (!result.valid) {
    return jsonResponse(200, { success: false, error: result.reason });
  }

  // 设备绑定检查
  const devices = deviceRegistry.get(formatted) || new Set();
  if (devices.size >= MAX_DEVICES && !devices.has(machineCode)) {
    return jsonResponse(200, { success: false, error: '该 License 已绑定其他设备，如需换绑请联系管理员' });
  }
  devices.add(machineCode);
  deviceRegistry.set(formatted, devices);

  return jsonResponse(200, { success: true, expiry: result.expiry });
}

// === POST /api/renew ===
function handleRenew(event, licenseSecret) {
  const body = readBody(event);
  if (!body) return jsonResponse(400, { error: '无效的请求体' });

  const { machineCode, licenseKey } = body;
  const result = validateLicenseInternal(machineCode, licenseKey, licenseSecret);

  if (!result.valid) {
    return jsonResponse(200, { valid: false, tier: 'free', reason: result.reason });
  }

  return jsonResponse(200, { valid: true, tier: 'vip', expiry: result.expiry });
}

// === POST /api/revoke (管理端) ===
function handleRevoke(event, licenseSecret) {
  const body = readBody(event);
  if (!body) return jsonResponse(400, { error: '无效的请求体' });

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return jsonResponse(500, { error: '服务未配置 ADMIN_SECRET' });
  }

  const { adminToken, licenseKey } = body;

  if (adminToken !== adminSecret) {
    return jsonResponse(403, { error: '管理端密钥无效' });
  }

  if (!licenseKey) {
    return jsonResponse(400, { error: '缺少 licenseKey' });
  }

  // 追加到环境变量（运行时生效，实例回收前有效）
  const current = process.env.REVOKED_KEYS || '';
  const formatted = licenseKey.trim().toUpperCase();
  if (!current.split(',').map(s => s.trim().toUpperCase()).includes(formatted)) {
    process.env.REVOKED_KEYS = current ? current + ',' + formatted : formatted;
  }

  // 清除设备绑定
  deviceRegistry.delete(formatted);

  return jsonResponse(200, { revoked: true, licenseKey: formatted });
}

// === POST /api/generate-key (管理端) ===
function handleGenerateKey(event, licenseSecret) {
  const body = readBody(event);
  if (!body) return jsonResponse(400, { error: '无效的请求体' });

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return jsonResponse(500, { error: '服务未配置 ADMIN_SECRET' });
  }

  const { adminToken, machineCode, expiryDays } = body;

  if (adminToken !== adminSecret) {
    return jsonResponse(403, { error: '管理端密钥无效' });
  }

  const days = parseInt(expiryDays, 10);
  if (!machineCode || !Number.isFinite(days) || days < 1 || days > 36500) {
    return jsonResponse(400, { error: '参数无效: machineCode 和 expiryDays(1-36500) 为必填' });
  }

  const message = `${machineCode}:vip:${days}`;
  const fullSig = hmacSign(message, licenseSecret);
  const sigHex = fullSig.substring(0, 8);
  const sigNum = parseInt(sigHex, 16);
  const xoredNum = (days ^ sigNum) >>> 0;
  const xoredHex = xoredNum.toString(16).padStart(8, '0');
  const hex = sigHex + xoredHex;
  const key = KEY_PREFIX + hex.match(/.{1,4}/g).join('-').toUpperCase();

  return jsonResponse(200, {
    success: true,
    licenseKey: key,
    machineCode,
    expiryDays: days,
    expiryDate: new Date(EPOCH_DATE.getTime() + days * 86400000).toISOString()
  });
}
