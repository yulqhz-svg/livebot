/**
 * LiveBot — Content Script 入口 (IIFE)
 * 免费版: 点赞(可调频率) + 模板评论(60s固定, 仅1条)
 * VIP版: 点赞 + 评论(可调间隔+多条模板) + AI智能评论
 */
(function() {
  'use strict';
  if (window.__liveBotLoaded) return;
  window.__liveBotLoaded = true;

  const H = window.LiveBot.Helpers;
  const Storage = window.LiveBot.Storage;
  const Logger = window.LiveBot.Logger;
  const LicenseManager = window.LiveBot.LicenseManager;
  const MachineCode = window.LiveBot.MachineCode;

  const state = {
    config: null, stats: null, license: null,
    autoLike: null, autoComment: null, aiComment: null,
    floatingBtn: null, sidebar: null, tier: 'free'
  };

  // === Init ===
  async function init() {
    Logger.add({ type: 'info', source: 'system', message: 'LiveBot 正在初始化...' });

    state.config = await Storage.getConfig();
    // Migrate old config format
    if (state.config.commentInterval && !state.config.commentIntervalMin) {
      state.config.commentIntervalMin = state.config.commentInterval;
      state.config.commentIntervalMax = state.config.commentInterval + 60;
      delete state.config.commentInterval;
      await Storage.setConfig(state.config);
    }
    if (state.config.aiCommentInterval && !state.config.aiCommentIntervalMin) {
      state.config.aiCommentIntervalMin = state.config.aiCommentInterval;
      state.config.aiCommentIntervalMax = state.config.aiCommentInterval + 60;
      delete state.config.aiCommentInterval;
      await Storage.setConfig(state.config);
    }
    state.stats = await Storage.getStats();
    state.license = await Storage.getLicense();

    // Validate license
    const result = await LicenseManager.validate();
    state.tier = result.valid ? 'vip' : 'free';
    if (result.valid) {
      state.license.tier = 'vip';
      state.license.expiry = result.expiry;
    }

    // Floating button (left side)
    state.floatingBtn = new window.LiveBot.FloatingButton({
      onClick: () => toggleSidebar()
    });
    state.floatingBtn.create();

    setupEventListeners();

    // Auto-clear logs every 2 hours
    setInterval(async () => {
      await Logger.clear();
    }, 7200000);

    // Periodic license check
    setInterval(async () => {
      const r = await LicenseManager.validate();
      if (state.sidebar) state.sidebar.updateTier(r.valid ? 'vip' : 'free', r.expiry);
      state.tier = r.valid ? 'vip' : 'free';
    }, 3600000);

    Logger.add({ type: 'success', source: 'system', message: `LiveBot 初始化完成 (${state.tier === 'vip' ? 'VIP' : '免费版'})` });
  }

  // === Sidebar Toggle ===
  function toggleSidebar() {
    if (state.sidebar) {
      const host = document.getElementById('livebot-sidebar-host');
      if (host && host.style.display !== 'none') {
        state.sidebar.hide();
        state.floatingBtn.show();
      } else {
        state.sidebar.show();
        state.floatingBtn.hide();
      }
      return;
    }
    createSidebar();
  }

  function createSidebar() {
    state.sidebar = new window.LiveBot.Sidebar({
      width: state.config.sidebarWidth,
      collapsed: false
    });

    state.sidebar.onToggleLike = (enabled) => handleLikeToggle(enabled);
    state.sidebar.onToggleComment = (enabled) => handleCommentToggle(enabled);
    state.sidebar.onToggleAiComment = (enabled) => handleAiCommentToggle(enabled);
    state.sidebar.onSave = (config) => saveConfig(config);
    state.sidebar.onReset = () => resetConfig();
    state.sidebar.onClose = () => { state.floatingBtn.show(); };
    state.sidebar.onLicenseActivated = () => refreshLicense();

    state.sidebar.create();
    state.sidebar.setConfig(state.config, state.tier);
    state.sidebar.updateTier(state.tier, state.license.expiry);

    // Restore logs
    Storage.getLogs().then(logs => {
      logs.slice(0, 50).reverse().forEach(e => state.sidebar.addLog(e));
    });

    refreshEngineStatus();
    state.floatingBtn.hide();
  }

  // Read fresh values from sidebar (not stale storage config)
  function _getSidebarConfig() {
    try {
      return state.sidebar ? state.sidebar.getConfig() : null;
    } catch (e) {
      return null;
    }
  }

  // === Engine Toggles ===
  function handleLikeToggle(enabled) {
    state.config.likeEnabled = enabled;
    if (enabled) {
      const sc = _getSidebarConfig();
      const minPerMinute = sc ? sc.likeMinPerMinute : state.config.likeMinPerMinute;
      const maxPerMinute = sc ? sc.likeMaxPerMinute : state.config.likeMaxPerMinute;

      if (!state.autoLike) {
        state.autoLike = new window.LiveBot.AutoLike({
          enabled: true, minPerMinute, maxPerMinute
        });
      } else {
        state.autoLike.updateConfig({ enabled: true, minPerMinute, maxPerMinute });
      }
      state.autoLike.start();
    } else {
      if (state.autoLike) state.autoLike.stop();
    }
    updateRunningIndicator();
  }

  function handleCommentToggle(enabled) {
    state.config.commentEnabled = enabled;
    if (enabled) {
      const sc = _getSidebarConfig();
      // Free tier: force 60s interval + only first line
      const intervalMin = state.tier === 'vip'
        ? (sc ? sc.commentIntervalMin : state.config.commentIntervalMin) || 60
        : 60;
      const intervalMax = state.tier === 'vip'
        ? (sc ? sc.commentIntervalMax : state.config.commentIntervalMax) || 120
        : 60;
      let comments = sc ? (sc.comments || []) : (state.config.comments || []);
      const mode = sc ? (sc.commentMode || 'random') : (state.config.commentMode || 'random');
      if (state.tier !== 'vip') comments = comments.slice(0, 1);
      if (!comments.length) comments = ['支持主播！加油~'];

      if (!state.autoComment) {
        state.autoComment = new window.LiveBot.AutoComment({
          enabled: true, intervalMin, intervalMax, mode, comments
        });
      } else {
        state.autoComment.updateConfig({ enabled: true, intervalMin, intervalMax, mode, comments });
      }
      state.autoComment.start();
    } else {
      if (state.autoComment) state.autoComment.stop();
    }
    updateRunningIndicator();
  }

  function handleAiCommentToggle(enabled) {
    if (enabled) {
      if (state.tier !== 'vip') {
        state.config.aiCommentEnabled = false;
        if (state.sidebar) state.sidebar.setConfig(state.config, state.tier);
        Logger.add({ type: 'warning', source: 'ai', message: 'AI评论需要VIP授权' });
        return;
      }
    }
    state.config.aiCommentEnabled = enabled;
    if (enabled) {
      const sc = _getSidebarConfig();
      const intervalMin = sc ? sc.aiCommentIntervalMin : state.config.aiCommentIntervalMin;
      const intervalMax = sc ? sc.aiCommentIntervalMax : state.config.aiCommentIntervalMax;
      const aiPersona = sc ? sc.aiPersona : state.config.aiPersona;
      const aiCustomPrompt = sc ? sc.aiCustomPrompt : state.config.aiCustomPrompt;

      if (!state.aiComment) {
        state.aiComment = new window.LiveBot.AiComment({
          enabled: true, intervalMin, intervalMax, aiPersona, aiCustomPrompt
        });
      } else {
        state.aiComment.updateConfig({ enabled: true, intervalMin, intervalMax, aiPersona, aiCustomPrompt });
      }
      state.aiComment.start();
    } else {
      if (state.aiComment) state.aiComment.stop();
    }
    updateRunningIndicator();
  }

  // === Save / Reset ===
  async function saveConfig(newConfig) {
    state.config = { ...state.config, ...newConfig };
    await Storage.setConfig(state.config);

    if (state.autoLike) {
      state.autoLike.updateConfig({
        minPerMinute: state.config.likeMinPerMinute,
        maxPerMinute: state.config.likeMaxPerMinute,
        enabled: state.config.likeEnabled
      });
    }
    if (state.autoComment) {
      state.autoComment.updateConfig({
        intervalMin: state.config.commentIntervalMin || 60,
        intervalMax: state.config.commentIntervalMax || 120,
        mode: state.config.commentMode || 'random',
        comments: state.config.comments || [],
        enabled: state.config.commentEnabled
      });
      // Restart immediately so new template takes effect right away
      state.autoComment.stop();
      if (state.config.commentEnabled) {
        state.autoComment.start();
      }
    }
    if (state.aiComment) {
      state.aiComment.updateConfig({
        intervalMin: state.config.aiCommentIntervalMin || 120,
        intervalMax: state.config.aiCommentIntervalMax || 180,
        aiPersona: state.config.aiPersona,
        aiCustomPrompt: state.config.aiCustomPrompt,
        enabled: state.config.aiCommentEnabled
      });
    }
    Logger.add({ type: 'success', source: 'system', message: '配置已保存，模板已更新' });
  }

  async function resetConfig() {
    state.config = Storage.getDefaultConfig();
    if (state.autoLike) state.autoLike.stop();
    if (state.autoComment) state.autoComment.stop();
    if (state.aiComment) state.aiComment.stop();
    state.autoLike = null;
    state.autoComment = null;
    state.aiComment = null;
    if (state.sidebar) state.sidebar.setConfig(state.config, state.tier);
    await Storage.setConfig(state.config);
    updateRunningIndicator();
    Logger.add({ type: 'info', source: 'system', message: '已恢复默认配置' });
  }

  async function refreshLicense() {
    state.license = await Storage.getLicense();
    const result = await LicenseManager.validate();
    state.tier = result.valid ? 'vip' : 'free';
    if (state.sidebar) {
      state.sidebar.updateTier(state.tier, result.expiry);
      state.sidebar.setConfig(state.config, state.tier);
    }
    // Stop AI engine if license expired
    if (state.tier !== 'vip' && state.aiComment) {
      state.aiComment.stop();
      state.config.aiCommentEnabled = false;
    }
    updateRunningIndicator();
  }

  function updateRunningIndicator() {
    if (state.sidebar) {
      const likeRunning = state.autoLike && state.autoLike.state.isRunning;
      const cmtRunning = state.autoComment && state.autoComment.state.isRunning;
      const aiRunning = state.aiComment && state.aiComment.state.isRunning;
      state.sidebar.updateStatus({ like: likeRunning, comment: cmtRunning, ai: aiRunning });
    }
  }

  function setupEventListeners() {
    window.addEventListener('livebot:comment:success', (e) => {
      if (e.detail.ai) {
        state.stats.totalAiComments = (state.stats.totalAiComments || 0) + 1;
        state.stats.todayAiComments = (state.stats.todayAiComments || 0) + 1;
      } else {
        state.stats.totalComments = (state.stats.totalComments || 0) + 1;
        state.stats.todayComments = (state.stats.todayComments || 0) + 1;
      }
      Storage.setStats(state.stats);
      if (state.sidebar) state.sidebar.updateStats(state.stats);
    });

    window.addEventListener('livebot:like:success', () => {
      state.stats.totalLikes = (state.stats.totalLikes || 0) + 1;
      state.stats.todayLikes = (state.stats.todayLikes || 0) + 1;
      Storage.setStats(state.stats);
      if (state.sidebar) state.sidebar.updateStats(state.stats);
    });

    window.addEventListener('livebot:comment:started', (e) => {
      const run = e.detail.ai ? 'ai' : 'comment';
      updateRunningIndicator();
    });

    window.addEventListener('livebot:comment:stopped', (e) => {
      const run = e.detail.ai ? 'ai' : 'comment';
      updateRunningIndicator();
    });

    window.addEventListener('livebot:license:changed', (e) => {
      refreshLicense();
    });

    window.addEventListener('livebot:log:added', (e) => {
      if (state.sidebar) state.sidebar.addLog(e.detail);
    });

    window.addEventListener('livebot:log:cleared', () => {
      if (state.sidebar) state.sidebar.clearLogs();
    });
  }

  function refreshEngineStatus() {
    updateRunningIndicator();
    if (state.sidebar) state.sidebar.updateStats(state.stats);
  }

  // === Start ===
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
