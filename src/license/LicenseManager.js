/**
 * LiveBot.LicenseManager — 服务端授权验证 (SCF Proxy)
 *
 * 验证流程:
 *   validate()  → background → SCF /api/verify  → 返回 { valid, tier, expiry }
 *   activate()  → background → SCF /api/activate → 返回 { success, expiry }
 *   renew()     → background → SCF /api/renew    → 静默续期
 *
 * 安全要点:
 *   - verify 发送当前机器码，非缓存机器码（防拷贝）
 *   - 离线兜底校验机器码 + 7 天离线宽限期
 *   - 缓存带 lastVerifiedAt，超期离线拒绝
 *
 * Key 格式: LIVEBOT-XXXX-XXXX-XXXX-XXXX (27字符)
 * 密钥仅存于 SCF 环境变量, 客户端无法获取
 */
window.LiveBot = window.LiveBot || {};

(function() {
  const LM = {};

  const KEY_PREFIX = 'LIVEBOT-';
  const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 离线宽限期 7 天

  function isValidKeyFormat(rawKey) {
    const cleaned = rawKey.replace(/-/g, '').toUpperCase();
    return cleaned.length === 23 && /^LIVEBOT[0-9A-F]{16}$/.test(cleaned);
  }

  /**
   * 验证 License — 优先在线，失败离线兜底
   */
  LM.validate = async () => {
    const license = await window.LiveBot.Storage.getLicense();
    if (!license || !license.key || !license.machineCode) {
      return { valid: false, tier: 'free', reason: '无有效授权' };
    }

    const currentMachineCode = await window.LiveBot.MachineCode.generate();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'VERIFY_LICENSE',
        machineCode: currentMachineCode,
        licenseKey: license.key
      });

      if (response && response.valid) {
        license.expiry = response.expiry;
        license.lastVerifiedAt = Date.now();
        license.machineCode = currentMachineCode;
        await window.LiveBot.Storage.setLicense(license);
        return { valid: true, tier: 'vip', expiry: response.expiry };
      }

      return { valid: false, tier: 'free', reason: response?.reason || '验证失败' };

    } catch (e) {
      // === 离线兜底 ===
      // 1. 机器码必须匹配（防拷贝到其他电脑）
      if (currentMachineCode !== license.machineCode) {
        await window.LiveBot.Storage.setLicense({ tier: 'free' });
        return { valid: false, tier: 'free', reason: '设备信息已变更，请重新激活' };
      }

      // 2. 连续离线超过宽限期必须联网一次
      const lastOnline = license.lastVerifiedAt || license.activatedAt || 0;
      if (Date.now() - lastOnline > OFFLINE_GRACE_MS) {
        return { valid: false, tier: 'free', reason: '离线时间过长，请联网验证' };
      }

      // 3. 过期检查
      if (license.expiry && Date.now() < license.expiry) {
        const remaining = Math.floor((license.expiry - Date.now()) / 86400000);
        return { valid: true, tier: 'vip', expiry: license.expiry,
          _offline: true, _remainingDays: remaining };
      }

      return { valid: false, tier: 'free', reason: '授权已过期' };
    }
  };

  /**
   * 激活 License
   */
  LM.activate = async (licenseKey) => {
    const formatted = licenseKey.trim().toUpperCase();

    if (!formatted.startsWith(KEY_PREFIX)) {
      return { success: false, error: '授权Key格式无效，格式: LIVEBOT-XXXX-XXXX-XXXX-XXXX' };
    }

    if (!isValidKeyFormat(formatted)) {
      return { success: false, error: '授权Key格式无效' };
    }

    const machineCode = await window.LiveBot.MachineCode.getOrCreate();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'ACTIVATE_LICENSE',
        machineCode,
        licenseKey: formatted
      });

      if (response && response.success) {
        const license = {
          key: formatted,
          machineCode,
          tier: 'vip',
          expiry: response.expiry,
          activatedAt: Date.now(),
          lastVerifiedAt: Date.now()
        };
        await window.LiveBot.Storage.setLicense(license);

        window.dispatchEvent(new CustomEvent('livebot:license:changed', {
          detail: { tier: 'vip', expiry: response.expiry }
        }));

        return { success: true, expiry: response.expiry };
      }

      return { success: false, error: response?.error || '激活失败' };

    } catch (e) {
      return { success: false, error: '连接验证服务器失败: ' + e.message };
    }
  };

  /**
   * 静默续期 — 在线时后台调用，更新本地过期时间
   */
  LM.renew = async () => {
    const license = await window.LiveBot.Storage.getLicense();
    if (!license || !license.key) return false;

    const currentMachineCode = await window.LiveBot.MachineCode.generate();

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'RENEW_LICENSE',
        machineCode: currentMachineCode,
        licenseKey: license.key
      });

      if (response && response.valid) {
        license.expiry = response.expiry;
        license.lastVerifiedAt = Date.now();
        license.machineCode = currentMachineCode;
        await window.LiveBot.Storage.setLicense(license);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  };

  LM.getMachineCode = async () => {
    return window.LiveBot.MachineCode.getOrCreate();
  };

  LM.getTier = async () => {
    const license = await window.LiveBot.Storage.getLicense();
    return (license && license.tier) || 'free';
  };

  LM.isVip = async () => {
    const result = await LM.validate();
    return result.valid && result.tier === 'vip';
  };

  LM.isVipFeature = async (feature) => {
    const vipFeatures = ['aiComment'];
    if (!vipFeatures.includes(feature)) return true;
    return LM.isVip();
  };

  window.LiveBot.LicenseManager = LM;
})();
