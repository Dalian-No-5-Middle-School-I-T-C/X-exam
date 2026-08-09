// pages/leaderboard/leaderboard.js
const { get } = require('../../utils/request');
const { animateNumber } = require('../../utils/animate');

function pickScore(it) {
  if (it.totalScore != null) return it.totalScore;
  if (it.total_score != null) return it.total_score;
  if (it.score != null) return it.score;
  return '';
}
function pickName(it, i) {
  return it.studentName || it.name || it.student_name || ('同学' + (i + 1));
}
function pickRank(it, i) {
  return it.rank != null ? it.rank : (it.ranking != null ? it.ranking : (i + 1));
}

Page({
  data: {
    examId: 0,
    examName: '',
    enabled: true,
    list: [],
    mine: null,
    loading: true,
    error: '',
    ready: false,
    mineRank: 0
  },

  onLoad: function (options) {
    const examId = parseInt(options.examId, 10) || 0;
    if (!examId) {
      this.setData({ loading: false, error: '参数缺失，无法加载天梯' });
      return;
    }
    const examName = options.name ? decodeURIComponent(options.name) : '';
    this.setData({ examId: examId, examName: examName });
    this.loadBoard();
  },

  onReady: function () { this.setData({ ready: true }); },
  onHide: function () { this._cancelMine(); },
  onUnload: function () { this._cancelMine(); },

  loadBoard: function (done) {
    const self = this;
    this.setData({ loading: true, error: '' });
    get('/scores/me/leaderboard?examId=' + this.data.examId)
      .then(function (resp) {
        const data = resp || {};
        const raw = data.leaderboard || data.board || data.rankings || data.list || data.topTen || data.top10 || [];
        const list = raw.map(function (it, i) {
          return {
            rank: pickRank(it, i),
            name: pickName(it, i),
            score: pickScore(it),
            isMe: !!it.isCurrentUser || !!it.isMe || !!it.isSelf
          };
        });

        let mine = null;
        const cur = data.currentUser || data.me || data.self || null;
        if (cur) {
          // 当前用户缺少 rank 时不伪造“第 1 名”，由页面显示“—”
          const curRank = cur.rank != null ? cur.rank : (cur.ranking != null ? cur.ranking : null);
          mine = { rank: curRank, score: pickScore(cur), name: pickName(cur, 0) };
        } else {
          const me = list.filter(function (x) { return x.isMe; })[0];
          if (me) mine = { rank: me.rank, score: me.score, name: '我' };
        }

        // 缺省关闭：只有后端显式开启才展示天梯
        const enabled = data.enabled === true || data.leaderboardEnabled === true;
        self.setData({ list: list, mine: mine, enabled: enabled, loading: false, error: '' });
        self.animateMine(mine);
      })
      .catch(function (err) {
        self.setData({ loading: false, error: (err && err.message) || '加载失败', enabled: false });
      })
      .finally(function () { if (typeof done === 'function') done(); });
  },

  // 我的排名数字滚动：首次滚动，之后直接赋值
  animateMine: function (mine) {
    const self = this;
    const target = mine && mine.rank != null ? mine.rank : 0;
    this._cancelMine();
    if (!this._mineDone) {
      this._mineDone = true;
      this.setData({ mineRank: 0 });
      this._cancelMineFn = animateNumber({ from: 0, to: target, duration: 650, onUpdate: function (v) { self.setData({ mineRank: v }); } });
    } else {
      this.setData({ mineRank: target });
    }
  },

  _cancelMine: function () {
    if (this._cancelMineFn) { this._cancelMineFn(); this._cancelMineFn = null; }
  },

  onPullDownRefresh: function () {
    this.loadBoard(function () { wx.stopPullDownRefresh(); });
  }
});
