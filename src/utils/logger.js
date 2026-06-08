/**
 * LiveBot.Logger — 日志系统，通过 CustomEvent 通知 UI
 */
window.LiveBot = window.LiveBot || {};

(function() {
  const L = {};

  const MAX_LOGS = 100;

  L.add = async (entry) => {
    const logEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
      time: new Date().toLocaleTimeString('zh-CN', { hour12: false }),
      type: entry.type || 'info',
      source: entry.source || 'system',
      message: entry.message || '',
      data: entry.data || {}
    };

    await window.LiveBot.Storage.addLog(logEntry);

    window.dispatchEvent(new CustomEvent('livebot:log:added', { detail: logEntry }));

    const prefix = '[LiveBot]';
    const method = logEntry.type === 'error' ? 'error' :
                   logEntry.type === 'warning' ? 'warn' : 'log';
    console[method](`${prefix}[${logEntry.source}] ${logEntry.message}`, logEntry.data);
  };

  L.getAll = () => window.LiveBot.Storage.getLogs();

  L.clear = async () => {
    await window.LiveBot.Storage.clearLogs();
    window.dispatchEvent(new CustomEvent('livebot:log:cleared'));
  };

  window.LiveBot.Logger = L;
})();
