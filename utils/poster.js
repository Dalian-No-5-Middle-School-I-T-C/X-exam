// utils/poster.js
// 成绩报告 / 学科对比 分享海报绘制（Canvas 2D）。
// 纯函数：buildSections(model, W) 返回段落数组，每段含 h(设计px) 与 draw(ctx, y, W)。
// measure 与 draw 共用同一段落数组，确保画布高度与绘制完全一致、内容永不截断。
// 设计宽度 W=375；组件按 PX 缩放导出（详见 components/poster）。

const C = {
  paper: '#F1EFE9', sheet: '#FFFFFF', ink: '#1A1917', inkSoft: '#4A4842',
  gray: '#8B887E', line: '#D8D5CB', lineDark: '#2E2E2B',
  blue: '#2E44FF', blueDeep: '#1F30C8', blueSoft: 'rgba(46,68,255,0.10)',
  err: '#C00F28', dark: '#141413', dark2: '#1D1D1B', lime: '#C8FF33',
  grayOnDark: '#9A988F', zebra: '#F6F4EF'
};
const FONT = '"PingFang SC","Microsoft YaHei","Heiti SC",sans-serif';
const PAD = 18;

function setFont(ctx, size, weight) {
  ctx.font = (weight ? weight + ' ' : '') + size + 'px ' + FONT;
}
function num(v, d) { const n = Number(v); return isFinite(n) ? n : (d == null ? 0 : d); }
function tw(ctx, t) { return ctx.measureText(t == null ? '' : String(t)).width; }
function trunc(ctx, text, maxW, size, weight) {
  text = text == null ? '' : String(text);
  // 测量前先设置与绘制一致的字体，否则宽度判断会偏差导致溢出或过早截断
  if (size != null) setFont(ctx, size, weight);
  if (tw(ctx, text) <= maxW) return text;
  let s = text;
  while (s.length > 1 && tw(ctx, s + '…') > maxW) s = s.slice(0, -1);
  return s + '…';
}
// 自动换行（基于字符宽度）；maxLines 后截断并补 “…”
function wrap(ctx, text, maxW, maxLines) {
  text = text == null ? '' : String(text);
  const out = [];
  let line = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n') { out.push(line); line = ''; continue; }
    const t = line + ch;
    if (tw(ctx, t) > maxW && line) {
      if (maxLines && out.length >= maxLines - 1) {
        let rest = line + ch + text.slice(i + 1).replace(/\n/g, '');
        while (rest.length > 1 && tw(ctx, rest + '…') > maxW) rest = rest.slice(0, -1);
        out.push(rest + '…');
        return out;
      }
      out.push(line); line = ch;
    } else { line = t; }
  }
  if (line) out.push(line);
  return out;
}
function txt(ctx, text, x, y, o) {
  o = o || {};
  setFont(ctx, o.size || 12, o.weight);
  ctx.fillStyle = o.color || C.ink;
  ctx.textAlign = o.align || 'left';
  ctx.textBaseline = o.baseline || 'middle';
  ctx.fillText(text, x, y);
}
function brand(ctx, x, y) {
  ctx.fillStyle = C.blue;
  ctx.fillRect(x, y - 8, 16, 16);
  txt(ctx, 'X', x + 8, y, { size: 12, weight: '800', color: '#fff', align: 'center' });
}
function sectionTitle(ctx, y, title) {
  ctx.fillStyle = C.blue;
  ctx.fillRect(PAD, y + 6, 6, 18);
  txt(ctx, title, PAD + 14, y + 15, { size: 15, weight: '800', color: C.ink });
}

// ── 图表（复用 subjects 页算法，适配海报坐标）──
function drawRadar(ctx, cx, cy, R, labels, myData, classData, axisMin, axisMax) {
  const N = labels.length; if (N < 3) return;
  const span = (axisMax - axisMin) || 1;
  const angle = function (i) { return -Math.PI / 2 + i * 2 * Math.PI / N; };
  ctx.strokeStyle = C.line; ctx.lineWidth = 1;
  for (let r = 1; r <= 4; r++) {
    const rr = R * r / 4;
    ctx.beginPath();
    for (let i = 0; i <= N; i++) { const a = angle(i % N); const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  ctx.fillStyle = C.gray; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let i = 0; i < N; i++) {
    const a = angle(i);
    const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
    ctx.strokeStyle = C.line; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.stroke();
    const lx = cx + (R + 14) * Math.cos(a), ly = cy + (R + 14) * Math.sin(a);
    let lab = labels[i] || ''; if (lab.length > 4) lab = lab.slice(0, 4);
    setFont(ctx, 11); ctx.fillStyle = C.gray; ctx.fillText(lab, lx, ly);
  }
  const poly = function (data, stroke, fill) {
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const idx = i % N; const a = angle(idx);
      const rr = R * Math.max(0, Math.min(1, (num(data[idx]) - axisMin) / span));
      const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke();
    for (let i = 0; i < N; i++) {
      const a = angle(i);
      const rr = R * Math.max(0, Math.min(1, (num(data[i]) - axisMin) / span));
      ctx.beginPath(); ctx.arc(cx + rr * Math.cos(a), cy + rr * Math.sin(a), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = stroke; ctx.fill();
    }
  };
  poly(classData, C.gray, 'rgba(139,136,126,0.12)');
  poly(myData, C.blue, C.blueSoft);
}
function drawBar(ctx, x, y, w, h, items) {
  const padL = 40, padR = 14, padT = 12, padB = 36;
  const plotW = w - padL - padR, plotH = h - padT - padB;
  const vals = items.map(function (it) { return num(it.gapToClass); });
  if (!vals.length) return;
  const absMax = Math.max(Math.abs(Math.max.apply(null, vals.concat(0))), Math.abs(Math.min.apply(null, vals.concat(0))), 1);
  const yAt = function (v) { return padT + plotH * (1 - (v + absMax) / (absMax * 2)); };
  ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(padL, yAt(0)); ctx.lineTo(w - padR, yAt(0)); ctx.stroke();
  const n = items.length, gap = plotW / n, bw = Math.min(gap * 0.6, 22);
  items.forEach(function (it, i) {
    const v = num(it.gapToClass);
    const bx = padL + gap * i + (gap - bw) / 2;
    const yTop = yAt(v), yZero = yAt(0);
    const hgt = Math.abs(yTop - yZero);
    const top = v >= 0 ? yZero - hgt : yZero;
    ctx.fillStyle = v >= 0 ? C.blue : C.err;
    ctx.fillRect(bx, y + top, bw, hgt);
    ctx.fillStyle = C.gray; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; setFont(ctx, 10);
    let s = it.subject || ''; if (s.length > 4) s = s.slice(0, 4);
    ctx.fillText(s, bx + bw / 2, y + h - 18);
    ctx.fillText((v >= 0 ? '+' : '') + v, bx + bw / 2, y + Math.min(yTop, yZero) - 7);
  });
}

// 构建段落（高度测量无需 ctx；绘制时由组件传入真实 ctx）
function buildSections(model, W) {
  const sections = [];
  const L = PAD, R = W - PAD, CW = W - 2 * PAD;

  // 1) 头部品牌条
  sections.push({
    h: 92,
    draw: function (ctx, y) {
      ctx.fillStyle = C.dark; ctx.fillRect(0, y, W, 92);
      brand(ctx, L, y + 24);
      txt(ctx, 'X-exam', L + 24, y + 24, { size: 15, weight: '800', color: '#fff' });
      const title = model.type === 'subjects' ? '学科对比分析' : (model.examName || '成绩报告');
      txt(ctx, trunc(ctx, title, W - 2 * L - 8, 16, '800'), L, y + 56, { size: 16, weight: '800', color: '#fff' });
      const meta = (model.studentName ? model.studentName : '') + (model.date ? '  ·  ' + model.date : '');
      txt(ctx, trunc(ctx, meta, W - 2 * L, 11), R, y + 56, { size: 11, color: C.grayOnDark, align: 'right' });
    }
  });

  if (model.type === 'detail') {
    // 2) 概览卡
    const s = model.summary || {};
    sections.push({
      h: 110,
      draw: function (ctx, y) {
        const x = L, w = CW, top = y + 12, h = 86;
        ctx.fillStyle = C.sheet; ctx.fillRect(x, top, w, h);
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, top + 0.5, w - 1, h - 1);
        const total = s.total_score != null ? num(s.total_score) : '—';
        txt(ctx, String(total), x + 16, top + 38, { size: 38, weight: '800', color: C.blue });
        const cx = x + 16 + tw(ctx, String(total)) + 8;
        if (s.full_score != null) txt(ctx, '/ ' + s.full_score, cx, top + 38, { size: 15, color: C.gray });
        if (s.subject) txt(ctx, s.subject, x + 16, top + 68, { size: 12, weight: '600', color: C.blueDeep });
        ctx.textAlign = 'right';
        let rank = '';
        if (s.rank != null) rank = '班排 ' + s.rank + (s.class_size != null ? '/' + s.class_size : '');
        if (s.percentile != null) rank += (rank ? '\n' : '') + '超过 ' + s.percentile + '%';
        if (rank) {
          rank.split('\n').forEach(function (ln, i) { txt(ctx, ln, x + w - 16, top + 30 + i * 22, { size: 13, weight: '600', color: C.ink, align: 'right' }); });
        } else {
          txt(ctx, '暂无排名', x + w - 16, top + 40, { size: 12, color: C.gray, align: 'right' });
        }
        ctx.textAlign = 'left';
      }
    });

    // 3) 客观题
    const obj = model.objective || [];
    sections.push({
      h: 32 + Math.max(obj.length, 1) * 30,
      draw: function (ctx, y) {
        sectionTitle(ctx, y, '客观题');
        const top = y + 32;
        if (obj.length === 0) { txt(ctx, '无客观题', L, top + 15, { size: 13, color: C.gray }); return; }
        obj.forEach(function (it, i) {
          const ry = top + i * 30 + 15;
          txt(ctx, 'Q' + (it.question_number != null ? it.question_number : '?'), L + 4, ry, { size: 13, weight: '700', color: C.ink });
          const sc = it.max_score != null ? it.score + '/' + it.max_score : String(it.score);
          const scColor = (it.max_score != null && num(it.score) < num(it.max_score)) ? C.inkSoft : C.blue;
          txt(ctx, sc, L + 56, ry, { size: 13, weight: '700', color: scColor });
          if (it.classAvg != null) txt(ctx, '班均 ' + it.classAvg, L + 130, ry, { size: 12, color: C.gray });
          if (i < obj.length - 1) { ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, top + (i + 1) * 30); ctx.lineTo(R, top + (i + 1) * 30); ctx.stroke(); }
        });
      }
    });

    // 4) 主观题
    const sub = model.subjective || [];
    sections.push({
      h: 32 + Math.max(sub.length, 1) * 30,
      draw: function (ctx, y) {
        sectionTitle(ctx, y, '主观题');
        const top = y + 32;
        if (sub.length === 0) { txt(ctx, '无主观题', L, top + 15, { size: 13, color: C.gray }); return; }
        sub.forEach(function (it, i) {
          const ry = top + i * 30 + 15;
          txt(ctx, 'Q' + (it.question_number != null ? it.question_number : '?'), L + 4, ry, { size: 13, weight: '700', color: C.ink });
          const sc = it.max_score != null ? it.score + '/' + it.max_score : String(it.score);
          const scColor = (it.max_score != null && num(it.score) < num(it.max_score)) ? C.inkSoft : C.blue;
          txt(ctx, sc, L + 56, ry, { size: 13, weight: '700', color: scColor });
          if (it.classAvg != null) txt(ctx, '班均 ' + it.classAvg, L + 130, ry, { size: 12, color: C.gray });
          if (i < sub.length - 1) { ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(L, top + (i + 1) * 30); ctx.lineTo(R, top + (i + 1) * 30); ctx.stroke(); }
        });
      }
    });

    // 5) AI 文本（可选）—— 高度按 CJK 字符宽度估算，保证不溢出
    if (model.aiText) {
      const estLines = Math.min(8, Math.max(1, Math.ceil((model.aiText || '').length / Math.floor(CW / 12))));
      const h = 32 + estLines * 18 + 16;
      sections.push({
        h: h,
        draw: function (ctx, y) {
          sectionTitle(ctx, y, '本场 AI 分析');
          const top = y + 32;
          const lines = wrap(ctx, model.aiText, CW, 8);
          lines.forEach(function (ln, i) { txt(ctx, ln, L, top + i * 18, { size: 12, color: C.inkSoft, baseline: 'top' }); });
        }
      });
    }
  } else if (model.type === 'subjects') {
    const subjects = model.subjects || [];

    // 2) 最需加强
    if (model.weakSubject) {
      sections.push({
        h: 44,
        draw: function (ctx, y) {
          txt(ctx, '最需加强', L, y + 22, { size: 13, color: C.inkSoft });
          setFont(ctx, 13, '700');
          const tw2 = tw(ctx, model.weakSubject) + 24;
          ctx.fillStyle = C.lime; ctx.fillRect(L + 64, y + 12, tw2, 22);
          txt(ctx, model.weakSubject, L + 64 + tw2 / 2, y + 23, { size: 13, weight: '700', color: C.ink, align: 'center' });
          txt(ctx, '（与班级均分差距最大）', L + 64 + tw2 + 12, y + 22, { size: 11, color: C.gray });
        }
      });
    }

    // 3) 雷达图（≥3 科）
    if (subjects.length >= 3) {
      const labels = subjects.map(function (s) { return s.subject; });
      const myData = subjects.map(function (s) { return num(s.avgScore); });
      const classData = subjects.map(function (s) { return num(s.avgClassAvg); });
      const vals = myData.concat(classData);
      let axisMin = Math.floor(Math.min.apply(null, vals.concat(0)) / 10) * 10;
      let axisMax = Math.ceil(Math.max.apply(null, vals.concat(0)) / 10) * 10;
      if (axisMin < 0) axisMin = 0;
      if (axisMax - axisMin < 20) axisMax = axisMin + 20;
      sections.push({
        h: 232,
        draw: function (ctx, y) {
          sectionTitle(ctx, y, '我的均分 vs 班级均分');
          drawRadar(ctx, W / 2, y + 30 + 96, 92, labels, myData, classData, axisMin, axisMax);
          txt(ctx, '■ 我的均分', W / 2 - 54, y + 224, { size: 11, color: C.blue, align: 'center' });
          txt(ctx, '■ 班级均分', W / 2 + 54, y + 224, { size: 11, color: C.gray, align: 'center' });
        }
      });
    } else {
      sections.push({
        h: 40,
        draw: function (ctx, y) { txt(ctx, '学科数不足 3，雷达图需至少 3 科，见下方表格', L, y + 20, { size: 12, color: C.gray }); }
      });
    }

    // 4) 学科明细表
    const showN = Math.min(subjects.length, 15);
    const extra = subjects.length > 15 ? 26 : 0;
    sections.push({
      h: 32 + 28 + showN * 28 + extra,
      draw: function (ctx, y) {
        sectionTitle(ctx, y, '学科明细');
        const top = y + 32;
        const cols = [
          { label: '学科', x: L + 4, align: 'left' },
          { label: '次数', x: L + 0.34 * CW, align: 'center' },
          { label: '均分', x: L + 0.50 * CW, align: 'center' },
          { label: '班均', x: L + 0.64 * CW, align: 'center' },
          { label: '差距', x: L + 0.78 * CW, align: 'center' },
          { label: '趋势', x: L + 0.92 * CW, align: 'center' }
        ];
        ctx.fillStyle = C.zebra; ctx.fillRect(L, top, CW, 28);
        cols.forEach(function (c) { txt(ctx, c.label, c.x, top + 14, { size: 11, color: C.gray, align: c.align }); });
        for (let i = 0; i < showN; i++) {
          const it = subjects[i]; const ry = top + 28 + i * 28 + 14;
          if (i % 2 === 1) { ctx.fillStyle = C.zebra; ctx.fillRect(L, top + 28 + i * 28, CW, 28); }
          txt(ctx, trunc(ctx, it.subject, 0.30 * CW, 12, '600'), cols[0].x, ry, { size: 12, weight: '600', color: C.ink });
          txt(ctx, String(num(it.examCount)), cols[1].x, ry, { size: 12, align: 'center' });
          txt(ctx, String(num(it.avgScore)), cols[2].x, ry, { size: 12, align: 'center' });
          txt(ctx, String(num(it.avgClassAvg)), cols[3].x, ry, { size: 12, align: 'center' });
          const gap = num(it.gapToClass);
          txt(ctx, (gap >= 0 ? '+' : '') + gap, cols[4].x, ry, { size: 12, weight: '700', color: gap >= 0 ? C.blue : C.err, align: 'center' });
          const tr = it.trend === 'up' ? '▲' : (it.trend === 'down' ? '▼' : '—');
          txt(ctx, tr, cols[5].x, ry, { size: 12, color: it.trend === 'up' ? C.blue : (it.trend === 'down' ? C.err : C.gray), align: 'center' });
        }
        if (subjects.length > 15) txt(ctx, '（仅显示前 15 科，共 ' + subjects.length + ' 科）', L, top + 28 + showN * 28 + 13, { size: 11, color: C.gray });
      }
    });

    // 5) 差距柱状图
    if (subjects.length > 0) {
      sections.push({
        h: 224,
        draw: function (ctx, y) {
          sectionTitle(ctx, y, '与班级均分差距');
          drawBar(ctx, L, y + 32, CW, 180, subjects);
          txt(ctx, '蓝色=高于班级均分，红色=低于班级均分', L, y + 218, { size: 11, color: C.gray });
        }
      });
    }
  }

  // 末尾：来源水印条
  sections.push({
    h: 52,
    draw: function (ctx, y) {
      ctx.fillStyle = C.dark; ctx.fillRect(0, y, W, 52);
      brand(ctx, L, y + 26);
      txt(ctx, 'X-exam', L + 24, y + 26, { size: 13, weight: '800', color: '#fff' });
      txt(ctx, '数据来自 X-exam 小程序 · 仅供个人参考', R, y + 26, { size: 11, color: C.grayOnDark, align: 'right' });
    }
  });

  return sections;
}

module.exports = { C: C, buildSections: buildSections };
