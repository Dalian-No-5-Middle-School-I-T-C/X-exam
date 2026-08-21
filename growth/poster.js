// growth/poster.js
// 离屏绘制成绩卡 / 天梯卡并导出图片，用于“保存相册 / 分享”获客场景。
// 不依赖任何网络图片，全部矢量绘制，保证导出时数据已就绪、无异步空洞。
const BLUE = '#2E44FF';
const INK = '#1A1917';
const PAPER = '#F1EFE9';
const MUTED = '#8B887E';
const RED = '#C00F28';
const LINE = '#D8D5CB';

function roundRect(ctx, x, y, w, h, r) {
  // 钳制半径：r 超过宽高一半时 arcTo 会绘制异常
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function clipText(ctx, text, maxWidth) {
  text = String(text == null ? '' : text);
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth) {
    text = text.slice(0, -1);
  }
  return text + '…';
}

function createCanvas(w, h) {
  // 能力检测：离屏 Canvas 2D 需较高基础库，低版本直接抛出可识别错误而非原始异常
  if (typeof wx.createOffscreenCanvas !== 'function') {
    var e = new Error('当前微信版本过低，无法生成图片，请升级微信后重试');
    e.code = 'CANVAS_UNSUPPORTED';
    throw e;
  }
  return wx.createOffscreenCanvas({ type: '2d', width: w, height: h });
}

function exportPng(canvas, w, h) {
  return new Promise(function (resolve, reject) {
    wx.canvasToTempFilePath({
      canvas: canvas,
      x: 0, y: 0, width: w, height: h,
      destWidth: w * 2, destHeight: h * 2,
      fileType: 'png',
      success: function (res) { resolve(res.tempFilePath); },
      fail: function (err) { reject(err); }
    });
  });
}

// 成绩卡
function drawScoreCard(ctx, W, H, m) {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  // 顶栏
  ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, 110);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('PX · 我的成绩', 40, 44);
  ctx.font = '20px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(clipText(ctx, m.examName || '考试', W - 80), 40, 80);

  // 总分
  const total = m.total != null ? m.total : '—';
  ctx.fillStyle = INK; ctx.textAlign = 'left'; ctx.font = 'bold 110px sans-serif';
  ctx.fillText(String(total), 40, 210);
  if (m.full != null) {
    const tx = 40 + ctx.measureText(String(total)).width + 18;
    ctx.font = '28px sans-serif'; ctx.fillStyle = MUTED;
    ctx.fillText('/ ' + m.full, tx, 220);
  }

  // 统计行
  const stats = [
    { k: '班排', v: (m.rank != null ? m.rank : '—') + (m.classSize != null ? '/' + m.classSize : '') },
    { k: '超越', v: (m.percentile != null ? m.percentile + '%' : '—') },
    { k: '客观', v: (m.objective != null ? m.objective : '—') },
    { k: '主观', v: (m.subjective != null ? m.subjective : '—') }
  ];
  const sy = 300, sw = (W - 80) / stats.length;
  stats.forEach(function (s, i) {
    const x = 40 + sw * i;
    ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.font = 'bold 34px sans-serif';
    ctx.fillText(String(s.v), x, sy);
    ctx.fillStyle = MUTED; ctx.font = '18px sans-serif';
    ctx.fillText(s.k, x, sy + 28);
  });

  // 学科明细（最多 5 行）
  const rows = (m.subjects || []).slice(0, 5);
  const ry = 380;
  rows.forEach(function (s, i) {
    const y = ry + i * 56;
    ctx.fillStyle = INK; ctx.font = '24px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(clipText(ctx, s.subject || '', 220), 40, y);
    ctx.fillStyle = (s.gap != null && s.gap < 0) ? RED : BLUE;
    ctx.textAlign = 'right';
    ctx.fillText(String(s.score != null ? s.score : '—'), W - 40, y);
    if (s.gap != null) {
      ctx.fillStyle = (s.gap < 0) ? RED : BLUE; ctx.font = '18px sans-serif';
      ctx.fillText((s.gap >= 0 ? '+' : '') + s.gap, W - 40, y + 26);
    }
  });

  // 页脚水印
  ctx.fillStyle = INK; ctx.fillRect(0, H - 70, W, 70);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '18px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('数据来自 X-exam 小程序 · 仅供个人参考', 40, H - 35);
}

// 天梯卡
function drawLeaderboardCard(ctx, W, H, m) {
  ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = BLUE; ctx.fillRect(0, 0, W, 110);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 36px sans-serif';
  ctx.fillText('PX · 成绩天梯', 40, 44);
  ctx.font = '20px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(clipText(ctx, m.examName || '考试', W - 80), 40, 80);

  const top = (m.top || []).slice(0, 3);
  const cardW = (W - 80 - 40) / 3;
  top.forEach(function (it, i) {
    const x = 40 + cardW * i + (i > 0 ? 20 : 0);
    const y = 170;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = LINE; ctx.lineWidth = 1;
    roundRect(ctx, x, y, cardW, 150, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = i === 0 ? BLUE : INK; ctx.textAlign = 'center';
    ctx.font = 'bold 40px sans-serif';
    ctx.fillText('#' + (it.rank != null ? it.rank : (i + 1)), x + cardW / 2, y + 50);
    ctx.fillStyle = INK; ctx.font = '24px sans-serif';
    ctx.fillText(clipText(ctx, it.name || '同学', cardW - 20), x + cardW / 2, y + 92);
    ctx.fillStyle = MUTED; ctx.font = '20px sans-serif';
    ctx.fillText(String(it.score != null ? it.score : '—'), x + cardW / 2, y + 124);
  });

  // 我的位置
  if (m.mine) {
    const my = 360;
    ctx.fillStyle = 'rgba(46,68,255,0.08)'; ctx.fillRect(40, my, W - 80, 80);
    ctx.fillStyle = BLUE; ctx.textAlign = 'left'; ctx.font = 'bold 28px sans-serif';
    ctx.fillText('我 · 第 ' + (m.mine.rank != null ? m.mine.rank : '—') + ' 名', 60, my + 40);
    ctx.fillStyle = INK; ctx.textAlign = 'right'; ctx.font = 'bold 32px sans-serif';
    ctx.fillText(String(m.mine.score != null ? m.mine.score : '—'), W - 60, my + 40);
  }

  ctx.fillStyle = INK; ctx.fillRect(0, H - 70, W, 70);
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = '18px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText('数据来自 X-exam 小程序 · 仅供个人参考', 40, H - 35);
}

function exportCard(type, model) {
  const W = 640, H = type === 'leaderboard' ? 560 : 760;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  if (type === 'leaderboard') drawLeaderboardCard(ctx, W, H, model || {});
  else drawScoreCard(ctx, W, H, model || {});
  return exportPng(canvas, W, H);
}

function saveToAlbum(path) {
  return new Promise(function (resolve, reject) {
    wx.saveImageToPhotosAlbum({
      filePath: path,
      success: function () { resolve(true); },
      fail: function (err) {
        // 宽松匹配：不同基础库返回 auth deny / authorize:fail / fail auth denied 等变体
        if (err && err.errMsg && /auth|authorize|deny/i.test(err.errMsg)) {
          wx.showModal({
            title: '需要相册权限',
            content: '请在设置中开启“保存到相册”权限后重试',
            confirmText: '去设置',
            success: function (r) { if (r.confirm && wx.openSetting) wx.openSetting(); }
          });
        }
        reject(err);
      }
    });
  });
}

// 便捷：绘制并保存成绩/天梯卡到相册
function drawAndSave(type, model) {
  return exportCard(type, model).then(function (path) {
    return saveToAlbum(path).then(function () { return path; });
  });
}

module.exports = {
  exportCard: exportCard,
  saveToAlbum: saveToAlbum,
  drawAndSave: drawAndSave,
  drawScoreCard: drawScoreCard,
  drawLeaderboardCard: drawLeaderboardCard
};
