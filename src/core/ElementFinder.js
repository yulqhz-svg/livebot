/**
 * LiveBot.ElementFinder — 抖音直播间 DOM 元素定位器
 */
window.LiveBot = window.LiveBot || {};

(function() {
  const EF = {};

  const VIDEO_SELECTORS = [
    '.xgplayer-container video',
    '[data-e2e="live-player"] video',
    '.live-player-video video',
    '.room-player video',
    'video[class*="player"]',
    'video'
  ];

  const INPUT_SELECTORS = [
    '[contenteditable="true"][data-e2e="comment-input"]',
    '[contenteditable="true"][placeholder*="说点什么"]',
    '[contenteditable="true"][placeholder*="发条评论"]',
    '.comment-input [contenteditable="true"]',
    '.chat-input [contenteditable="true"]',
    '.room-right [contenteditable="true"]',
    'textarea[data-e2e="comment-input"]',
    'textarea[placeholder*="说点什么"]'
  ];

  EF.findLiveVideo = () => {
    for (const selector of VIDEO_SELECTORS) {
      const videos = document.querySelectorAll(selector);
      for (const v of videos) {
        const rect = v.getBoundingClientRect();
        if (rect.width > 300 && rect.height > 200 &&
            window.getComputedStyle(v).display !== 'none' &&
            window.getComputedStyle(v).visibility !== 'hidden') {
          return v;
        }
      }
    }
    return null;
  };

  EF.findCommentInput = () => {
    for (const selector of INPUT_SELECTORS) {
      const el = document.querySelector(selector);
      if (el && window.LiveBot.Helpers.isVisible(el)) return el;
    }
    const editables = document.querySelectorAll('[contenteditable="true"]');
    let best = null;
    let maxY = -1;
    for (const el of editables) {
      if (!window.LiveBot.Helpers.isVisible(el)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.bottom > maxY) { maxY = rect.bottom; best = el; }
    }
    return best;
  };

  EF.getLiveRoomInfo = () => {
    const info = {
      title: '',
      anchor: '',
      tags: [],
      recentDanmu: [],
      url: location.href
    };

    const titleEl = document.querySelector('[data-e2e="live-title"], .live-title, h1, title');
    if (titleEl) info.title = titleEl.textContent.trim();

    const anchorEl = document.querySelector('[data-e2e="anchor-name"], .anchor-name, .author-name');
    if (anchorEl) info.anchor = anchorEl.textContent.trim();

    document.querySelectorAll('[data-e2e="tag"], .tag, .live-tag').forEach(t => {
      const text = t.textContent.trim();
      if (text) info.tags.push(text);
    });

    const danmuEls = document.querySelectorAll('[data-e2e="comment-item"], .comment-item, .chat-message, [class*="danmu"], [class*="barrage"]');
    danmuEls.forEach(el => {
      const text = el.textContent.trim();
      if (text && info.recentDanmu.length < 10) info.recentDanmu.push(text);
    });

    return info;
  };

  EF.captureVideoFrame = () => {
    const video = EF.findLiveVideo();
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    const maxW = 480, maxH = 270;
    let w = video.videoWidth, h = video.videoHeight;
    if (w > maxW) { h = h * (maxW / w); w = maxW; }
    if (h > maxH) { w = w * (maxH / h); h = maxH; }
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, w, h);
    try {
      return canvas.toDataURL('image/jpeg', 0.6);
    } catch (e) {
      return null;
    }
  };

  window.LiveBot.ElementFinder = EF;
})();
