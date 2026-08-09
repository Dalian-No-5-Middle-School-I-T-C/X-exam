// pages/leaderboard/leaderboard.js
const { get } = require('../../utils/request');
const { animateNumber } = require('../../utils/animate');
const theme = require('../../utils/theme');

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
    const examName = options.name ? decodeURIComponent(options.name) : '';
    this.setData({ examId: examId, examName: examName });
    this.loadBoard();
  },

  onReady: function () { this.setData({ ready: true }); },
  onShow: function () { theme.syncPage(this); },
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
          mine = { rank: pickRank(cur, 0), score: pickScore(cur), name: pickName(cur, 0) };
        } else {
          const me = list.filter(function (x) { return x.isMe; })[0];
          if (me) mine = { rank: me.rank, score: me.score, name: '我' };
        }

        const enabled = data.enabled !== false && data.leaderboardEnabled !== false;
        self.setData({ list: list, mine: mine, enabled: enabled, loading: false });
        self.animateMine(mine);
      })
      .catch(function (err) {
        self.setData({ loading: false, error: (err && err.message) || '加载失败', enabled: false });
      })
      .finally(function () { if (done) done(); });
  },

  // 我的排名数字滚动：首次滚动，之后直接赋值
  animateMine: function (mine) {
    const self = this;
    const target = mine && typeof mine.rank === 'number' ? mine.rank : 0;
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
