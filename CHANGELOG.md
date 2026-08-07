# Changelog

本文件记录小程序的修改历史。格式参考 [Keep a Changelog](https://keepachangelog.com/)，每条按日期（或语义化版本）归并，并按下方分类组织。

分类说明：
- **Added** 新增能力 / 文件
- **Changed** 行为或实现变更（向后兼容）
- **Fixed** Bug 修复
- **Security** 安全相关修复
- **Removed** 删除的内容

---

## [2026-08-07]

### Security
- **detail 页原卷图鉴权修复（P0）**
  - 原 `loadExtras` 把登录 token 拼进图片 URL 查询串（`?token=...`）：token 会落入服务端访问日志、反向代理/CDN 缓存键与资源历史，存在泄露面；同时绕过 `utils/request` 封装，丢失了 401 自动清 token + 跳登录。
  - `utils/request.js` 新增 `getBuffer(path)`：GET 请求带 `Authorization` 头 + `responseType:'arraybuffer'`，复用统一 401 处理，resolve `{ buffer, contentType }`。
  - `pages/detail/detail.js` 的 `loadExtras` 改走 `get()` 封装拉元数据；原卷图改走 `getBuffer()` 拉字节后转 base64 data URI 喂给 `<image>`，**token 仅存在于请求头，不再进入 URL**。

### Changed
- `pages/detail/detail.js`：删除不再使用的 `API_BASE` 导入；新增 `loadCropImages` 方法承载原卷图下载逻辑，单张失败不阻断其余图片与整页。

#### Changed（计划项 / 待办，未落地）
- **P1 · 响应字段契约归一化（待办）**
  - 现状：`leaderboard` 与 `ai` 已做字段别名 + 兜底兼容，但 `subjects`（期望 `avgScore`/`avgClassAvg`）、`trends`（期望 `totalScore`/`classAvg`/`gradeAvg`）、`detail` 直接硬编码驼峰字段。后端若改 key 或返蛇形，这几页会静默空白，而前两页能扛。
  - 计划：仿 `utils/ai.js` 的 `normalizeReport` 做法，在 `utils` 层新增统一的响应归一化函数（按页面语义归一成绩/班级均分/年段均分等），页面只消费规范结构，消除各页散落的别名兼容逻辑。
  - 目标文件：`utils/response.js`（新增）、`pages/subjects/subjects.js`、`pages/trends/trends.js`、`pages/detail/detail.js`。
- **P1 · Skyline 渲染模式定调（待办）**
  - 现状：`project.private.config.json` 开启了 `skylineRenderEnable:true`，但 `app.json` 未声明 `renderer`，页面用的是 WebView 风格写法 → 实际仍为 WebView 渲染。开关当前无害，但易误判。
  - 计划：二选一 —— ① 明确走 WebView：在文档/配置中标注，关闭 `skylineRenderEnable` 避免误导；② 真上 Skyline：在 `app.json` 声明 `"renderer": "skyline"` + `rendererOptions`，并复核 canvas（`type="2d"`）/ `cover-view` / 动画 worklet 的兼容性（trends/subjects 的原生 canvas 与 rAF 动画需重点验证）。
  - 目标文件：`app.json`、`project.private.config.json`、相关页面 wxml/wxss。
