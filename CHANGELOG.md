# Changelog

本文件记录小程序的修改历史。格式参考 [Keep a Changelog](https://keepachangelog.com/)，每条按日期（或语义化版本）归并，并按下方分类组织。

分类说明：
- **Added** 新增能力 / 文件
- **Changed** 行为或实现变更（向后兼容）
- **Fixed** Bug 修复
- **Security** 安全相关修复
- **Removed** 删除的内容

---

## [2026-08-09]

### Fixed
- 冷启动不再停在登录页：`pages/login` 检测到已登录自动跳转成绩页。
- 初始密码提示不再与行为矛盾：改为如实提示「建议联系管理员修改」，登录照常完成。
- 详情页班级均分/原卷图不再只依赖缓存：改走单请求 `/scores/me/exams/:examId` 直接拉取班级逐题均分与图块，缺失时给出错误提示。
- 网络失败不再伪装成「暂无数据」：trends / subjects / semester 增加错误态与点击重试。
- 天梯入口不再只限最新考试：详情页新增「查看成绩天梯」。
- 「较上次 ±X」仅在同科目且满分一致时显示，避免无意义对比。
- 学科「最需加强」不再用第一个学科兜底猜测。
- 401 统一清除 token 与 user，避免残留旧用户信息。
- 天梯开关改为默认关闭，仅后端显式开启时展示。
- 我的排名缺失时显示「—」，不再伪造第 1 名。
- 详情页/天梯缺失 examId 参数时给出错误提示，不再请求无效接口。
- 关闭 `project.private.config.json` 的 `skylineRenderEnable`，消除「已开启 Skyline 却未声明 renderer」的误导配置，明确当前为 WebView 渲染。
- 登录/改密按钮增加提交防重，避免双击重复提交。
- 原卷图下载完成后返回页面不再重复下载；部分失败时给出失败张数提示。
- trends / subjects / semester 自动加载增加 5 秒防抖与进行中防重入；leaderboard / detail 增加加载防重入。
- scores 刷新失败后允许下次进入页面自动重试，不再被防抖窗口挡住。

### Changed
- 新增 `utils/response.js` 统一响应归一化（字段别名 + 数值容错），落地此前 P1 待办；scores / trends / subjects / detail 全部接入，后端字符串数字不再导致图表为 0。
- 原卷图改用 `wx.downloadFile`（Authorization 头 + 临时文件路径），移除 base64 塞 setData 的 `getBuffer`；并发限制 3，页面隐藏/卸载后不再回写结果。
- `utils/request.js` 重构出 `requestRaw` 供 `auth.js` 复用；请求默认 20s 超时，AI 分析由详情页按请求覆盖为 120s（见 `pages/detail/detail.js`）。
- `app.js` 移除未被使用的 globalData；`.green` / `.amber` 类名改为 `.up` / `.warn`，与真实颜色语义一致。
- `project.config.json` 的 libVersion 由 `trial` 固定为 `3.17.0`；README 的 AppID 与实际配置一致。
- 订阅开关文案明确「仅管理本机授权状态」。
- 天梯页对齐后端真实契约：`GET /api/ladder/exams/:examId`（`rows` / `myRank` / `myScore`，403=未开放），修正此前错误的 `/scores/me/leaderboard` 路径。
- 详情页改为单请求：`/api/scores/me/exams/:examId` 直接返回班级均分与试卷图块，不再依赖教师侧 `/api/exams` 接口（配合后端 Project-X#232）。
- 我的页（profile）UI 呼吸感优化：增大眉题/标题/学生卡/区块标题间距，退出登录按钮由 width:100% 改为水平居中（width:70% / max-width:480rpx / margin:auto）。
- tabBar 文字尺寸显式设为 12px（`app.json` 的 `tabBar.fontSize`），解决默认过小、可读性差的问题。

### Removed
- `utils/request.js` 的 `getBuffer`（被 downloadFile 方案取代）。

### Deferred
- 成绩列表分页：当前全量返回可接受，数据量大时再加 limit/offset。

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
- **P1 · Skyline 渲染模式定调（已定：方案①）**
  - 结论：明确走 WebView。已在 2026-08-09 关闭 `project.private.config.json` 的 `skylineRenderEnable`，消除「已开启 Skyline 却未声明 renderer」的误导；页面写法与 `type="2d"` 原生 canvas 保持 WebView 兼容。方案②（真上 Skyline）暂不实施，后续若需再评估。
  - 目标文件：`project.private.config.json`（已改）。
