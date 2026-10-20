// utils/env.js
// 后端已部署的 HTTPS 域名（公网、已 ICP 备案）
const API_BASE = 'https://dl5zx.cn';
const API_PREFIX = '/api';

// 数值闸门：默认值 + 这一处可改 + 硬天花板三档，天花板在 utils/exportTable.js 的 LIMIT_CEILING。
// 小程序没有环境变量，所以「可改档」就是这份文件；改越界只会被夹紧，不会把保护整档取消，
// 非法值（拼错的数字）回落默认值。与主站 PROJECTX_* 的口径保持一致。
// 逐项含义：
// - exportTimeoutMs：单次导出请求的超时。整场联考几十人×上百分小题，20 秒默认值不够用。
// - classesPerExport：「逐班各出一份」一次最多处理的班级数，超出按名单顺序截断并提示。
// - sideTableN：「年级前 N 名」参照表的 N 初始值。教师可以在页面上改，改到天花板（200）为止；
//   这一档只决定进页面时显示多少，不会把教师选的数裁小（见 exportTable.clampSetting）。
// - gapCols：主表与参照表之间的空列数初始值，同上（天花板 10）。
// - fileMb：单个导出文件写盘上限，超过直接判失败，避免撑爆小程序本地存储。
// - keepFiles：本地保留的历史导出文件个数，每次导出前按修改时间清理更早的。
// - previewRows：导出面板预览行数。
const LIMITS = {
  exportTimeoutMs: 60000,
  classesPerExport: 40,
  sideTableN: 10,
  gapCols: 1,
  fileMb: 8,
  keepFiles: 10,
  previewRows: 3
};

module.exports = { API_BASE, API_PREFIX, LIMITS };
