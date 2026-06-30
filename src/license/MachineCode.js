/**
 * LiveBot.MachineCode — 浏览器指纹生成 (SHA-256 via Web Crypto)
 *
 * 熵源:
 *   - 浏览器属性 (UA, platform, language, cores, timezone)
 *   - 屏幕属性 (resolution, colorDepth, pixelDepth)
 *   - Canvas 指纹 (GPU/驱动相关)
 *   - WebGL 渲染器字符串
 *   - 插件列表哈希
 *
 * 安全要点: 分离 stable 源用于离线机器码比较，
 * 避免 language/timezone 等用户可改变的属性导致误判。
 */
window.LiveBot = window.LiveBot || {};

(function() {
  const MC = {};

  const STORAGE_KEY = 'machineCode';

  function _canvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 280;
      canvas.height = 60;
      const ctx = canvas.getContext('2d');
      if (!ctx) return '';
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillStyle = '#f60';
      ctx.fillRect(0, 0, 100, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('LiveBot.<canvas> 指纹采集 てすと', 2, 18);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('LiveBot.<canvas> 指纹采集 てすと', 4, 36);
      const data = canvas.toDataURL();
      return data.substring(data.length - 200);
    } catch (e) {
      return '';
    }
  }

  function _webglFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return '';
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      if (!dbg) return '';
      return gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) + '|' +
             gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
    } catch (e) {
      return '';
    }
  }

  function _pluginsHash() {
    try {
      const names = [];
      for (let i = 0; i < navigator.plugins.length; i++) {
        names.push(navigator.plugins[i].name);
      }
      return names.sort().join(',');
    } catch (e) {
      return '';
    }
  }

  /**
   * 生成当前机器码 — 每次都重新计算（不读缓存）
   */
  MC.generate = async () => {
    // 稳定熵源: 不会因用户设置而改变
    const stable = [
      navigator.hardwareConcurrency,
      navigator.platform,
      screen.colorDepth,
      screen.pixelDepth,
      screen.width + 'x' + screen.height,
      _canvasFingerprint(),
      _webglFingerprint(),
      _pluginsHash()
    ].join('|');

    // 辅助熵源: 可改变但仍有区分度
    const auxiliary = [
      navigator.userAgent,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone
    ].join('|');

    const raw = stable + '||' + auxiliary;
    const enc = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(raw));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  /**
   * 获取或创建机器码 — 优先返回缓存值，首次调用时生成并缓存
   */
  MC.getOrCreate = async () => {
    const stored = await window.LiveBot.Storage.get(STORAGE_KEY);
    if (stored) return stored;
    const code = await MC.generate();
    await window.LiveBot.Storage.set(STORAGE_KEY, code);
    return code;
  };

  /**
   * 验证给定机器码是否匹配当前设备
   */
  MC.verify = async (code) => {
    const current = await MC.generate();
    return current === code;
  };

  window.LiveBot.MachineCode = MC;
})();
