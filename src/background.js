/**
 * LiveBot Service Worker (ES Module)
 * 后台: 消息处理 + DeepSeek API 代理 + 定价信息 + keep-alive
 */

const STORAGE_KEYS = { CONFIG: 'config', STATS: 'stats', LOGS: 'logs', LICENSE: 'license' };

// 腾讯云函数 SCF 后端代理地址
let PROXY_URL = 'https://1329618480-3amy44f1jn.ap-guangzhou.tencentscf.com';

// 会员套餐定价 — 单列模板，直接修改此数组即可
const PRICING_INFO = {
  lines: [
    { text: '1个月 — ¥89',   note: '短期体验' },
    { text: '1个季度 — ¥189', note: '日常运营' },
    { text: '1年 ⭐推荐 — ¥669', note: '长期使用' },
  ]
};

const DEFAULT_CONFIG = {
  likeEnabled: false, likeMinPerMinute: 10, likeMaxPerMinute: 50,
  commentEnabled: false, commentIntervalMin: 60, commentIntervalMax: 120, commentMode: 'random', comments: [],
  aiCommentEnabled: false, aiCommentIntervalMin: 120, aiCommentIntervalMax: 180, aiPersona: 'buyer',
  aiCustomPrompt: '',
  sidebarWidth: 400, sidebarCollapsed: false
};

const DEFAULT_STATS = {
  totalLikes: 0, todayLikes: 0,
  totalComments: 0, todayComments: 0,
  totalAiComments: 0, todayAiComments: 0,
  lastResetDate: new Date().toDateString()
};

// === Lifecycle ===
chrome.runtime.onInstalled.addListener(async () => {
  const cfg = (await chrome.storage.local.get(STORAGE_KEYS.CONFIG))[STORAGE_KEYS.CONFIG];
  if (!cfg) await chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: DEFAULT_CONFIG });
  const st = (await chrome.storage.local.get(STORAGE_KEYS.STATS))[STORAGE_KEYS.STATS];
  if (!st) await chrome.storage.local.set({ [STORAGE_KEYS.STATS]: DEFAULT_STATS });
});

chrome.alarms.create('keepalive', { periodInMinutes: 4.9 });
chrome.alarms.onAlarm.addListener(() => {});

// === Message Handlers ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});

async function handleMessage(message) {
  const { action } = message;
  try {
    switch (action) {
      case 'GET_CONFIG':
        return (await chrome.storage.local.get(STORAGE_KEYS.CONFIG))[STORAGE_KEYS.CONFIG] || DEFAULT_CONFIG;

      case 'SET_CONFIG':
        await chrome.storage.local.set({ [STORAGE_KEYS.CONFIG]: message.config });
        return { success: true };

      case 'GET_STATS': {
        let stats = (await chrome.storage.local.get(STORAGE_KEYS.STATS))[STORAGE_KEYS.STATS] || DEFAULT_STATS;
        const today = new Date().toDateString();
        if (stats.lastResetDate !== today) {
          stats.todayLikes = 0; stats.todayComments = 0; stats.todayAiComments = 0;
          stats.lastResetDate = today;
          await chrome.storage.local.set({ [STORAGE_KEYS.STATS]: stats });
        }
        return stats;
      }

      case 'UPDATE_STATS':
        await chrome.storage.local.set({ [STORAGE_KEYS.STATS]: message.stats });
        return { success: true };

      case 'GET_LOGS':
        return (await chrome.storage.local.get(STORAGE_KEYS.LOGS))[STORAGE_KEYS.LOGS] || [];

      case 'ADD_LOG':
        return { success: await addLogEntry(message.entry) };

      case 'CLEAR_LOGS':
        await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: [] });
        return { success: true };

      case 'GET_LICENSE':
        return (await chrome.storage.local.get(STORAGE_KEYS.LICENSE))[STORAGE_KEYS.LICENSE] || { tier: 'free' };

      case 'SET_LICENSE':
        await chrome.storage.local.set({ [STORAGE_KEYS.LICENSE]: message.license });
        return { success: true };

      case 'CALL_DEEPSEEK':
        return await proxyDeepSeek(message.payload);

      case 'VERIFY_LICENSE':
        return await proxyVerify(message.machineCode, message.licenseKey);

      case 'ACTIVATE_LICENSE':
        return await proxyActivate(message.machineCode, message.licenseKey);

      case 'GET_PRICING':
        return PRICING_INFO;

      case 'GET_PROXY_URL':
        return { url: PROXY_URL };

      case 'SET_PROXY_URL':
        if (message.url && message.url.startsWith('https://')) {
          PROXY_URL = message.url;
          return { success: true, url: PROXY_URL };
        }
        return { success: false, error: '代理地址必须以 https:// 开头' };

      default:
        return { success: false, error: 'Unknown action: ' + action };
    }
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function addLogEntry(entry) {
  let logs = (await chrome.storage.local.get(STORAGE_KEYS.LOGS))[STORAGE_KEYS.LOGS] || [];
  logs.unshift({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
    ...entry
  });
  if (logs.length > 100) logs = logs.slice(0, 100);
  await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: logs });
  return true;
}

async function proxyDeepSeek(payload) {
  try {
    // 获取授权信息
    const license = (await chrome.storage.local.get(STORAGE_KEYS.LICENSE))[STORAGE_KEYS.LICENSE] || {};
    const machineCode = license.machineCode || '';
    const licenseKey = license.key || '';

    const res = await fetch(PROXY_URL + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Machine-Code': machineCode,
        'X-License-Key': licenseKey
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (!res.ok) {
      const msg = data.error || '代理请求失败 (' + res.status + ')';
      return { success: false, error: msg, code: res.status };
    }

    return { success: true, data };
  } catch (e) {
    return { success: false, error: '代理连接失败: ' + e.message };
  }
}

async function proxyVerify(machineCode, licenseKey) {
  try {
    const res = await fetch(PROXY_URL + '/api/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineCode, licenseKey })
    });
    return await res.json();
  } catch (e) {
    return { valid: false, tier: 'free', reason: '服务器连接失败: ' + e.message };
  }
}

async function proxyActivate(machineCode, licenseKey) {
  try {
    const res = await fetch(PROXY_URL + '/api/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ machineCode, licenseKey })
    });
    return await res.json();
  } catch (e) {
    return { success: false, error: '服务器连接失败: ' + e.message };
  }
}
