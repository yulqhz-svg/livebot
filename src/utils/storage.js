/**
 * LiveBot.Storage — chrome.storage.local 异步封装
 */
window.LiveBot = window.LiveBot || {};

(function() {
  const S = {};

  const KEYS = { CONFIG: 'config', STATS: 'stats', LOGS: 'logs', LICENSE: 'license' };

  S.get = async (key) => {
    try {
      const result = await chrome.storage.local.get(key);
      return result[key];
    } catch (e) {
      console.error('[LiveBot] Storage.get failed:', e);
      return null;
    }
  };

  S.set = async (key, value) => {
    try {
      await chrome.storage.local.set({ [key]: value });
      return true;
    } catch (e) {
      console.error('[LiveBot] Storage.set failed:', e);
      return false;
    }
  };

  S.getDefaultConfig = () => ({
    likeEnabled: false,
    likeMinPerMinute: 10,
    likeMaxPerMinute: 50,

    commentEnabled: false,
    commentIntervalMin: 60,
    commentIntervalMax: 120,
    commentMode: 'random',
    comments: [],

    aiCommentEnabled: false,
    aiCommentIntervalMin: 120,
    aiCommentIntervalMax: 180,
    aiPersona: 'buyer',
    aiCustomPrompt: '',

    sidebarWidth: 400,
    sidebarCollapsed: false
  });

  S.getDefaultStats = () => ({
    totalLikes: 0,
    todayLikes: 0,
    totalComments: 0,
    todayComments: 0,
    totalAiComments: 0,
    todayAiComments: 0,
    lastResetDate: new Date().toDateString()
  });

  S.getConfig = async () => {
    const config = await S.get(KEYS.CONFIG);
    return config || S.getDefaultConfig();
  };

  S.setConfig = (config) => S.set(KEYS.CONFIG, config);

  S.getStats = async () => {
    let stats = await S.get(KEYS.STATS);
    if (!stats) stats = S.getDefaultStats();
    const today = new Date().toDateString();
    if (stats.lastResetDate !== today) {
      stats.todayLikes = 0;
      stats.todayComments = 0;
      stats.todayAiComments = 0;
      stats.lastResetDate = today;
      await S.set(KEYS.STATS, stats);
    }
    return stats;
  };

  S.setStats = (stats) => S.set(KEYS.STATS, stats);

  S.getLogs = async () => {
    const logs = await S.get(KEYS.LOGS);
    return logs || [];
  };

  S.addLog = async (entry) => {
    let logs = await S.getLogs();
    logs.unshift({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      ...entry
    });
    if (logs.length > 100) logs = logs.slice(0, 100);
    return S.set(KEYS.LOGS, logs);
  };

  S.clearLogs = () => S.set(KEYS.LOGS, []);

  S.getLicense = async () => {
    const lic = await S.get(KEYS.LICENSE);
    return lic || { tier: 'free', key: null, machineCode: null, expiry: null, activatedAt: null };
  };

  S.setLicense = (license) => S.set(KEYS.LICENSE, license);

  window.LiveBot.Storage = S;
})();
