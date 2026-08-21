/**
 * utils/animate.js —— 数字滚动补间工具（克制：缓出，无弹跳）
 *
 * animateNumber({ from, to, duration, onUpdate, onDone }) → 返回 cancel 函数
 * 页面 onHide / onUnload 时调用 cancel() 清理 interval，防后台空转。
 */

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * @param {object} opts
 * @param {number} opts.from 起始值
 * @param {number} opts.to 目标值
 * @param {number} [opts.duration=600] 毫秒
 * @param {(val:number)=>void} opts.onUpdate 每帧回调（中间帧取整，末帧为精确目标值）
 * @param {()=>void} [opts.onDone] 完成回调
 * @returns {() => void} cancel 清理函数
 */
function animateNumber(opts) {
  var from = Number(opts.from) || 0;
  var to = Number(opts.to) || 0;
  // 负数 duration 会导致 t 永远到不了 1、interval 泄漏，钳制为正
  var duration = Math.max(Number(opts.duration) || 600, 1);
  var onUpdate = opts.onUpdate || function () {};
  var onDone = opts.onDone || function () {};

  if (from === to) {
    onUpdate(to);
    onDone();
    return function () {};
  }

  var start = Date.now();
  var timer = setInterval(function () {
    var elapsed = Date.now() - start;
    var t = Math.min(elapsed / duration, 1);
    var eased = easeOutCubic(t);
    var val = from + (to - from) * eased;
    if (t >= 1) {
      clearInterval(timer);
      onUpdate(to);
      onDone();
    } else {
      onUpdate(Math.round(val));
    }
  }, 16);

  return function cancel() {
    clearInterval(timer);
  };
}

module.exports = { animateNumber: animateNumber };
