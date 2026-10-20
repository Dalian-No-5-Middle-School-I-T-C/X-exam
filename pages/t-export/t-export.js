// pages/t-export/t-export.js
// 教师工作台的「导出成绩表」：把主站导出面板的能力搬到小程序——列选择与排序、两个快捷预设、
// 4 槽位模板（与主站共用后端同一份 user_id 维度的数据）、年级前 N 名参照表、A4 超宽提示、数据预览，
// 并多出一种主站没有的形态：逐班各出一份（后端每次只接受一个 classId，所以是逐班串行请求）。
// 页面本身不发请求也不碰文件系统，全部交给 services/exportService.js；纯计算在 utils/exportTable.js。
// 权限一律由后端裁决：requireExamAccess + can_view_scores + can_view_students + grade:read，
// 任一不过 403，message 是后端写好的中文，原样显示。
const teacherService = require('../../services/teacherService');
const exportService = require('../../services/exportService');
const role = require('../../utils/role');
const analysis = require('../../utils/analysis');
const table = require('../../utils/exportTable');

const CATEGORY_LABEL = { basic: '基本信息', score: '分数', ranking: '排名', questions: '小题分', other: '其他' };
const MODES = [
  { key: 'all', label: '全部班级一份' },
  { key: 'one', label: '指定一个班' },
  { key: 'each', label: '逐班各出一份' }
];
const PRESETS = [
  { key: 'basic', label: '基础表' },
  { key: 'full', label: '全列' },
  { key: 'subs', label: '含小题分' }
];

function failText(err) {
  if (!err) return '加载失败';
  if (err.status === 0) return '网络异常，请检查连接后重试';
  return err.message || '加载失败';
}

function decorateColumns(ids) {
  return table.cleanColumns(ids).map(function (id, i) {
    const def = table.COLUMN_DEFS.filter(function (d) { return d.id === id; })[0];
    return {
      id: id,
      index: i,
      label: table.labelOf(id),
      header: table.headerOf(id),
      group: CATEGORY_LABEL[def.category] || '其他',
      // 首行不能上移、末行不能下移，按钮直接不给可点态
      canUp: i > 0,
      canDown: false
    };
  }).map(function (c, i, arr) {
    c.canDown = i < arr.length - 1;
    return c;
  });
}

function decorateAvailable(list) {
  return list.map(function (d) {
    return { id: d.id, label: d.label, group: CATEGORY_LABEL[d.category] || '其他' };
  });
}

// 模板按 user_id 只存 4 个槽位，且只有存了的槽位才出现在响应里；
// 页面要显示的是「1/2/3/4 各是什么状态」，所以按槽位补齐，缺的留空而不是让 index 错位。
function decorateSlots(list, activeSlot) {
  const bySlot = {};
  (list || []).forEach(function (t) { bySlot[t.slot] = t; });
  return [1, 2, 3, 4].map(function (slot) {
    const t = bySlot[slot];
    return {
      slot: slot,
      filled: !!t,
      name: t ? t.name : '空槽位',
      meta: t ? (t.columns.length + ' 列 · 前 ' + t.sideTableN + ' 名 · 间隙 ' + t.gapCols + ' 列') : '',
      active: activeSlot === slot
    };
  });
}

function pct(done, total) {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

// 预览矩阵是字符串数组，直接 wx:for 时 wx:key 只能拿值本身当 key，而「—」这类重复值会撞 key；
// 补一个位置 uid，行/格都按 uid 走，微信开发者工具就不会报 duplicate key。
function decoratePreview(view) {
  return {
    headers: view.headers.map(function (h, i) { return { uid: 'h' + i, text: h }; }),
    rows: view.rows.map(function (cells, ri) {
      return {
        uid: 'r' + ri,
        cells: cells.map(function (c, ci) { return { uid: 'r' + ri + '-' + ci, text: c }; })
      };
    })
  };
}

Page({
  data: {
    examId: '',
    examName: '',
    invalid: false,
    ready: false,
    loading: true,

    modes: MODES,
    mode: 'all',
    classOptions: [],
    classIndex: 0,
    classLabel: '',
    classesCapped: 0,
    classesCap: 0,

    presets: PRESETS,
    preset: 'basic',
    selected: [],
    selectedIds: [],
    available: [],
    hasPlaceholder: false,

    sideOn: true,
    sideN: 10,
    gapCols: 1,
    widthTotal: 0,
    widthLimit: table.A4_MAX_CHARS,
    overA4: false,

    preview: { headers: [], rows: [] },
    previewCount: 0,
    previewError: '',
    previewNote: '',
    noAssigned: false,
    hasSubColumns: false,

    slotList: decorateSlots([], 0),
    templates: [],
    activeSlot: 0,
    templateBusy: false,
    templateNote: '',

    exporting: false,
    progressDone: 0,
    progressTotal: 0,
    progressPct: 0,
    progressName: '',
    results: [],
    resultErrors: [],
    resultNote: '',
    localCount: 0
  },

  onLoad: function (options) {
    if (!role.guardWorkspace()) return;
    const id = options && options.examId ? String(options.examId) : '';
    if (!/^\d+$/.test(id)) {
      this.setData({ invalid: true, loading: false });
      return;
    }
    const passedName = options && options.name ? decodeURIComponent(options.name) : '';
    // 成绩榜带班过来时直接落到「指定一个班」，省得教师再点一遍范围与班级
    const passedClass = options && options.classId !== undefined && options.classId !== null && options.classId !== ''
      ? String(options.classId) : '';
    this._pendingClassId = /^\d+$/.test(passedClass) ? passedClass : null;
    const lim = table.limits();
    this.setData({
      examId: id,
      examName: passedName,
      classesCap: lim.classesPerExport,
      sideN: lim.sideTableN,
      gapCols: lim.gapCols,
      widthLimit: table.A4_MAX_CHARS,
      mode: this._pendingClassId !== null ? 'one' : 'all'
    });
    this.applyPreset('basic');
    this.loadClasses();
    this.loadPreview();
    this.loadTemplates();
    this.setData({ localCount: exportService.listLocalFiles().length });
  },

  onReady: function () { this.setData({ ready: true }); },

  onUnload: function () {
    // issue #15 那条约定：异步任务返回的对象必须带 cancel()，页面卸载时无条件调用
    if (this._job && typeof this._job.cancel === 'function') this._job.cancel();
  },

  // ── 派生态：列一变就重算可选列、宽度与预览表头 ──────────
  idsOf: function (selected) {
    return selected.map(function (c) { return c.id; });
  },

  syncColumns: function (ids, presetKey) {
    const selected = decorateColumns(ids);
    const sideN = this.data.sideOn ? this.data.sideN : 0;
    const width = table.widthInfo(this.idsOf(selected), sideN, this.data.gapCols);
    this.setData({
      selected: selected,
      selectedIds: this.idsOf(selected),
      available: decorateAvailable(table.remainingColumns(this.idsOf(selected))),
      hasPlaceholder: this.idsOf(selected).indexOf('needsReview') >= 0 ||
        this.idsOf(selected).indexOf('confidence') >= 0,
      widthTotal: width.total,
      overA4: width.over,
      preset: presetKey === undefined ? '' : presetKey
    });
    return selected;
  },

  applyPreset: function (key) {
    let ids = table.PRESET_BASIC;
    if (key === 'full') ids = table.PRESET_FULL;
    else if (key === 'subs') ids = table.PRESET_WITH_SUBS;
    else key = 'basic';
    this.syncColumns(ids, key);
  },

  // ── 首屏三件事互不牵连：班级名单、预览、模板 ────────────
  loadClasses: function () {
    const self = this;
    teacherService.fetchClasses(this.data.examId)
      .then(function (resp) {
        const cap = table.limits().classesPerExport;
        const all = analysis.normalizeClasses(resp);
        const options = all.map(function (c) {
          return { classId: c.classId, className: c.className || '未分班' };
        });
        const capped = Math.max(0, options.length - cap);
        const list = options.slice(0, cap);
        // 成绩榜带班进来时对齐到那个班；对不上（班被删了/超出上限）就退回列表第一个
        let at = 0;
        if (self._pendingClassId !== null) {
          const hit = list.findIndex(function (c) { return String(c.classId) === self._pendingClassId; });
          if (hit >= 0) at = hit;
        }
        self.setData({
          classOptions: list,
          classIndex: at,
          classLabel: list.length ? list[at].className : '',
          classesCapped: capped
        });
        // 班级名单比预览慢：从成绩榜带班进来时，第一次预览只能按「全部班级」取。
        // 名单到手后如果筛选口径变了就重取一次，否则页面上写着「预览口径：二班」、表格里的数却是全年级的。
        if (self.previewClassId() !== self._previewClassId) self.loadPreview();
        else self.refreshPreviewScope();
      })
      .catch(function () { /* 名单取不到时逐班导出没意义，但整场导出仍然可用 */ });
  },

  // classId=0 在 GET query 里会被后端当真值判断吃掉，预览只能退回全部班级口径
  previewClassId: function () {
    if (this.data.mode !== 'one') return undefined;
    const picked = this.data.classOptions[this.data.classIndex];
    if (!picked) return undefined;
    return exportService.previewScope(picked.classId);
  },

  refreshPreviewScope: function () {
    const picked = this.data.classOptions[this.data.classIndex];
    const id = picked ? picked.classId : null;
    let note = '预览口径：全部班级';
    if (this.data.mode === 'one' && id === 0) note = '预览口径：全部班级（后端 GET 不接受 classId=0，导出的文件仍按「无班级」筛选）';
    else if (this.data.mode === 'one' && id) note = '预览口径：' + (picked.className || '');
    this.setData({ previewNote: note });
  },

  loadPreview: function () {
    const self = this;
    const id = this.previewClassId();
    this._previewClassId = id;
    // 两次预览可能同时在飞（换班后名单才到、或教师连续切班），后发先至时旧结果必须丢弃，
    // 否则页面上是「二班」的口径、表格里却是上一次全年级的行
    const seq = (this._previewSeq || 0) + 1;
    this._previewSeq = seq;
    this.refreshPreviewScope();
    teacherService.fetchScoreTable(this.data.examId, id)
      .then(function (resp) {
        if (self._previewSeq !== seq) return;
        const view = table.previewTable(resp, self.data.selectedIds, table.limits().previewRows);
        if (view.examName) self.setData({ examName: view.examName });
        self.setData({
          loading: false,
          preview: decoratePreview(view),
          previewCount: view.totalCount,
          previewError: '',
          noAssigned: !view.hasAssignedScore,
          hasSubColumns: view.hasSubColumns
        });
      })
      .catch(function (err) {
        if (self._previewSeq !== seq) return;
        self.setData({ loading: false, previewError: failText(err), preview: { headers: [], rows: [] } });
      });
  },

  loadTemplates: function () {
    const self = this;
    exportService.fetchTemplates()
      .then(function (list) {
        self.setData({
          templates: list,
          slotList: decorateSlots(list, self.data.activeSlot),
          templateNote: ''
        });
      })
      .catch(function () {
        self.setData({
          templates: [],
          slotList: decorateSlots([], self.data.activeSlot),
          templateNote: '模板读取失败，可继续直接导出'
        });
      });
  },

  templateOf: function (slot) {
    const hit = this.data.templates.filter(function (t) { return t.slot === slot; })[0];
    return hit || null;
  },

  // ── 交互 ────────────────────────────────────────────
  onPickMode: function (e) {
    const key = e.currentTarget.dataset.key;
    if (!key || key === this.data.mode) return;
    this.setData({ mode: key });
    this.refreshPreviewScope();
    if (key === 'one') this.loadPreview();
  },

  onClassChange: function (e) {
    const idx = Number(e.detail.value);
    const picked = this.data.classOptions[idx];
    if (!picked) return;
    this.setData({ classIndex: idx, classLabel: picked.className });
    this.loadPreview();
  },

  onPreset: function (e) {
    const key = e.currentTarget.dataset.key;
    if (!key) return;
    this.applyPreset(key);
    this.loadPreview();
  },

  onAddCol: function (e) {
    const id = e.currentTarget.dataset.id;
    this.syncColumns(table.toggleColumn(this.data.selectedIds, id));
    this.loadPreview();
  },

  onRemoveCol: function (e) {
    const id = e.currentTarget.dataset.id;
    this.syncColumns(table.toggleColumn(this.data.selectedIds, id));
    this.loadPreview();
  },

  onMoveCol: function (e) {
    const idx = Number(e.currentTarget.dataset.index);
    const delta = Number(e.currentTarget.dataset.delta);
    this.syncColumns(table.moveColumn(this.data.selectedIds, idx, delta));
  },

  onToggleSide: function (e) {
    const on = !!(e && e.detail ? e.detail.value : !this.data.sideOn);
    // 关掉时把 N 置 0 是让请求体不带参照表；再打开时必须给回一个正数，
    // 否则「开开关 + sideN=0」在页面上看着有参照表、导出的文件里却没有
    const n = on ? (this.data.sideN > 0 ? this.data.sideN : table.limits().sideTableN) : 0;
    this.setData({ sideOn: on, sideN: n });
    this.syncColumns(this.data.selectedIds, this.data.preset);
  },

  onSideNInput: function (e) {
    // 下界 1（不想带参照表请走开关，不是在输入框里填 0），上界是天花板而不是 env 初始值
    const n = table.clampSetting('sideTableN', e.detail.value, 1);
    this.setData({ sideN: n });
    this.syncColumns(this.data.selectedIds, this.data.preset);
  },

  onGapInput: function (e) {
    const n = table.clampSetting('gapCols', e.detail.value, 1);
    this.setData({ gapCols: n });
    this.syncColumns(this.data.selectedIds, this.data.preset);
  },

  onLoadTemplate: function (e) {
    const slot = Number(e.currentTarget.dataset.slot);
    const t = this.templateOf(slot);
    if (!t) return;
    // 先把槽位参数落进 data，再 syncColumns：宽度要按新 sideN 重算，顺序反了会显示上一次的值
    this.setData({ activeSlot: slot, sideOn: t.sideTableN > 0, sideN: t.sideTableN, gapCols: t.gapCols });
    this.syncColumns(t.columns, '');
    this.setData({ slotList: decorateSlots(this.data.templates, slot) });
    this.loadPreview();
    wx.showToast({ title: '已载入模板' + slot, icon: 'none' });
  },

  onSaveTemplate: function (e) {
    const self = this;
    const slot = Number(e.currentTarget.dataset.slot);
    if (this.data.templateBusy) return;
    if (this.data.selectedIds.length === 0) {
      wx.showToast({ title: '先选至少一列', icon: 'none' });
      return;
    }
    const existing = this.templateOf(slot);
    const shown = wx.showModal({
      title: '保存为模板' + slot,
      editable: true,
      placeholderText: existing ? existing.name : '模板名称',
      success: function (res) {
        if (!res.confirm) return;
        const name = (res.content || '').trim() || (existing && existing.name) || ('模板' + slot);
        self.setData({ templateBusy: true, templateNote: '' });
        exportService.saveTemplate(slot, {
          name: name,
          columns: self.data.selectedIds,
          sideTableN: self.data.sideOn ? self.data.sideN : 0,
          gapCols: self.data.gapCols
        })
          .then(function () {
            self.setData({ activeSlot: slot });
            return exportService.fetchTemplates();
          })
          .then(function (list) {
            self.setData({
              templates: list,
              slotList: decorateSlots(list, self.data.activeSlot),
              templateBusy: false
            });
            wx.showToast({ title: '已存到模板' + slot, icon: 'none' });
          })
          .catch(function (err) {
            self.setData({ templateBusy: false, templateNote: failText(err) });
          });
      },
      fail: function () {
        wx.showToast({ title: '当前微信版本不支持输入模板名', icon: 'none' });
      }
    });
    return shown;
  },

  onDeleteTemplate: function (e) {
    const self = this;
    const slot = Number(e.currentTarget.dataset.slot);
    if (!this.templateOf(slot) || this.data.templateBusy) return;
    wx.showModal({
      title: '删除模板' + slot,
      content: '删除后主站导出面板里也会消失（同一份数据）。',
      success: function (res) {
        if (!res.confirm) return;
        self.setData({ templateBusy: true });
        exportService.deleteTemplate(slot)
          .then(function () {
            if (self.data.activeSlot === slot) self.setData({ activeSlot: 0 });
            return exportService.fetchTemplates();
          })
          .then(function (list) {
            self.setData({
              templates: list,
              slotList: decorateSlots(list, self.data.activeSlot),
              templateBusy: false,
              templateNote: ''
            });
          })
          .catch(function (err) { self.setData({ templateBusy: false, templateNote: failText(err) }); });
      }
    });
  },

  // ── 导出 ────────────────────────────────────────────
  onExport: function () {
    const self = this;
    if (this.data.exporting) return;
    if (this.data.selectedIds.length === 0) {
      wx.showToast({ title: '请至少选择一列', icon: 'none' });
      return;
    }
    if (this.data.mode === 'each' && this.data.classOptions.length === 0) {
      wx.showToast({ title: '还没取到班级名单', icon: 'none' });
      return;
    }
    const mode = this.data.mode;
    const picked = this.data.classOptions[this.data.classIndex];
    const scopeClassId = mode === 'one' && picked ? picked.classId : undefined;
    this.setData({
      exporting: true,
      progressDone: 0,
      progressTotal: mode === 'each' ? this.data.classOptions.length : 1,
      progressPct: 0,
      progressName: '',
      results: [],
      resultErrors: [],
      resultNote: ''
    });
    this._job = exportService.runExport({
      examId: this.data.examId,
      examName: this.data.examName || ('考试' + this.data.examId),
      columns: this.data.selectedIds,
      sideTableN: this.data.sideOn ? this.data.sideN : 0,
      gapCols: this.data.gapCols,
      mode: mode,
      classId: scopeClassId,
      classes: this.data.classOptions,
      onProgress: function (p) {
        self.setData({
          progressDone: p.done,
          progressTotal: p.total,
          progressPct: pct(p.done, p.total),
          progressName: p.className || ''
        });
      }
    });
    this._job.then(function (r) {
      self._job = null;
      const files = r.files.map(function (f, i) {
        return { uid: i, className: f.className, name: f.name, path: f.path, sizeText: f.sizeText };
      });
      const errs = r.errors.map(function (x, i) {
        return { uid: i, className: x.className || '本场', message: x.message };
      });
      let note = '';
      if (r.cancelled) note = '已取消，已完成 ' + files.length + ' 份';
      else if (errs.length && files.length) note = '完成 ' + files.length + ' 份，' + errs.length + ' 份失败';
      else if (errs.length) note = '全部 ' + errs.length + ' 份都没导出成功，原因见下';
      else note = '已导出 ' + files.length + ' 份';
      if (r.skipped > 0) note += '；另有 ' + r.skipped + ' 个班超出单次上限未导出';
      self.setData({
        exporting: false,
        progressDone: r.total,
        progressPct: pct(r.total, r.total),
        results: files,
        resultErrors: errs,
        resultNote: note,
        localCount: exportService.listLocalFiles().length
      });
      if (!files.length && errs.length) wx.showToast({ title: errs[0].message, icon: 'none' });
    });
  },

  onCancelExport: function () {
    if (this._job && typeof this._job.cancel === 'function') this._job.cancel();
  },

  onOpenFile: function (e) {
    const path = e.currentTarget.dataset.path;
    exportService.openFile(path).catch(function (err) {
      wx.showToast({ title: err.message || '打开失败', icon: 'none' });
    });
  },

  onClearFiles: function () {
    const self = this;
    wx.showModal({
      title: '清空本地导出文件',
      content: '删除本机留存的全部成绩表，服务器数据不受影响。',
      success: function (res) {
        if (!res.confirm) return;
        exportService.clearLocalFiles();
        self.setData({ localCount: 0, results: [] });
        wx.showToast({ title: '已清空', icon: 'none' });
      }
    });
  },

  onRetry: function () {
    this.loadClasses();
    this.loadPreview();
    this.loadTemplates();
  },

  goAnalysis: function () {
    wx.navigateBack({
      fail: function () { wx.redirectTo({ url: '/pages/t-exams/t-exams' }); }
    });
  },

  goRanking: function () {
    const picked = this.data.mode === 'one' ? this.data.classOptions[this.data.classIndex] : null;
    const cid = picked && picked.classId ? '&classId=' + picked.classId : '';
    wx.navigateTo({ url: '/pages/t-ranking/t-ranking?examId=' + this.data.examId + cid });
  }
});
