// components/score-card/score-card.js
Component({
  properties: {
    score: { type: Object, value: {} }
  },
  methods: {
    onTap: function () {
      this.triggerEvent('tap', { id: this.data.score.exam_id });
    }
  }
});
