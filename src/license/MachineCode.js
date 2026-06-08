/**
 * LiveBot.MachineCode — 浏览器指纹生成 (SHA-256 via Web Crypto)
 */
window.LiveBot = window.LiveBot || {};

(function() {
  const MC = {};

  const STORAGE_KEY = 'machineCode';

  MC.generate = async () => {
    const fp = [
      navigator.userAgent,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      navigator.hardwareConcurrency,
      navigator.platform,
      navigator.language,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
      screen.pixelDepth
    ].join('|');

    const enc = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(fp));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  };

  MC.getOrCreate = async () => {
    const stored = await window.LiveBot.Storage.get(STORAGE_KEY);
    if (stored) return stored;
    const code = await MC.generate();
    await window.LiveBot.Storage.set(STORAGE_KEY, code);
    return code;
  };

  MC.verify = async (code) => {
    const current = await MC.generate();
    return current === code;
  };

  window.LiveBot.MachineCode = MC;
})();
