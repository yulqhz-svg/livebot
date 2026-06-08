/**
 * LiveBot.AutoLike — 自动点赞引擎
 * 正态分布随机间隔，模拟双击事件
 */
window.LiveBot = window.LiveBot || {};

(function() {
  class AutoLike {
    constructor(config = {}) {
      this.config = {
        enabled: config.enabled || false,
        minPerMinute: config.minPerMinute || 10,
        maxPerMinute: config.maxPerMinute || 50
      };
      this.state = { isRunning: false, totalLikes: 0, todayLikes: 0 };
      this._timers = [];
    }

    start() {
      if (this.state.isRunning || !this.config.enabled) return;
      this.state.isRunning = true;
      this._log('info', '自动点赞已启动', { min: this.config.minPerMinute, max: this.config.maxPerMinute });
      this._scheduleMinute();
      this._emit('livebot:like:started');
    }

    stop() {
      if (!this.state.isRunning) return;
      this.state.isRunning = false;
      this._clearTimers();
      this._log('info', '自动点赞已停止', { total: this.state.totalLikes, today: this.state.todayLikes });
      this._emit('livebot:like:stopped');
    }

    updateConfig(config) {
      const wasRunning = this.state.isRunning;
      this.config = { ...this.config, ...config };
      if (wasRunning && !this.config.enabled) this.stop();
      else if (!wasRunning && this.config.enabled) this.start();
    }

    getStats() {
      return { total: this.state.totalLikes, today: this.state.todayLikes };
    }

    _scheduleMinute() {
      if (!this.state.isRunning) return;
      const count = window.LiveBot.Helpers.normalDistribution(this.config.minPerMinute, this.config.maxPerMinute);
      const intervals = this._generateIntervals(count);

      intervals.forEach(ms => {
        const t = setTimeout(() => {
          if (!this.state.isRunning) return;
          this._performLike();
        }, ms);
        this._timers.push(t);
      });

      const nextMinute = setTimeout(() => this._scheduleMinute(), 60000);
      this._timers.push(nextMinute);
    }

    _generateIntervals(count) {
      const points = [];
      for (let i = 0; i < count; i++) points.push(Math.random() * 60000);
      points.sort((a, b) => a - b);
      for (let i = 1; i < points.length; i++) {
        if (points[i] - points[i - 1] < 500) points[i] = points[i - 1] + 500;
      }
      return points;
    }

    async _performLike() {
      try {
        const video = window.LiveBot.ElementFinder.findLiveVideo();
        if (!video) { this._log('warning', '未找到视频元素'); return; }

        const rect = video.getBoundingClientRect();
        let cx = rect.left + rect.width / 2 + (Math.random() - 0.5) * 60;
        let cy = rect.top + rect.height * 0.65 + (Math.random() - 0.5) * 50;
        cx = Math.max(rect.left + 10, Math.min(rect.right - 10, cx));
        cy = Math.max(rect.top + 10, Math.min(rect.bottom - 10, cy));

        const target = document.elementFromPoint(cx, cy) || video;
        await this._doubleClick(target, cx, cy);

        this.state.totalLikes++;
        this.state.todayLikes++;
        this._log('success', '点赞完成', { total: this.state.totalLikes });
        this._emit('livebot:like:success', { count: this.state.totalLikes, today: this.state.todayLikes });

      } catch (e) {
        this._log('error', '点赞异常: ' + e.message);
      }
    }

    async _doubleClick(target, cx, cy) {
      const events = [
        { type: 'mousedown', button: 0, buttons: 1, detail: 1 },
        { type: 'mouseup', button: 0, buttons: 0, detail: 1 },
        { type: 'click', button: 0, buttons: 0, detail: 1 },
        { type: 'mousedown', button: 0, buttons: 1, detail: 1 },
        { type: 'mouseup', button: 0, buttons: 0, detail: 1 },
        { type: 'click', button: 0, buttons: 0, detail: 2 },
        { type: 'dblclick', button: 0, buttons: 0, detail: 2 }
      ];

      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        target.dispatchEvent(new MouseEvent(ev.type, {
          bubbles: true, cancelable: true, view: window,
          clientX: cx, clientY: cy,
          screenX: cx + (window.screenX || 0), screenY: cy + (window.screenY || 0),
          button: ev.button, buttons: ev.buttons, detail: ev.detail
        }));
        if (i === 2) await window.LiveBot.Helpers.delay(80 + Math.random() * 40);
        else if (i < events.length - 1) await window.LiveBot.Helpers.delay(10 + Math.random() * 15);
      }
    }

    _clearTimers() {
      this._timers.forEach(clearTimeout);
      this._timers = [];
    }

    _log(type, msg, data = {}) {
      window.LiveBot.Logger.add({ type, source: 'like', message: msg, data });
    }

    _emit(name, detail = {}) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }

  window.LiveBot.AutoLike = AutoLike;
})();
