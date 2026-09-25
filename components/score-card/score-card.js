// components/score-card/score-card.js
Component({
  options: {
    // apply-shared：允许 app.wxss 的 .tag/.muted 等公共类作用于组件内部
    styleIsolation: 'apply-shared'
  },
  properties: {
    score: { type: Object, value: {} }
  },
  methods: {
    onTap: function () {
      // 事件名避开原生 tap：原生 tap 会冒泡到父级，同名会导致 goDetail 双触发
      this.triggerEvent('cardtap', { id: this.data.score.exam_id });
    },
    onPaperTap: function () {
      // 「查看原卷」用 catchtap 拦住整卡跳转，只触发原卷事件
      this.triggerEvent('papertap', { id: this.data.score.exam_id });
    }
  }
});
