/**
 * LiveBot.FloatingButton — 左下角浮动开关按钮 (Shadow DOM)
 */
window.LiveBot = window.LiveBot || {};

(function() {
  class FloatingButton {
    constructor(callbacks = {}) {
      this.onClick = callbacks.onClick || (() => {});
      this._container = null;
      this._shadow = null;
      this._button = null;
      this._indicator = null;
      this._visible = false;
      this._running = false;
    }

    create() {
      this._container = document.createElement('div');
      this._container.id = 'livebot-floating-btn-host';
      this._shadow = this._container.attachShadow({ mode: 'open' });

      const style = document.createElement('style');
      style.textContent = this._getCSS();
      this._shadow.appendChild(style);

      this._button = document.createElement('div');
      this._button.className = 'livebot-fab';
      this._button.innerHTML = `
        <span class="fab-icon">LB</span>
        <span class="fab-indicator"></span>
      `;
      this._button.addEventListener('click', (e) => {
        e.stopPropagation();
        this.onClick();
      });

      this._shadow.appendChild(this._button);
      document.body.appendChild(this._container);

      this._indicator = this._shadow.querySelector('.fab-indicator');
      this._visible = true;
      return this;
    }

    show() {
      if (this._container) this._container.style.display = 'block';
      this._visible = true;
    }

    hide() {
      if (this._container) this._container.style.display = 'none';
      this._visible = false;
    }

    setRunning(running) {
      this._running = running;
      if (this._indicator) {
        this._indicator.className = 'fab-indicator' + (running ? ' running' : '');
      }
    }

    destroy() {
      if (this._container && this._container.parentNode) {
        this._container.parentNode.removeChild(this._container);
      }
    }

    get isVisible() { return this._visible; }

    _getCSS() {
      return `
        :host { all: initial; }
        .livebot-fab {
          position: fixed;
          bottom: 24px;
          left: 24px;
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: linear-gradient(135deg, #FE2C55, #FF0050);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          z-index: 2147483647;
          box-shadow: 0 4px 16px rgba(254,44,85,0.4), 0 1px 4px rgba(0,0,0,0.2);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          user-select: none;
        }
        .livebot-fab:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 24px rgba(254,44,85,0.5), 0 2px 8px rgba(0,0,0,0.3);
        }
        .livebot-fab:active {
          transform: scale(0.95);
        }
        .fab-icon {
          color: #fff;
          font-size: 18px;
          font-weight: 700;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          letter-spacing: -0.5px;
          pointer-events: none;
        }
        .fab-indicator {
          position: absolute;
          top: 4px;
          right: 4px;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #666;
          border: 2px solid #fff;
          transition: background 0.3s ease;
          pointer-events: none;
        }
        .fab-indicator.running {
          background: #00C853;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(0,200,83,0.6); }
          50% { box-shadow: 0 0 0 6px rgba(0,200,83,0); }
        }
      `;
    }
  }

  window.LiveBot.FloatingButton = FloatingButton;
})();
