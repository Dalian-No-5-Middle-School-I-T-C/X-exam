# Changelog

本文件记录小程序的修改历史。格式参考 [Keep a Changelog](https://keepachangelog.com/)，每条按日期（或语义化版本）归并，并按下方分类组织。

分类说明：
- **Added** 新增能力 / 文件
- **Changed** 行为或实现变更（向后兼容）
- **Fixed** Bug 修复
- **Security** 安全相关修复
- **Removed** 删除的内容

---

## [Unreleased]

### Added
- 新增零依赖测试套件（`node:test`）：覆盖 `utils`（response / ai / auth / request / subscribe / animate）与 scores / semester / leaderboard / detail / trends / subjects / change-password 的页面逻辑与 canvas 绘制；`npm test` 统一运行单测与既有自检。
- 恢复 CI 校验工作流（`.github/workflows/ci.yml`），在语法/JSON 校验后纳入 `npm test`。

## [2026-08-19]

### Added
- **获客扩展（分层架构落地）**：按审查报告分 4 期实现前端获客能力，架构为「视图 → 业务(services) → 网络(request) → 基础设施」，增长层（growth/）横切。
  - **第1期（提审）**：新增公开落地页 `pages/landing`（承载 school + inviter + examId 参数，引导进入登录）；`sitemap.json` 仅 `landing` 放开 allow、其余 disallow；各内容页（scores/detail/subjects/trends/semester/leaderboard/profile）接入 `onShareAppMessage` / `onShareTimeline` / `showShareMenu`；scores 骨架屏（全局样式已就绪）；`utils/privacy.js` 隐私指引占位。
  - **第2期**：`growth/poster.js` 原生离屏 canvas 绘制成绩卡 / 天梯卡并导出图片 → 保存相册（scores「保存成绩卡」、leaderboard「保存天梯卡」）；`utils/subscribe.js` 保留 TEMPLATE_ID 占位（获客订阅）；profile 订阅开关 + 查分成功（首次）引导开启订阅。
  - **第3期**：`growth/invite.js` 可逆编/解码 inviterId / schoolCode；login 解析落地页邀请参数存 storage 并预留 `schoolCode` 字段；登录成功后消费待生效邀请并深链到具体考试详情。
  - **第4期**：`growth/analytics.js` 封装 `wx.reportAnalytics`（事件需后台注册后启用，默认占位关闭）；在 landing 访问 / 进入 / 登录转化 / 分享 / 订阅 / 存卡 等关键节点埋点。
- **services 业务层**：新增 `services/scoresService`（成绩/学科对比/趋势/学期/单场详情 + 缓存）、`services/leaderboardService`（天梯）、`services/growthService`（增长编排：邀请归因/分享/订阅引导/埋点）。页面只调 service，不直接 require request（AI 分析、登出、改密等三个命名服务之外的流程除外，已在代码注释标注）。
- **growth 横切层**：`growth/share.js`（统一构造指向 landing 的分享路径 + 分享工厂）、`growth/poster.js`、`growth/subscribe.js`（复用 utils/subscribe + 查分引导）、`growth/invite.js`、`growth/analytics.js`。
- **detail 分享改指 landing**：成绩详情页 `onShareAppMessage` 不再直链本页，改为指向公开落地页并携带 `examId + inviter`，未登录接收方也能落地并归因。

### Changed
- 各内容页网络请求统一收敛到 `services/*`（scores/subjects/trends/semester/leaderboard/detail 单场详情），页面不再直接 `require('../../utils/request')` 发起成绩/天梯类请求。

## [2026-08-18]

### Added
- 一键转发：成绩报告（detail）与学科对比（subjects）页面新增「一键转发」按钮，将当前页面内容生成为图片并分享。
- 新增分享弹层组件 `components/poster`（离屏 Canvas 2D + 预览 + 分享/保存动作）。
- 新增 `utils/poster.js`：用 Canvas 2D 手工绘制海报，复用项目 editorial-brutalist 纸感蓝主题；按内容动态计算画布高度，长内容不截断。
- 海报保留完整成绩数据、图表（雷达图 / 差距柱状图）与排版样式；含小程序来源水印（深色页脚「数据来自 X-exam 小程序 · 仅供个人参考」）。
- 导出图默认 2 倍清晰度（750px 宽）；超高内容自动降系数以不超 4096px 画布上限。
- 生成后支持「分享到微信」（`wx.showShareImageMenu`，可发好友/朋友圈）与「保存到相册」（`wx.saveImageToPhotosAlbum`，处理相册授权），并支持长按图片转发（`show-menu-by-longpress`）。

### Changed
- 异步渲染时机：按钮仅在数据加载完成（`!loading && !error`）后可用；海报绘制完全自包含、不依赖任何网络图片，确保截图时数据已全部就绪。
- detail / subjects 页面按钮区新增 `.share-btn` 样式（复用 `.btn.out`），并各自登记 `poster` 组件。

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
- 天梯规则明确：允许公布部分排名（前十名）；开关默认开启（`system_settings.ladder_enabled`），关闭时接口返回 403。
- 我的排名缺失时显示「—」，不再伪造第 1 名。
- 详情页/天梯缺失 examId 参数时给出错误提示，不再请求无效接口。
- 关闭 `project.private.config.json` 的 `skylineRenderEnable`，消除「已开启 Skyline 却未声明 renderer」的误导配置，明确当前为 WebView 渲染。
- 登录/改密按钮增加提交防重，避免双击重复提交。
- 原卷图下载完成后返回页面不再重复下载；部分失败时给出失败张数提示，全部失败时本页会话不再自动重试（下拉刷新可手动重试）。
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
- 成绩缓存增加 24 小时 TTL：断网时不再无限展示旧成绩；升级前旧格式缓存命中即迁移为带时间戳的新格式。

### Removed
- `utils/request.js` 的 `getBuffer`（被 downloadFile 方案取代）。
- `app.json` 中无效的 `tabBar.fontSize` 配置；`project.private.config.json`（本地私有配置，已加入 `.gitignore`）。

### Security
- 微信搜索索引收紧：`sitemap.json` 改为 `disallow`，成绩页不再被微信搜索收录。

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
