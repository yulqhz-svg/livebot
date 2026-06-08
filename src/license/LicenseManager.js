/**
 * LiveBot.LicenseManager — 服务端授权验证 (SCF Proxy)
 *
 * 验证流程:
 *   validate()  → background → SCF /api/verify  → 返回 { valid, tier, expiry }
 *   activate()  → background → SCF /api/activate → 返回 { success, expiry }
 *
 * 离线兜底: SCF 不可用时, 使用本地缓存的 expiry 判断 (24h 内有效)
 *
 * Key 格式: LIVEBOT-XXXX-XXXX-XXXX-XXXX (27字符)
 * 密钥仅存于 SCF 环境变量, 客户端无法获取
 */
window.LiveBot = window.LiveBot || {};

(function() {
  const LM = {};

  const KEY_PREFIX = 'LIVEBOT-';

  function isValidKeyFormat(rawKey) {
    const cleaned = rawKey.replace(/-/g, '').toUpperCase();
    return cleaned.length === 23 && /^LIVEBOT[0-9A-F]{16}$/.test(cleaned);
  }

  LM.validate = async () => {
    const license = await window.LiveBot.Storage.getLicense();
    if (!license || !license.key || !license.machineCode) {
      return { valid: false, tier: 'free', reason: '无有效授权' };
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: 'VERIFY_LICENSE',
        machineCode: license.machineCode,
        licenseKey: license.key
      });

      if (response && response.valid) {
        // 更新本地缓存的过期时间
        license.expiry = response.expiry;
        await window.LiveBot.Storage.setLicense(license);
        return { valid: true, tier: 'vip', expiry: response.expiry };
      }

      return { valid: false, tier: 'free', reason: response?.reason || '验证失败' };

    } catch (e) {
      // 离线兜底: 使用上次成功验证的过期时间
      if (license.expiry && Date.now() < license.expiry) {
        const remaining = Math.floor((license.expiry - Date.now()) / 86400000);
        return { valid: true, tier: 'vip', expiry: license.expiry,
          _offline: true, _remainingDays: remaining };
      }
      return { valid: false, tier: 'free', reason: '无法连接验证服务器' };
    }
  };

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
          activatedAt: Date.now()
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
