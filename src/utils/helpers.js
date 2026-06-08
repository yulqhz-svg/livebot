/**
 * LiveBot.Helpers — 纯工具函数 (无依赖)
 */
window.LiveBot = window.LiveBot || {};

(function() {
  const H = {};

  H.delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  H.randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  H.randomFloat = (min, max) => Math.random() * (max - min) + min;

  H.normalDistribution = (min, max) => {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    const mean = (min + max) / 2;
    const stdDev = (max - min) / 4;
    let result = Math.round(mean + z * stdDev);
    return Math.max(min, Math.min(max, result));
  };

  H.isVisible = (el) => {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 &&
           style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0';
  };

  H.waitForElement = (selector, timeout = 10000) => {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el && H.isVisible(el)) return resolve(el);
      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el && H.isVisible(el)) {
          observer.disconnect();
          resolve(el);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
  };

  H.escapeHtml = (text) => {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, c => map[c]);
  };

  H.generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  };

  H.formatTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return [h, m, s].map(v => String(v).padStart(2, '0')).join(':');
  };

  H.clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  H.debounce = (fn, wait) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
  };

  H.throttle = (fn, limit) => {
    let lastCall = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastCall >= limit) {
        lastCall = now;
        fn(...args);
      }
    };
  };

  window.LiveBot.Helpers = H;
})();
