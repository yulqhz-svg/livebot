/**
 * LiveBot.Sidebar — 主控制面板 (Shadow DOM, 左侧)
 * 免费版: 自动点赞(可调频率) + 模板评论(60s固定,仅1条)
 * VIP版: 点赞 + 评论(可调间隔+多条) + AI评论
 */
window.LiveBot = window.LiveBot || {};

(function() {
  class Sidebar {
    constructor(config = {}) {
      this.config = { width: config.width || 400, collapsed: config.collapsed || false };
      this._container = null;
      this._shadow = null;
      this._el = null;
      this._resizing = false;
      this._membershipPanel = null;
      this._tier = 'free';

      this.onToggleLike = null;
      this.onToggleComment = null;
      this.onToggleAiComment = null;
      this.onSave = null;
      this.onReset = null;
      this.onClose = null;
      this.onLicenseActivated = null;
    }

    create() {
      this._container = document.createElement('div');
      this._container.id = 'livebot-sidebar-host';
      this._shadow = this._container.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = this._getCSS();
      this._shadow.appendChild(style);

      this._el = document.createElement('div');
      this._el.className = 'sidebar' + (this.config.collapsed ? ' collapsed' : '');
      this._el.style.width = this.config.width + 'px';
      this._el.innerHTML = this._getHTML();
      this._shadow.appendChild(this._el);

      document.body.appendChild(this._container);
      this._bindEvents();
      requestAnimationFrame(() => this._el.classList.add('visible'));
      return this;
    }

    show() {
      if (this._container) this._container.style.display = 'block';
    }
    hide() {
      if (this._container) this._container.style.display = 'none';
    }

    toggleCollapse() {
      this.config.collapsed = !this.config.collapsed;
      this._el.classList.toggle('collapsed', this.config.collapsed);
    }

    setConfig(config, tier) {
      const t = tier || this._tier || 'free';
      this._tier = t;

      const likeToggle = this._shadow.querySelector('#like-toggle');
      const likeMin = this._shadow.querySelector('#like-min');
      const likeMax = this._shadow.querySelector('#like-max');
      const cmtToggle = this._shadow.querySelector('#comment-toggle');
      const cmtIntervalMin = this._shadow.querySelector('#comment-interval-min');
      const cmtIntervalMax = this._shadow.querySelector('#comment-interval-max');
      const cmtList = this._shadow.querySelector('#comment-list');
      const aiToggle = this._shadow.querySelector('#ai-toggle');
      const aiIntervalMin = this._shadow.querySelector('#ai-interval-min');
      const aiIntervalMax = this._shadow.querySelector('#ai-interval-max');
      const aiPersona = this._shadow.querySelector('#ai-persona');
      const aiPrompt = this._shadow.querySelector('#ai-prompt');

      if (likeToggle) likeToggle.checked = !!(config.likeEnabled);
      if (likeMin) likeMin.value = config.likeMinPerMinute || 10;
      if (likeMax) likeMax.value = config.likeMaxPerMinute || 50;
      if (cmtToggle) cmtToggle.checked = !!(config.commentEnabled);
      if (cmtIntervalMin) {
        cmtIntervalMin.value = t === 'vip' ? (config.commentIntervalMin || 60) : 60;
        cmtIntervalMin.disabled = t !== 'vip';
      }
      if (cmtIntervalMax) {
        cmtIntervalMax.value = t === 'vip' ? (config.commentIntervalMax || 120) : 60;
        cmtIntervalMax.disabled = t !== 'vip';
      }
      if (cmtList) {
        if (t === 'vip') {
          cmtList.value = (config.comments || []).join('\n');
          cmtList.disabled = false;
          cmtList.rows = 5;
          cmtList.placeholder = '输入预设评论，每行一条...';
        } else {
          const existing = (config.comments && config.comments[0]) || '';
          cmtList.value = existing || '支持主播！加油~';
          cmtList.disabled = false;
          cmtList.rows = 1;
          cmtList.placeholder = '输入1条模板评论';
        }
      }
      // Hide mode selector and import/clear for free tier
      const cmtMode = this._shadow.querySelector('#comment-mode');
      const importBtn = this._shadow.querySelector('#import-comments-btn');
      const clearBtn = this._shadow.querySelector('#clear-comments-btn');
      const cmtModeRow = this._shadow.querySelector('#cmt-mode-row');
      const cmtBtnRow = this._shadow.querySelector('#cmt-btn-row');
      if (cmtMode) cmtMode.value = config.commentMode || 'random';
      if (cmtModeRow) cmtModeRow.style.display = t === 'vip' ? '' : 'none';
      if (cmtBtnRow) cmtBtnRow.style.display = t === 'vip' ? '' : 'none';

      if (aiToggle) aiToggle.checked = !!(config.aiCommentEnabled);
      if (aiIntervalMin) aiIntervalMin.value = config.aiCommentIntervalMin || 120;
      if (aiIntervalMax) aiIntervalMax.value = config.aiCommentIntervalMax || 180;
      if (aiPersona) aiPersona.value = config.aiPersona || 'buyer';
      if (aiPrompt) aiPrompt.value = config.aiCustomPrompt || '';
    }

    getConfig() {
      const t = this._tier || 'free';
      let comments = [];
      if (t === 'vip') {
        comments = this._shadow.querySelector('#comment-list').value
          .split('\n').map(s => s.trim()).filter(s => s.length > 0).slice(0, 50);
      } else {
        const line = (this._shadow.querySelector('#comment-list').value || '').trim();
        comments = line ? [line] : ['支持主播！加油~'];
      }

      return {
        likeEnabled: this._shadow.querySelector('#like-toggle').checked,
        likeMinPerMinute: parseInt(this._shadow.querySelector('#like-min').value) || 10,
        likeMaxPerMinute: parseInt(this._shadow.querySelector('#like-max').value) || 50,
        commentEnabled: this._shadow.querySelector('#comment-toggle').checked,
        commentIntervalMin: t === 'vip' ? (parseInt(this._shadow.querySelector('#comment-interval-min').value) || 60) : 60,
        commentIntervalMax: t === 'vip' ? (parseInt(this._shadow.querySelector('#comment-interval-max').value) || 120) : 60,
        commentMode: t === 'vip' ? this._shadow.querySelector('#comment-mode').value : 'random',
        comments: comments,
        aiCommentEnabled: this._shadow.querySelector('#ai-toggle').checked,
        aiCommentIntervalMin: parseInt(this._shadow.querySelector('#ai-interval-min').value) || 120,
        aiCommentIntervalMax: parseInt(this._shadow.querySelector('#ai-interval-max').value) || 180,
        aiPersona: this._shadow.querySelector('#ai-persona').value,
        aiCustomPrompt: this._shadow.querySelector('#ai-prompt').value,
        sidebarWidth: this.config.width,
        sidebarCollapsed: this.config.collapsed
      };
    }

    updateLikeStatus(running, total) {
      const el = this._shadow.querySelector('#like-status');
      if (el) {
        el.textContent = running ? `运行中 · 已点赞 ${total} 次` : '已停止';
        el.className = 'status-text' + (running ? ' active' : '');
      }
    }

    updateCommentStatus(running, total) {
      const el = this._shadow.querySelector('#comment-status');
      if (el) {
        el.textContent = running ? `运行中 · 已评论 ${total} 次` : '已停止';
        el.className = 'status-text' + (running ? ' active' : '');
      }
    }

    updateAiCommentStatus(running, total, lastText) {
      const el = this._shadow.querySelector('#ai-status');
      const lastEl = this._shadow.querySelector('#ai-last-comment');
      if (el) {
        el.textContent = running ? `运行中 · AI已评论 ${total} 次` : '已停止';
        el.className = 'status-text' + (running ? ' active' : '');
      }
      if (lastEl && lastText) lastEl.textContent = '最近: ' + lastText;
    }

    updateStats(stats) {
      if (!stats) return;
      this.updateLikeStatus(!!(stats.totalLikes > 0 || stats.todayLikes > 0), stats.totalLikes || 0);
      this.updateCommentStatus(!!(stats.totalComments > 0 || stats.todayComments > 0), stats.totalComments || 0);
      this.updateAiCommentStatus(!!(stats.totalAiComments > 0 || stats.todayAiComments > 0), stats.totalAiComments || 0);
    }

    updateStatus(status) {
      if (!status) return;
      this.updateLikeStatus(status.like, this._lastLikeTotal || 0);
      this.updateCommentStatus(status.comment, this._lastCmtTotal || 0);
      this.updateAiCommentStatus(status.ai, this._lastAiTotal || 0);
    }

    setAiGenerating(isGen) {
      const hint = this._shadow.querySelector('#ai-generating-hint');
      if (hint) hint.style.display = isGen ? 'block' : 'none';
    }

    updateTier(tier, expiry) {
      this._tier = tier;
      const badge = this._shadow.querySelector('#tier-badge');
      if (badge) {
        badge.textContent = tier === 'vip' ? 'VIP ✓' : 'VIP';
        badge.className = 'tier-badge tier-' + tier;
      }
      const aiLocked = this._shadow.querySelector('#ai-section-locked');
      if (aiLocked) aiLocked.style.display = tier === 'vip' ? 'none' : 'block';
      const aiToggle = this._shadow.querySelector('#ai-toggle');
      if (aiToggle) {
        aiToggle.disabled = tier !== 'vip';
        if (tier !== 'vip') aiToggle.checked = false;
      }
      // Update comment section for tier
      const cmtIntervalMin = this._shadow.querySelector('#comment-interval-min');
      const cmtIntervalMax = this._shadow.querySelector('#comment-interval-max');
      if (cmtIntervalMin) cmtIntervalMin.disabled = tier !== 'vip';
      if (cmtIntervalMax) cmtIntervalMax.disabled = tier !== 'vip';
    }

    addLog(entry) {
      const list = this._shadow.querySelector('#log-list');
      if (!list) return;
      const item = document.createElement('div');
      item.className = 'log-item log-' + (entry.type || 'info');
      item.innerHTML =
        `<span class="log-time">${window.LiveBot.Helpers.escapeHtml(entry.time || '')}</span>
         <span class="log-msg">${window.LiveBot.Helpers.escapeHtml(entry.message || '')}</span>`;
      list.insertBefore(item, list.firstChild);
      while (list.children.length > 100) list.removeChild(list.lastChild);
    }

    clearLogs() {
      const list = this._shadow.querySelector('#log-list');
      if (list) list.innerHTML = '<div class="log-empty">暂无日志</div>';
    }

    async showMembershipPanel(pricingInfo, tier, expiry, licenseKey) {
      if (this._membershipPanel) this._membershipPanel.remove();
      const panelEl = this._shadow.querySelector('#membership-panel-container');
      if (!panelEl) return;

      let machineCode = '';
      try {
        machineCode = await window.LiveBot.MachineCode.getOrCreate();
      } catch (e) { /* ignore */ }

      this._membershipPanel = this._buildMembershipPanel(pricingInfo, tier, expiry, machineCode, licenseKey);
      panelEl.innerHTML = '';
      panelEl.appendChild(this._membershipPanel);
      panelEl.style.display = 'block';
    }

    hideMembershipPanel() {
      const panelEl = this._shadow.querySelector('#membership-panel-container');
      if (panelEl) panelEl.style.display = 'none';
      if (this._membershipPanel) { this._membershipPanel.remove(); this._membershipPanel = null; }
    }

    destroy() {
      this._resizing = false;
      document.removeEventListener('mousemove', this._onResizeMove);
      document.removeEventListener('mouseup', this._onResizeUp);
      if (this._container?.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }
    }

    // === Private ===

    _buildMembershipPanel(pricingInfo, tier, expiry, machineCode, licenseKey) {
      const wrapper = document.createElement('div');
      wrapper.className = 'membership-panel';
      const info = pricingInfo || {};

      const expiryText = tier === 'vip' && expiry
        ? new Date(expiry).toLocaleDateString('zh-CN')
        : '未开通';

      wrapper.innerHTML = `
        <div class="mp-overlay"></div>
        <div class="mp-modal">
          <div class="mp-header">
            <h3>会员中心</h3>
            <button class="mp-close-btn">&times;</button>
          </div>
          <div class="mp-body">
            <div class="mp-status">
              <span class="mp-label">当前状态</span>
              <span class="mp-value tier-badge tier-${tier}">${tier === 'vip' ? 'VIP会员' : '免费版'}</span>
            </div>
            ${tier === 'vip' ? `<div class="mp-expiry"><span class="mp-label">到期时间</span><span class="mp-value">${expiryText}</span></div>` : ''}
            <div class="mp-pricing">
              <h4>套餐价格</h4>
              ${(info.lines || [
                { text: '1个月 — ¥89', note: '短期体验' },
                { text: '1个季度 — ¥189', note: '日常运营' },
                { text: '1年 ⭐推荐 — ¥669', note: '长期使用' }
              ]).map(item => `
                <div class="mp-plan-line"><span class="mp-plan-text">${item.text}</span><span class="mp-plan-note">${item.note}</span></div>
              `).join('')}
              <div class="mp-qrcodes">
                <div class="mp-qr-item"><img src="${chrome.runtime.getURL('img/1.jpg')}" class="mp-qr-img"><span class="mp-qr-label">微信客服</span></div>
                <div class="mp-qr-item"><img src="${chrome.runtime.getURL('img/2.jpg')}" class="mp-qr-img"><span class="mp-qr-label">备用联系</span></div>
              </div>
            </div>
            ${machineCode ? `
            <div class="mp-machine">
              <label>本机机器码 <span class="mp-machine-hint">(发送此码获取授权Key)</span></label>
              <div class="mp-machine-code">${machineCode}</div>
            </div>` : ''}
            ${tier === 'vip' && licenseKey ? `
            <div class="mp-current-key">
              <label>当前授权Key <span class="mp-key-hint">(重新加载插件后在此粘贴激活)</span></label>
              <div class="mp-key-row">
                <input type="text" class="mp-key-display" value="${licenseKey}" readonly>
                <button class="mp-copy-btn" title="复制Key">📋</button>
              </div>
            </div>` : ''}
            <div class="mp-activate">
              <label>输入授权Key激活</label>
              <input type="text" class="mp-key-input" placeholder="LIVEBOT-XXXX-XXXX-XXXX-XXXX" maxlength="30" autocomplete="off" spellcheck="false">
              <button class="mp-activate-btn">激活</button>
              <div class="mp-activate-msg"></div>
            </div>
          </div>
        </div>
      `;

      wrapper.querySelector('.mp-close-btn').addEventListener('click', () => this.hideMembershipPanel());
      wrapper.querySelector('.mp-overlay').addEventListener('click', () => this.hideMembershipPanel());

      const copyBtn = wrapper.querySelector('.mp-copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', () => {
          const display = wrapper.querySelector('.mp-key-display');
          if (display) {
            navigator.clipboard.writeText(display.value).then(() => {
              copyBtn.textContent = '✓';
              setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
            }).catch(() => {
              display.select();
              document.execCommand('copy');
              copyBtn.textContent = '✓';
              setTimeout(() => { copyBtn.textContent = '📋'; }, 1500);
            });
          }
        });
      }

      wrapper.querySelector('.mp-activate-btn').addEventListener('click', async () => {
        const input = wrapper.querySelector('.mp-key-input');
        const msg = wrapper.querySelector('.mp-activate-msg');
        const key = input.value.trim();
        if (!key) { msg.textContent = '请输入授权Key'; msg.className = 'mp-activate-msg error'; return; }
        const btn = wrapper.querySelector('.mp-activate-btn');
        btn.disabled = true; btn.textContent = '验证中...';
        try {
          const result = await window.LiveBot.LicenseManager.activate(key);
          if (result.success) {
            msg.textContent = '激活成功！VIP功能已解锁';
            msg.className = 'mp-activate-msg success';
            if (this.onLicenseActivated) this.onLicenseActivated(key);
          } else {
            msg.textContent = result.error || '激活失败';
            msg.className = 'mp-activate-msg error';
          }
        } catch (e) {
          msg.textContent = '验证异常: ' + e.message;
          msg.className = 'mp-activate-msg error';
        }
        btn.disabled = false; btn.textContent = '激活';
      });

      return wrapper;
    }

    _bindEvents() {
      this._shadow.querySelector('#collapse-btn')?.addEventListener('click', () => this.toggleCollapse());

      this._shadow.querySelector('#close-btn')?.addEventListener('click', () => {
        this.hide();
        if (this.onClose) this.onClose();
      });

      this._shadow.querySelector('#like-toggle')?.addEventListener('change', (e) => {
        if (this.onToggleLike) this.onToggleLike(e.target.checked);
      });

      this._shadow.querySelector('#comment-toggle')?.addEventListener('change', (e) => {
        if (this.onToggleComment) this.onToggleComment(e.target.checked);
      });

      this._shadow.querySelector('#ai-toggle')?.addEventListener('change', async (e) => {
        if (e.target.checked) {
          if (this._tier !== 'vip') {
            e.target.checked = false;
            alert('AI智能评论是VIP专属功能，请先开通会员');
            return;
          }
        }
        if (this.onToggleAiComment) this.onToggleAiComment(e.target.checked);
      });

      this._shadow.querySelector('#clear-logs-btn')?.addEventListener('click', () => {
        window.LiveBot.Logger.clear();
      });

      this._shadow.querySelector('#save-btn')?.addEventListener('click', () => {
        if (this.onSave) this.onSave(this.getConfig());
      });

      this._shadow.querySelector('#reset-btn')?.addEventListener('click', () => {
        if (this.onReset) this.onReset();
      });

      // VIP badge → membership panel
      this._shadow.querySelector('#tier-badge')?.addEventListener('click', async () => {
        const pricing = await this._fetchPricingInfo();
        const license = await window.LiveBot.Storage.getLicense();
        this.showMembershipPanel(pricing, this._tier || 'free', license?.expiry, license?.key);
      });

      // Resize handle (on right edge since sidebar is on left)
      this._onResizeMove = null;
      this._onResizeUp = null;
      const handle = this._shadow.querySelector('.resize-handle');
      if (handle) {
        handle.addEventListener('mousedown', (e) => {
          this._resizing = true; e.preventDefault();
          this._onResizeMove = (ev) => {
            if (!this._resizing) return;
            const newW = ev.clientX;
            this.config.width = Math.max(320, Math.min(600, newW));
            this._el.style.width = this.config.width + 'px';
          };
          this._onResizeUp = () => {
            this._resizing = false;
            document.removeEventListener('mousemove', this._onResizeMove);
            document.removeEventListener('mouseup', this._onResizeUp);
            this._onResizeMove = null;
            this._onResizeUp = null;
          };
          document.addEventListener('mousemove', this._onResizeMove);
          document.addEventListener('mouseup', this._onResizeUp);
        });
      }

      // Stop input events from bubbling to Douyin
      ['keydown', 'keyup', 'input', 'change'].forEach(evt => {
        this._el.addEventListener(evt, (e) => e.stopPropagation());
      });
    }

    async _fetchPricingInfo() {
      try {
        const resp = await chrome.runtime.sendMessage({ action: 'GET_PRICING' });
        if (resp && resp.lines) return resp;
      } catch (e) { /* fallback */ }
      return null;
    }

    _getHTML() {
      return `
        <div class="resize-handle"></div>
        <div class="sidebar-header">
          <button id="collapse-btn" class="icon-btn" title="折叠">▶</button>
          <h3 class="sidebar-title">LiveBot</h3>
          <span id="tier-badge" class="tier-badge tier-free">VIP</span>
          <button id="close-btn" class="icon-btn" title="关闭">✕</button>
        </div>
        <div class="sidebar-body">

          <!-- Auto Like -->
          <section class="control-section">
            <div class="section-header">
              <label class="toggle-label">
                <input type="checkbox" id="like-toggle" class="toggle-input">
                <span class="toggle-slider"></span>
              </label>
              <h4 class="section-title">自动点赞</h4>
            </div>
            <div class="section-content">
              <div class="input-row">
                <label>频率 (次/分钟)</label>
                <div class="input-pair">
                  <input type="number" id="like-min" min="1" max="60" value="10" class="num-input">
                  <span class="input-sep">—</span>
                  <input type="number" id="like-max" min="1" max="60" value="50" class="num-input">
                </div>
              </div>
              <div id="like-status" class="status-text">已停止</div>
            </div>
          </section>

          <!-- Auto Comment (Template) -->
          <section class="control-section">
            <div class="section-header">
              <label class="toggle-label">
                <input type="checkbox" id="comment-toggle" class="toggle-input">
                <span class="toggle-slider"></span>
              </label>
              <h4 class="section-title">自动评论（模板）</h4>
              <span id="cmt-tier-tag" class="free-tag">免费</span>
            </div>
            <div class="section-content">
              <div class="input-row">
                <label>发送间隔 (秒) <span id="cmt-interval-lock" class="lock-hint">(VIP可调)</span></label>
                <div style="display:flex;gap:6px;align-items:center;">
                  <input type="number" id="comment-interval-min" min="5" max="3600" value="60" class="num-input" style="flex:1;" disabled>
                  <span style="color:#999;">—</span>
                  <input type="number" id="comment-interval-max" min="5" max="3600" value="120" class="num-input" style="flex:1;" disabled>
                </div>
              </div>
              <div class="input-row" id="cmt-mode-row" style="display:none">
                <label>发送模式</label>
                <select id="comment-mode" class="select-input">
                  <option value="random">随机循环</option>
                  <option value="sequence">按顺序</option>
                  <option value="smart">智能去重</option>
                </select>
              </div>
              <div class="input-row">
                <label>评论模板 <span id="cmt-count-hint" class="lock-hint">(免费版仅1条)</span></label>
                <textarea id="comment-list" class="textarea-input" rows="1"
                  placeholder="输入1条模板评论"></textarea>
              </div>
              <div class="btn-row" id="cmt-btn-row" style="display:none">
                <button id="import-comments-btn" class="sm-btn">导入文件</button>
                <button id="clear-comments-btn" class="sm-btn outline">清空</button>
              </div>
              <div id="comment-status" class="status-text">已停止</div>
            </div>
          </section>

          <!-- AI Comment (VIP only) -->
          <section class="control-section">
            <div class="section-header">
              <label class="toggle-label">
                <input type="checkbox" id="ai-toggle" class="toggle-input" disabled>
                <span class="toggle-slider"></span>
              </label>
              <h4 class="section-title">AI 智能评论<span class="deepseek-tag">（接入DeepSeek）</span></h4>
              <span class="vip-tag">VIP</span>
            </div>
            <div id="ai-section-locked" class="ai-locked">
              🔒 开通VIP后解锁AI智能评论
            </div>
            <div class="section-content">
              <div class="input-row">
                <label>发送间隔 (秒)</label>
                <div style="display:flex;gap:6px;align-items:center;">
                  <input type="number" id="ai-interval-min" min="10" max="3600" value="120" class="num-input" style="flex:1;">
                  <span style="color:#999;">—</span>
                  <input type="number" id="ai-interval-max" min="10" max="3600" value="180" class="num-input" style="flex:1;">
                </div>
              </div>
              <div class="input-row">
                <label>AI 人设</label>
                <select id="ai-persona" class="select-input">
                  <option value="buyer">买家视角</option>
                  <option value="fan">忠实粉丝</option>
                  <option value="passerby">路人观众</option>
                  <option value="expert">懂行老手</option>
                  <option value="newbie">新手小白</option>
                </select>
              </div>
              <div class="input-row">
                <label>自定义提示词 (可选)</label>
                <textarea id="ai-prompt" class="textarea-input" rows="3"
                  placeholder="额外要求，例如：多问价格、多夸产品好..."></textarea>
              </div>
              <div id="ai-generating-hint" class="generating-hint" style="display:none">🤖 AI正在生成评论...</div>
              <div id="ai-status" class="status-text">已停止</div>
              <div id="ai-last-comment" class="last-comment"></div>
            </div>
          </section>

          <!-- Log -->
          <section class="control-section">
            <div class="section-header">
              <h4 class="section-title">操作日志</h4>
              <button id="clear-logs-btn" class="sm-btn outline">清空</button>
            </div>
            <div class="log-panel" id="log-list">
              <div class="log-empty">暂无日志</div>
            </div>
          </section>
        </div>
        <div class="sidebar-footer">
          <button id="save-btn" class="btn primary">保存配置</button>
          <button id="reset-btn" class="btn outline">恢复默认</button>
        </div>
        <div id="membership-panel-container" style="display:none"></div>
      `;
    }

    _getCSS() {
      return `
        :host { all: initial; }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :host {
          --bg-primary: #161823; --bg-secondary: #252733; --bg-hover: #2f3040;
          --accent: #FE2C55; --accent-hover: #FF4470;
          --text-primary: #FFFFFF; --text-secondary: #8A8B99; --text-muted: #5A5B6A;
          --border: #3A3C4A; --success: #00C853; --warning: #FFC107; --error: #FF1744;
          --radius: 8px; --radius-sm: 4px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
          font-size: 13px; color: var(--text-primary);
        }
        .sidebar {
          position: fixed; top: 0; left: 0; height: 100vh; background: var(--bg-primary);
          border-right: 1px solid var(--border); z-index: 2147483646;
          display: flex; flex-direction: column;
          transform: translateX(-100%); transition: transform 0.3s ease, width 0.1s ease;
        }
        .sidebar.visible { transform: translateX(0); }
        .sidebar.collapsed { transform: translateX(calc(-100% + 40px)); }

        .resize-handle {
          position: absolute; right: -4px; top: 0; bottom: 0;
          width: 8px; cursor: col-resize; z-index: 10;
        }
        .resize-handle:hover { background: rgba(254,44,85,0.3); }

        .sidebar-header {
          display: flex; align-items: center; gap: 8px;
          padding: 12px; border-bottom: 1px solid var(--border);
          min-height: 48px; flex-shrink: 0;
        }
        .sidebar-title { flex: 1; font-size: 15px; font-weight: 700; }
        .tier-badge { font-size: 12px; font-weight: 800; padding: 3px 10px; border-radius: 4px; cursor: pointer; letter-spacing: 1px; transition: transform 0.2s, box-shadow 0.2s; }
        .tier-badge:hover { transform: scale(1.08); }
        .tier-free { background: linear-gradient(135deg, #FFD700, #FF8C00); color: #000; box-shadow: 0 0 12px rgba(255,215,0,0.5); animation: badge-glow 2s infinite; }
        .tier-vip { background: linear-gradient(135deg, #FFD700, #FFA000); color: #000; box-shadow: 0 0 16px rgba(255,215,0,0.7); }
        @keyframes badge-glow { 0%,100%{box-shadow:0 0 8px rgba(255,215,0,0.4)} 50%{box-shadow:0 0 18px rgba(255,215,0,0.8)} }
        .free-tag { font-size: 10px; background: var(--bg-secondary); color: var(--text-secondary); padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border); }
        .vip-tag { font-size: 10px; background: linear-gradient(135deg, #FFD700, #FFA000); color: #000; padding: 1px 5px; border-radius: 3px; font-weight: 700; }
        .deepseek-tag { font-size: 11px; font-weight: 800; color: #00E5FF; letter-spacing: 0.5px; text-shadow: 0 0 8px rgba(0,229,255,0.4); }
        .lock-hint { font-weight: normal; color: var(--accent); font-size: 10px; }
        .icon-btn { width: 28px; height: 28px; border: none; background: transparent;
          color: var(--text-secondary); font-size: 14px; cursor: pointer;
          border-radius: var(--radius-sm); display: flex; align-items: center; justify-content: center; }
        .icon-btn:hover { background: var(--bg-hover); color: var(--text-primary); }

        .sidebar-body { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 8px 0; }
        .sidebar-body::-webkit-scrollbar { width: 4px; }
        .sidebar-body::-webkit-scrollbar-track { background: transparent; }
        .sidebar-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

        .control-section { margin: 0 12px 4px; padding: 10px 0; border-bottom: 1px solid var(--border); }
        .section-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
        .section-title { font-size: 13px; font-weight: 600; }
        .section-content { padding-left: 44px; }
        .input-row { margin-bottom: 8px; }
        .input-row label { display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 3px; }
        .input-pair { display: flex; align-items: center; gap: 6px; }
        .input-sep { color: var(--text-muted); }
        .num-input { width: 64px; padding: 4px 8px; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-primary); font-size: 13px; text-align: center; }
        .num-input.full { width: 100%; }
        .num-input:focus { border-color: var(--accent); outline: none; }
        .num-input:disabled { opacity: 0.5; cursor: not-allowed; }
        .text-input { width: 100%; padding: 6px 8px; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-primary); font-size: 12px; }
        .select-input { width: 100%; padding: 5px 8px; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-primary); font-size: 12px; cursor: pointer; }
        .textarea-input { width: 100%; padding: 6px 8px; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-primary); font-size: 12px; resize: vertical;
          font-family: inherit; min-height: 60px; }
        .textarea-input:focus { border-color: var(--accent); outline: none; }
        .textarea-input:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-row { display: flex; gap: 6px; margin-bottom: 6px; }

        .status-text { font-size: 11px; color: var(--text-muted); margin-top: 4px; }
        .status-text.active { color: var(--success); }
        .last-comment { font-size: 11px; color: var(--text-secondary); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .generating-hint { font-size: 11px; color: var(--warning); margin-top: 4px; animation: blink 1.2s infinite; }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .ai-locked { font-size: 12px; color: var(--text-muted); padding: 8px 12px; background: var(--bg-secondary); border-radius: var(--radius-sm); margin-bottom: 8px; text-align: center; }

        /* Toggle */
        .toggle-label { position: relative; display: inline-block; width: 36px; height: 20px; flex-shrink: 0; }
        .toggle-input { opacity: 0; width: 0; height: 0; }
        .toggle-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0;
          background: var(--border); border-radius: 10px; transition: 0.25s; }
        .toggle-slider::before { content: ''; position: absolute; height: 16px; width: 16px;
          left: 2px; bottom: 2px; background: white; border-radius: 50%; transition: 0.25s; }
        .toggle-input:checked + .toggle-slider { background: var(--accent); }
        .toggle-input:checked + .toggle-slider::before { transform: translateX(16px); }
        .toggle-input:disabled + .toggle-slider { opacity: 0.4; cursor: not-allowed; }

        /* Buttons */
        .btn { padding: 6px 16px; border: none; border-radius: var(--radius-sm); font-size: 12px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
        .btn.primary { background: var(--accent); color: #fff; }
        .btn.primary:hover { background: var(--accent-hover); }
        .btn.outline { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); }
        .btn.outline:hover { background: var(--bg-hover); color: var(--text-primary); }
        .sm-btn { padding: 3px 10px; border: none; border-radius: var(--radius-sm); font-size: 11px; cursor: pointer; background: var(--accent); color: #fff; transition: background 0.2s; }
        .sm-btn:hover { background: var(--accent-hover); }
        .sm-btn.outline { background: transparent; color: var(--text-secondary); border: 1px solid var(--border); }
        .sm-btn.outline:hover { background: var(--bg-hover); color: var(--text-primary); }

        /* Log */
        .log-panel { max-height: 200px; overflow-y: auto; background: var(--bg-secondary); border-radius: var(--radius-sm); padding: 6px 8px; }
        .log-panel::-webkit-scrollbar { width: 3px; }
        .log-panel::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
        .log-empty { color: var(--text-muted); font-size: 12px; text-align: center; padding: 12px; }
        .log-item { display: flex; gap: 6px; padding: 2px 0; font-size: 11px; line-height: 1.5; }
        .log-time { color: var(--text-muted); flex-shrink: 0; font-variant-numeric: tabular-nums; }
        .log-msg { color: var(--text-secondary); word-break: break-all; }
        .log-success .log-msg { color: var(--success); }
        .log-error .log-msg { color: var(--error); }
        .log-warning .log-msg { color: var(--warning); }

        .sidebar-footer { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid var(--border); flex-shrink: 0; }

        /* Membership Panel */
        #membership-panel-container { position: absolute; inset: 0; z-index: 100; }
        .membership-panel { position: absolute; inset: 0; }
        .mp-overlay { position: absolute; inset: 0; background: rgba(0,0,0,0.6); }
        .mp-modal { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%);
          background: var(--bg-primary); border: 1px solid var(--border); border-radius: var(--radius);
          width: calc(100% - 32px); max-width: 360px; max-height: 90vh; overflow-y: auto; }
        .mp-header { display: flex; align-items: center; justify-content: space-between;
          padding: 12px 16px; border-bottom: 1px solid var(--border); }
        .mp-header h3 { font-size: 15px; font-weight: 700; }
        .mp-close-btn { background: none; border: none; color: var(--text-secondary); font-size: 18px; cursor: pointer; }
        .mp-body { padding: 16px; }
        .mp-status { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
        .mp-expiry { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
        .mp-label { color: var(--text-secondary); font-size: 12px; }
        .mp-value { font-size: 12px; }
        .mp-pricing { margin-top: 16px; }
        .mp-pricing h4 { font-size: 13px; margin-bottom: 8px; }
        .mp-plan-line { display: flex; justify-content: space-between; align-items: center;
          padding: 6px 10px; margin-bottom: 4px; background: var(--bg-secondary);
          border-radius: var(--radius-sm); border: 1px solid var(--border); }
        .mp-plan-text { font-size: 13px; font-weight: 600; color: var(--accent); }
        .mp-plan-note { font-size: 11px; color: var(--text-secondary); }
        .mp-qrcodes { display: flex; gap: 10px; margin-top: 12px; }
        .mp-qr-item { flex: 1; text-align: center; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 8px; }
        .mp-qr-img { width: 100%; max-width: 140px; display: block; margin: 0 auto;
          border-radius: 4px; }
        .mp-qr-label { display: block; margin-top: 4px; font-size: 11px; color: var(--text-secondary); }
        .mp-machine { margin-top: 16px; }
        .mp-machine label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
        .mp-machine-hint { font-weight: normal; color: var(--accent); font-size: 10px; }
        .mp-machine-code { padding: 8px 10px; background: var(--bg-secondary); border-radius: var(--radius-sm);
          font-size: 13px; font-family: monospace; letter-spacing: 1px; color: var(--text-primary);
          user-select: all; word-break: break-all; }
        .mp-current-key { margin-top: 16px; }
        .mp-current-key label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
        .mp-key-hint { font-weight: normal; color: var(--accent); font-size: 10px; }
        .mp-key-row { display: flex; gap: 4px; }
        .mp-key-display { flex: 1; padding: 6px 8px; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--success); font-size: 11px; font-family: monospace;
          letter-spacing: 1px; box-sizing: border-box; user-select: all; }
        .mp-copy-btn { flex-shrink: 0; width: 32px; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-primary); font-size: 14px; cursor: pointer; display: flex;
          align-items: center; justify-content: center; }
        .mp-copy-btn:hover { background: var(--bg-hover); }
        .mp-activate { margin-top: 16px; }
        .mp-activate label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
        .mp-key-input { width: 100%; padding: 6px 8px; background: var(--bg-secondary);
          border: 1px solid var(--border); border-radius: var(--radius-sm);
          color: var(--text-primary); font-size: 12px; margin-bottom: 8px;
          font-family: monospace; letter-spacing: 1px; box-sizing: border-box; }
        .mp-key-input:focus { border-color: var(--accent); outline: none; }
        .mp-activate-btn { width: 100%; padding: 8px; background: var(--accent); color: #fff;
          border: none; border-radius: var(--radius-sm); font-size: 13px; font-weight: 600; cursor: pointer; }
        .mp-activate-btn:hover { background: var(--accent-hover); }
        .mp-activate-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .mp-activate-msg { margin-top: 8px; font-size: 12px; text-align: center; }
        .mp-activate-msg.success { color: var(--success); }
        .mp-activate-msg.error { color: var(--error); }
      `;
    }
  }

  window.LiveBot.Sidebar = Sidebar;
})();
