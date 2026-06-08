/**
 * LiveBot.AiComment — DeepSeek AI 智能评论引擎 (VIP专属)
 * 采集直播上下文 + persona设定 + 评论历史 → DeepSeek生成 → 模拟发送
 */
window.LiveBot = window.LiveBot || {};

(function() {
  const PERSONAS = {
    buyer: '你是一个真实的35-55岁买家，正在认真观看直播挑选商品。你的评论语气像普通消费者，会问价格、质量、使用感受等实际问题。',
    fan: '你是主播的忠实粉丝，经常来看直播。评论热情友好，会跟主播互动，夸主播推荐的东西好。',
    passerby: '你是一个偶然刷到的路人观众，有点好奇但还在观望。评论简短随意，偶尔会问一两个问题。',
    expert: '你是一个懂行的老手，对这类产品比较了解。评论会显得比较专业，会关注细节和性价比。',
    newbie: '你是一个新手小白，什么都不太懂。评论会问一些基础问题，语气比较谦虚。'
  };

  class AiComment {
    constructor(config = {}) {
      this.config = {
        enabled: config.enabled || false,
        intervalMin: config.intervalMin || 120,
        intervalMax: config.intervalMax || 180,
        aiPersona: config.aiPersona || 'buyer',
        aiCustomPrompt: config.aiCustomPrompt || ''
      };
      this.state = {
        isRunning: false, isGenerating: false, isSending: false,
        totalComments: 0, todayComments: 0,
        commentHistory: [], retryCount: 0
      };
      this._timerId = null;
    }

    start() {
      if (this.state.isRunning || !this.config.enabled) return;
      this.state.isRunning = true;
      this._log('info', 'AI智能评论已启动', { persona: this.config.aiPersona, min: this.config.intervalMin, max: this.config.intervalMax });
      this._scheduleNext();
      this._emit('livebot:comment:started', { ai: true });
    }

    stop() {
      if (!this.state.isRunning) return;
      this.state.isRunning = false;
      if (this._timerId) { clearTimeout(this._timerId); this._timerId = null; }
      this._log('info', 'AI智能评论已停止', { total: this.state.totalComments, today: this.state.todayComments });
      this._emit('livebot:comment:stopped', { ai: true });
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
      const next = Math.max(5000, min + Math.random() * (max - min));
      this._timerId = setTimeout(() => this._generateAndSend(), Math.round(next));
    }

    async _generateAndSend() {
      if (!this.state.isRunning || this.state.isGenerating || this.state.isSending) {
        if (this.state.isRunning) this._scheduleNext();
        return;
      }

      this.state.isGenerating = true;
      this._emit('livebot:ai:generating', { status: 'generating' });

      try {
        const context = this._buildContext();
        const prompt = this._buildPrompt(context);

        const response = await chrome.runtime.sendMessage({
          action: 'CALL_DEEPSEEK',
          payload: {
            model: 'deepseek-chat',
            messages: [{ role: 'user', content: prompt }],
            max_tokens: 80,
            temperature: 1.0,
            frequency_penalty: 1.5,
            presence_penalty: 0.6
          }
        });

        if (!response || !response.success) {
          throw new Error(response?.error || 'API请求失败');
        }

        let text = response.data?.choices?.[0]?.message?.content || '';
        text = this._cleanResponse(text);

        if (!text) {
          this._log('warning', 'AI返回内容为空，跳过本次');
          this._scheduleNext();
          return;
        }

        const input = window.LiveBot.ElementFinder.findCommentInput();
        if (!input) {
          this._log('warning', '未找到评论输入框');
          this._scheduleNext();
          return;
        }

        this._emit('livebot:ai:generating', { status: 'sending', text });

        await this._simulateInput(input, text);

        this.state.commentHistory.unshift(text);
        if (this.state.commentHistory.length > 15) this.state.commentHistory.pop();
        this.state.totalComments++;
        this.state.todayComments++;
        this.state.retryCount = 0;

        this._log('success', 'AI评论发送成功', { text: text.substring(0, 30) });
        this._emit('livebot:comment:success', { text, total: this.state.totalComments, today: this.state.todayComments, ai: true });
        this._scheduleNext();

      } catch (e) {
        this._log('error', 'AI评论生成失败: ' + e.message);
        this._emit('livebot:ai:generating', { status: 'error', error: e.message });
        this._handleRetry();
      } finally {
        this.state.isGenerating = false;
      }
    }

    _buildContext() {
      try {
        return window.LiveBot.ElementFinder.getLiveRoomInfo();
      } catch (e) {
        return { title: '', anchor: '', tags: [], recentDanmu: [], url: location.href };
      }
    }

    _buildPrompt(context) {
      const persona = PERSONAS[this.config.aiPersona] || PERSONAS.buyer;

      let prompt = `${persona}

请根据以下直播间信息，生成一条15字以内的抖音直播间弹幕评论。

【直播间信息】
标题: ${context.title || '未知'}
主播: ${context.anchor || '未知'}
`;

      if (context.tags.length) prompt += `标签: ${context.tags.join('、')}\n`;

      if (context.recentDanmu.length) {
        prompt += `\n【最近的弹幕】\n${context.recentDanmu.slice(0, 5).join('\n')}\n`;
      }

      if (this.config.aiCustomPrompt) {
        prompt += `\n【额外要求】\n${this.config.aiCustomPrompt}\n`;
      }

      if (this.state.commentHistory.length) {
        const recent = this.state.commentHistory.slice(0, 5);
        prompt += `\n【你最近发过的评论（不要重复）】\n${recent.join('\n')}\n`;
      }

      prompt += '\n只输出弹幕评论内容本身，不要任何解释、引号或标点包裹。';
      return prompt;
    }

    _cleanResponse(text) {
      return text
        .replace(/^["'「『""\s]+/, '')
        .replace(/["'」』""\s]+$/, '')
        .replace(/^[：:]\s*/, '')
        .replace(/^弹幕[：:]\s*/i, '')
        .replace(/^评论[：:]\s*/i, '')
        .replace(/\n/g, ' ')
        .trim()
        .substring(0, 30);
    }

    async _simulateInput(element, text) {
      element.focus();
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await window.LiveBot.Helpers.delay(100 + Math.random() * 300);

      if (element.tagName === 'TEXTAREA') {
        element.value = '';
      } else if (element.isContentEditable) {
        element.innerHTML = '';
      }
      element.dispatchEvent(new Event('input', { bubbles: true }));
      await window.LiveBot.Helpers.delay(100);

      for (let i = 0; i < text.length; i++) {
        if (element.tagName === 'TEXTAREA') {
          element.value += text[i];
        } else if (element.isContentEditable) {
          element.innerHTML += text[i];
        }
        element.dispatchEvent(new Event('input', { bubbles: true }));
        await window.LiveBot.Helpers.delay(40 + Math.random() * 60);
      }

      await window.LiveBot.Helpers.delay(300 + Math.random() * 300);

      element.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true, cancelable: true, key: 'Enter', code: 'Enter', keyCode: 13
      }));
      await window.LiveBot.Helpers.delay(50);

      if (element.tagName === 'TEXTAREA') element.value = '';
      else if (element.isContentEditable) element.innerHTML = '';
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    _handleRetry() {
      this.state.retryCount++;
      if (this.state.retryCount <= 3) {
        this._log('info', `AI评论第${this.state.retryCount}次重试...`);
        setTimeout(() => { if (this.state.isRunning) this._generateAndSend(); }, 3000 * this.state.retryCount);
      } else {
        this.state.retryCount = 0;
        this._scheduleNext();
      }
    }

    _log(type, msg, data = {}) {
      window.LiveBot.Logger.add({ type, source: 'ai', message: msg, data });
    }

    _emit(name, detail = {}) {
      window.dispatchEvent(new CustomEvent(name, { detail }));
    }
  }

  window.LiveBot.AiComment = AiComment;
})();
