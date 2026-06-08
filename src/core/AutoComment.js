/**
 * LiveBot.AutoComment — 模板评论引擎
 * 支持 random / sequence / smart 三种发送模式
 * 发送间隔在 intervalMin ~ intervalMax 区间内随机
 */
window.LiveBot = window.LiveBot || {};

(function() {
  class AutoComment {
    constructor(config = {}) {
      this.config = {
        enabled: config.enabled || false,
        intervalMin: config.intervalMin || 60,
        intervalMax: config.intervalMax || 120,
        mode: config.mode || 'random',
        comments: config.comments || []
      };
      this.state = {
        isRunning: false, isSending: false,
        totalComments: 0, todayComments: 0,
        currentIndex: 0, recentComments: [], retryCount: 0
      };
      this._timerId = null;
    }

    start() {
      if (this.state.isRunning || !this.config.enabled) return;
      if (!this.config.comments.length) {
        this.config.comments = ['支持主播！加油~'];
      }
      this.state.isRunning = true;
      this._log('info', '自动评论已启动', { min: this.config.intervalMin, max: this.config.intervalMax, mode: this.config.mode });
      this._scheduleNext();
      this._emit('livebot:comment:started');
    }

    stop() {
      if (!this.state.isRunning) return;
      this.state.isRunning = false;
      if (this._timerId) { clearTimeout(this._timerId); this._timerId = null; }
      this._log('info', '自动评论已停止', { total: this.state.totalComments, today: this.state.todayComments });
      this._emit('livebot:comment:stopped');
    }

    updateConfig(config) {
      const prevEnabled = this.config.enabled;
      this.config = { ...this.config, ...config };
      if (prevEnabled && !this.config.enabled) this.stop();
      else if (!prevEnabled && this.config.enabled) this.start();
    }

    getStats() {
      return { total: this.state.totalComments, today: this.state.todayComments };
    }

    _scheduleNext() {
      if (!this.state.isRunning) return;
      if (this._timerId) { clearTimeout(this._timerId); this._timerId = null; }
      const min = this.config.intervalMin * 1000;
      const max = this.config.intervalMax * 1000;
      const next = Math.max(3000, min + Math.random() * (max - min));
      this._timerId = setTimeout(() => this._sendComment(), Math.round(next));
    }

    async _sendComment() {
      if (!this.state.isRunning || this.state.isSending) return;
      this.state.isSending = true;

      try {
        const input = window.LiveBot.ElementFinder.findCommentInput();
        if (!input) {
          this._log('warning', '未找到评论输入框');
          this._scheduleNext();
          return;
        }

        const comment = this._selectComment();
        if (!comment) {
          this._scheduleNext();
          return;
        }

        await this._simulateInput(input, comment);

        this.state.totalComments++;
        this.state.todayComments++;
        this._recordComment(comment);
        this.state.retryCount = 0;

        this._log('success', '评论发送成功', { text: comment.substring(0, 30) });
        this._emit('livebot:comment:success', { text: comment, total: this.state.totalComments, today: this.state.todayComments });
        this._scheduleNext();

      } catch (e) {
        this._log('error', '评论发送失败: ' + e.message);
        this._handleRetry(e.message);
      } finally {
        this.state.isSending = false;
      }
    }

    _selectComment() {
      const { comments, mode } = this.config;
      if (!comments.length) return null;

      switch (mode) {
        case 'random':
          return comments[Math.floor(Math.random() * comments.length)];

        case 'sequence':
          return comments[this.state.currentIndex++ % comments.length];

        case 'smart': {
          const available = comments.filter(c => !this.state.recentComments.includes(c));
          const pool = available.length > 0 ? available : comments;
          return pool[Math.floor(Math.random() * pool.length)];
        }

        default:
          return comments[0];
      }
    }

    _recordComment(comment) {
      this.state.recentComments.unshift(comment);
      if (this.state.recentComments.length > 10) this.state.recentComments.pop();
    }

    async _simulateInput(element, text) {
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await window.LiveBot.Helpers.delay(100 + Math.random() * 200);

      // Clear
      if (element.tagName === 'TEXTAREA') {
        element.value = '';
      } else if (element.isContentEditable) {
        element.innerHTML = '';
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await window.LiveBot.Helpers.delay(100);

      // Type character by character
      for (let i = 0; i < text.length; i++) {
        if (element.tagName === 'TEXTAREA') {
          element.value += text[i];
        } else if (element.isContentEditable) {
          element.innerHTML += text[i];
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await window.LiveBot.Helpers.delay(30 + Math.random() * 50);
      }

      await window.LiveBot.Helpers.delay(200 + Math.random() * 200);

      // Send via Enter
      element.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13
      }));
      await window.LiveBot.Helpers.delay(50);

      // Clear after send
      if (element.tagName === 'TEXTAREA') element.value = '';
      else if (element.isContentEditable) element.innerHTML = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    _handleRetry(reason) {
      this.state.retryCount++;
      if (this.state.retryCount <= 3) {
        this._log('info', `第${this.state.retryCount}次重试...`, { reason });
        setTimeout(() => this._sendComment(), 2000 * this.state.retryCount);
      } else {
        this.state.retryCount = 0;
        this._scheduleNext();
      }
    }

    _log(type, msg, data = {}) {
      window.LiveBot.Logger.add({ type, source: 'comment', message: msg, data });
    }

    _emit(name, detail = {}) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }

  window.LiveBot.AutoComment = AutoComment;
})();
