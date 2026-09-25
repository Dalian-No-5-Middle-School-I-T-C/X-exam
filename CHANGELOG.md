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
- **按需注入与用时注入**：`app.json` 增加 `"lazyCodeLoading": "requiredComponents"`（基础库 ≥2.11.1，低版本兼容但无优化效果），启动时只注入当前页所需的页面与自定义组件代码——`admin-ladder`、`change-password`、`exam-paper`、`landing` 等未访问页不再参与启动注入。`pages/detail`、`pages/trends` 进一步为海报组件配置占位组件 `view`（≥2.11.2）：只有点过「一键转发」才注入 `components/poster` 与它 `require` 的 `utils/poster.js`。时序随之改为「先 `wx:if` 挂载 → 组件 `attached` 发 `ready` → 页面 `selectComponent('#poster').open(model)`」，占位期拿不到实例方法时不再直接调用。`scripts/validate-project.mjs` 新增校验：`componentPlaceholder` 的键必须在同文件 `usingComponents` 中声明（键写错不报错，只会让用时注入静默失效）。
- **原卷与逐题正确答案**（依赖后端 Project-X v2.6.0）：新增 `pages/exam-paper/exam-paper` 页面，成绩公布且教师开启「显示原卷」后可进入 —— 先看逐题答案与每张原卷页图片（图片下方按题号渲染老师保存的答案文字，不判对错），末尾展示本人作答图块。入口两处：成绩卡片「查看原卷 ›」与详情页「查看答案解析」，两者均由后端 `paper_visible` / `paperVisible` 控制，前端不自行推断公布状态；老师从未上传原卷图片时显示「原卷未上传」。
  - `utils/examPaper.js`：响应归一化与渲染模型（纯函数，兼容 snake/camel 字段、空白折叠、题号缺失不伪造、下载失败的条目剔除因而不留破图）。
  - `services/examPaperService.js`：原卷页与作答图块图片走 `wx.downloadFile` + `Authorization: Bearer`（token 不进 URL），并发 3，页面卸载即取消且不再回写 `setData`。
  - 原卷页支持下拉刷新；图片全部下载失败时提示「试卷图片暂不可用，可下拉重试」，逐题答案不受影响照常显示。
- 新增零依赖测试套件（`node:test`）：覆盖 `utils`（response / ai / auth / request / subscribe / animate / examPaper）、`examPaperService` 的下载并发与取消、scores / leaderboard / detail / trends / change-password 的页面逻辑与 canvas 绘制；`npm test` 统一运行单测与既有自检。
- 恢复 CI 校验工作流（`.github/workflows/ci.yml`），在语法/JSON 校验后纳入 `npm test`。
- 管理员专属的成绩天梯管理页，依赖后端管理员鉴权的开关读取与更新接口。

### Changed
- **成绩天梯不再切开同分并列**：天梯仍默认只展示前十，但第 10 条若与后面的人同名次，该并列组一并列出（Project-X 三条天梯接口统一按 `takeLadder` 截断）。前端按后端返回条数整表渲染、不自行截断，多于 10 条时副标题改为「前十 · 同分并列全显（共 N 人）」。后端未升级时仍是硬切 10 条。
- **领奖台不再挑「三个代表」**：并列第 1 多于 3 人时，领奖台三个位置装不下整组第 1 名，摆哪三个都是任意取舍；此时改为整行「第 1 名 N 人」，全部第 1 名由下方完整榜单逐条列出。第 1 名不超过 3 人（含恰好 3 人）时领奖台照常摆放。
- **保存天梯卡同守领奖台规则**：`growth/poster.js` 的天梯卡此前固定 `slice(0, 3)`，并列第 1 超过 3 人时导出的图片仍会凭空画出「前三」，把同分的人切成上卡/不上卡两半。现由页面把 `tiedFirst` 传给海报，多于 3 人时整条横幅只写「第 1 名 N 人」，不再画三张卡。
- **学科对比并入趋势页，页面改名「分析」**：`pages/trends` 一屏给出「成绩走势」（总分 / 班均 / 年段均折线）与「学科对比」（雷达 + 明细表 + 差距柱 + 最需加强学科 + 一键转发）。TabBar、导航栏标题与页内标题同步由「趋势 / 成绩趋势」改为「分析」。两段数据各自请求 `/scores/me/trends` 与 `/scores/me/subject-comparison`、各自持有错误态与空态，任一接口异常只显示本段提示，不清空另一段；`load()` 等两个请求都回来才收 loading，避免先回来的那个提前结束下拉刷新。

### Fixed
- **合并后折线不再被学科重绘掐断**：并入一页时三张图先共用了 `_cancelAll()`，而两段数据各自异步回来各自重绘——`drawSubjects()` 会顺手取消折线仍在跑的动画，折线常停在半路（同一画布上还可能新旧两轮交错闪绘）。现改为每张图只取消自己那一轮（`_cancel`），页面隐藏/卸载时才全停。
- **画布零尺寸守卫补到共用入口**：这道判断原先只在趋势页取折线画布的路上，雷达与柱状（原 `pages/subjects`）没有，宽高为 0 时仍把 `canvas.width` 置 0 再按 dpr 缩放，画出来是退化图形。现守卫上移到 `_queryCanvas`，三张图一并受益。
- **重试时不再叠加骨架屏**：`loading` 为真即渲染骨架，已加载好的那段内容仍在下方，页面变成「骨架 + 旧数据」两层（原页面只有一段，不易看出；合并成两段后重试必现）。现只在两段都还没有数据时显示骨架。
- 删除分析页遗留的失效指引「学科雷达对比、学期进步/退步已移至「我的成绩」页的分析入口」——雷达已回到本页、学期对比整页删除、成绩页的分析入口卡也一并撤掉，按这句去找会一无所获。
- 天梯榜单中「我」那一行的高亮此前从未生效：后端天梯条目不带任何本人标记，前端 `isMe` 恒为 `false`，`.lb-row.me` 样式无对象可套。现由后端按 token 身份下发 `isCurrentUser`，前端原有映射本就兼容该字段，底色直接生效。
- 单场天梯的「我的排名」卡此前从不出现：后端把天梯名次读成 `score-table` 并不产出的 `rank` 字段，`rows[].rank` 与 `myRank` / `myScore` 一起被序列化丢弃，而天梯条目又不带本人标记；随 Project-X 改用年排 `gradeRank` 修复，前端逻辑不变。
- 成绩页、成绩卡与详情页统一显示年级排名；天梯同分学生显示相同名次。
- 统一成绩页按钮、统计卡与分析入口的对齐和字号。

### Removed
- **删除 `pages/subjects`（学科对比页）**：整页并入分析页，成绩首屏的「学科对比」入口卡与其 `goSubjects` 跳转一并撤掉。
- **删除 `pages/semester`（学期对比页）**：连同成绩首屏的「学期对比」入口卡、`goSemester` 跳转，以及 `services/scoresService.js` 的 `fetchSemesterComparison`。`app.json` 由 12 页减为 10 页。后端 `GET /api/scores/me/semester-comparison` 前端已无消费方，是否下线由后端决定。
- 清理随之失效的样式：`pages/scores/scores.wxss` 的 `/* 分析入口 */` 整块（含两枚 base64 图标）；`pages/trends/trends.wxss` 里学期对比搬走后就一直没删的 `.sem-row` / `.sem-tags` 死样式。

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
