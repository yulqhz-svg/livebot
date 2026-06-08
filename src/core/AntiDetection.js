/**
 * LiveBot.AntiDetection — 反检测机制
 * 隐藏自动化特征，模拟人类行为
 */
window.LiveBot = window.LiveBot || {};

(function() {
  const AD = {};

  AD.init = () => {
    AD.hideWebdriver();
    AD.hideChrome();
    AD.randomizePlugins();
  };

  AD.hideWebdriver = () => {
    try {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined, configurable: true });
      delete navigator.webdriver;
      const origDefine = Object.defineProperty;
      Object.defineProperty = function(obj, prop, desc) {
        if (prop === 'webdriver') return obj;
        return origDefine.call(this, obj, prop, desc);
      };
    } catch (e) { /* ignore */ }
  };

  AD.hideChrome = () => {
    try {
      if (window.chrome?.loadTimes) {
        window.chrome.loadTimes = () => ({
          requestTime: performance.now(), startLoadTime: performance.now(),
          commitLoadTime: performance.now(), finishDocumentLoadTime: performance.now(),
          finishLoadTime: performance.now(), firstPaintTime: 0,
          firstPaintAfterLoadTime: 0, navigationType: 'Other'
        });
      }
      if (window.chrome?.csi) {
        window.chrome.csi = () => ({ startE: performance.now(), onloadT: Date.now(), pageT: performance.now() });
      }
    } catch (e) { /* ignore */ }
  };

  AD.randomizePlugins = () => {
    try {
      Object.defineProperty(navigator, 'plugins', {
        get: () => [{
          name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer',
          description: 'Portable Document Format'
        }]
      });
      Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en']
      });
    } catch (e) { /* ignore */ }
  };

  AD.humanDelay = (min, max) => window.LiveBot.Helpers.normalDistribution(min, max);

  AD.generateMousePath = (fromX, fromY, toX, toY, steps = 10) => {
    const path = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      path.push({
        x: fromX + (toX - fromX) * t + (Math.random() - 0.5) * 15,
        y: fromY + (toY - fromY) * t + (Math.random() - 0.5) * 15
      });
    }
    return path;
  };

  AD.simulateMouseMove = async (element) => {
    const rect = element.getBoundingClientRect();
    const targetX = rect.left + rect.width / 2 + (Math.random() - 0.5) * 40;
    const targetY = rect.top + rect.height / 2 + (Math.random() - 0.5) * 20;
    element.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true, cancelable: true, view: window,
      clientX: targetX, clientY: targetY
    }));
  };

  // Auto-initialize on load
  AD.init();

  window.LiveBot.AntiDetection = AD;
})();
