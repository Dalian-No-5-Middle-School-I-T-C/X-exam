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
- **教师端导出成绩表（Excel，`pages/t-export`）**：主站教师端的 Excel 导出搬到小程序，并新增**分班级导出**。入口两处——分析页与成绩榜的「导出成绩 ›」，跳转时带上当前 `examId` 与已筛选的 `classId`（含 `classId=0` 的「未知班级」）。**主站后端零改动**，请求体与主站导出面板完全互通。
  - **三层结构**：`utils/exportTable.js` 是纯逻辑（16 个列定义含 `label` / `Excel 表头` / 分类 / 估算宽度、三档快捷预设、列增删移动、宽度估算与 A4 超宽判定、班级名单计划、文件名净化、预览表归一、模板归一），无 `wx` 依赖、带 `node utils/exportTable.js` 自检块；`utils/exportStore.js` 管本机落盘（`px_exports/` 目录 + `px_exports_index` 索引、同名加序号、空文件与超体积判失败、只保留最近 N 个）；`services/exportService.js` 是执行层（取二进制 → 落盘 → 逐班串行 → 打开预览 → 模板读写）。页面只调 service。
  - **三种导出范围**：全部班级一份（不传 `classId`）/ 指定一个班（`<picker>` 选班）/ 逐班各出一份（按名单顺序**串行** N 次 POST，每班一个 `.xlsx`，页面显示进度与「另有个班超出单次上限不导出」）。单班失败只记该班错误、不断整批；`runExport` 返回的对象带 `cancel()`，页面 `onUnload` 与取消按钮都会调用它。
  - **列模板与主站共用一份数据**：4 个槽位按 `user_id` 存后端，`GET/PUT/DELETE /api/export/templates[/:slot]`；后端字段是 snake_case（`side_table_n` / `gap_cols`）且 `columns` 可能是 JSON 字符串，`normalizeTemplates` 兜住这两处，所以主站存的模板在小程序直接能载入，反之亦然。槽位越界与空列在本地先拦下，且以 **rejected promise** 返回而非同步 `throw`——页面只有一条 `.catch`，混进同步异常会变成「点了没反应」的白屏。
  - **对齐主站的能力**：列选择与列序（顺序即 Excel 列序）、「需要复核 / 置信度」两列后端无数据源故导出为空列（页面显式提示，与主站同形）、「年级前 N 名」参照表附在同一 Sheet 右侧 + 间隙列、A4 纵向列宽估算与超宽提示（`A4_MAX_CHARS = 63` 与主站同值）、数据预览（与导出接口同一份后端仓储方法，`hasAssignedScore` 为假时整列省略「赋分」、名次变化按 `↑+3 / ↓-2 / 0 / -` 显示）。
  - **`classId=0` 的两种命运**：POST 请求体里 `classId: 0` 后端照原意出「未知班级」那一份；GET 预览的 query `?classId=0` 会被后端判成未传而返回全年级数据，故 `previewScope()` 让预览退回全部班级并在页面上标注当前口径。
- `tests/export.test.js`（31 例）：列定义与 `label`/`header` 分工、未知/重复列丢弃、`buildExportBody` 空列判定、宽度与 A4 阈值（基础表 + 前 10 名参照表 = 67 > 63 必提示、关参照表 46 通过）、三档数值闸门（改 `env.LIMITS` 后夹紧、非法值回落默认、`LIMITS` 键集合必须与 `LIMIT_CEILING` 一一对应）、模板 snake_case 与 JSON 字符串列归一、逐班计划超量截断并报出跳过数、文件名净化、预览表省略「赋分」与名次变化写法、手写 UTF-8 解码与 403 错误体文案、`formatBytes`、线协议（`arraybuffer` / 超时 / `Bearer` / `DELETE` / 403 中文原样带出）、401 被动登出把 xlsx 与索引一并删、落盘去重与保留数、`requestWorkbook` 的 JSON-in-binary / 空文件 / 超体积三种情况都不落盘、逐班串行顺序与单班 403 不断批、`cancel()` 语义、三种模式的请求体、学生守卫与非法 `examId` 不请求、参照表开关与输入夹紧、模板载入/保存/删除、预览失败重试与跨页带班、入口存在性，以及**排版回归断言**（全仓 `text-transform` 只允许一处、负字距选择器白名单、不出现 `word-break: break-all`、`.badge` 行高锁 1、`.meta` 无衬线 + `tabular-nums`、`.ph` 走 `--gray` 变量）。
- **`npm test` 追加导出自检**：链尾新增 `node utils/exportTable.js && node utils/exportStore.js`；`scripts/validate-project.mjs` 无需改动，`pages/t-export` 直接纳入页面注册与事件/类名一致性校验（现 53 个 JS 文件、22 个 JSON 文件）。
- **教师工作台（只读分析，教师 / 管理员专属）**：小程序此前只有学生查分主线，小题得分率、班际对比、知识点薄弱只能回主站网页看。本次补齐小程序端的**只读**分析，管理员与教师走同一条判定，因此天然同步到管理员端。
  - **入口与分流**：`utils/role.js` 是前端唯一的角色判据——读登录响应的 `user.role_name / user.role_id`（后端从不返回 `user.role`，也从不返回 `isAdmin`）与顶层 `permissions`；admin 与持有 `grade:read` 的 teacher 可达，学生与未知角色一律拒绝。管理员判定收敛为 `role.isAdminUser()`：权威字段存在时只认 `role_name / role_id`，只有完全读不到权威字段的旧会话才退回历史线索（`isAdmin` / `role` / `role_display_name` 含「管理员」），`pages/profile` 的「管理」卡片与 `pages/admin-ladder` 的准入守卫共用这一个判据，不再出现「入口看不见、页面却能进」的错位。`homePath()` 让教师 / 管理员登录后直接落在 `pages/t-exams`，学生仍落在成绩页；邀请深链（`examId` → 单场成绩）只对学生生效。`pages/profile` 对教师 / 管理员显示「教师工作台」入口，学生看不到该行，其余界面与查分流程不变。
  - **五个页面**：`pages/t-exams`（可见考试列表：按考试日期倒序 + 学科胶囊 + 关键词搜索 + 考试数/已公布/已判分汇总，公布状态直接取后端 `score_published` 的 0/1/2 不做推断）、`pages/t-analysis`（单场四页签：概况〔均分 / 标准差 / 及格率 / 优秀率 / 五数概括 / 与上次对比〕、小题得分率〔得分率 + 难度 P + 区分度 D + 错误率档，可排序、可下钻〕、分布与指标〔分数段直方图 + 整卷难度/区分度/信度〕、知识点薄弱；班级筛选覆盖全部页签；页签各自持有加载与错误态，任一接口失败只影响本页签）、`pages/t-question`（小题逐人得分，本地排序）、`pages/t-ranking`（成绩榜：整榜一次取回后本地分页与搜索，翻页零请求）、`pages/t-classes`（班际对比：各班统计量 + 同题得分率极差 Top10）。`app.json` 由 10 页增至 15 页。
  - **权限边界**：五个页面 `onLoad` 先 `role.guardWorkspace()`，不合格角色直接 `reLaunch` 回成绩页、请求都不发；真正的边界仍在后端——`/api/exams` 要 `exam:read`、`/api/analysis/*` 要 `grade:read`，逐接口再叠 `requireExamAccess`（教师按任教学段收敛数据范围）与 `can_view_charts` / `can_view_students` 查看门，学生 token 请求一律 403。旧会话读不到 `permissions` 时放行入口、由接口 403 兜底，避免把老用户挡在门外又给不出原因；后端明确返回空数组（一个权限位都没有）时入口隐藏，不给点了才报错的死入口。
  - **只读**：`services/teacherService.js` 只含 GET；改分、批量发布、阅卷提交、原卷图片、答题卡设计一律不提供。教师页面也不接入 `onShareAppMessage` / `onShareTimeline` 与海报转发——页面上是他人成绩明细。
  - **不放分包、不进 TabBar**：TabBar 仍是「成绩 / 分析 / 我的」三项，教师页面自带回「我的」按钮（`wx.switchTab`）；教师端新增代码合计约 94KB、`pages/` 整体约 182KB，相对主包 2MB 没有压力，分包反而要处理跨包跳转与主包依赖，故沿用主包 + `lazyCodeLoading` 按需注入。
  - `utils/analysis.js`：分析响应归一化（snake/camel 别名、裸数组与裸对象并存故不拆包、`null` 与字符串数值容错，纯函数 + `node utils/analysis.js` 自检块）。口径纪律集中在这层：`scoreRate / passRate / excellentRate / errorRate` 为 0-100，`difficulty` 为 0-1，`discrimination` 为 -1~1，`avgScore` 为分值，各按各口径渲染、不做二次归一。
- `tests/teacher.test.js`（21 例）：角色门（含只有 `role_id` 的旧响应、域级通配 `grade:*`、读不到 `permissions` 的旧会话放行 vs 明确空数组隐藏）、管理员判据（权威字段优先、旧会话退回线索、教师显示名叫「管理员」也不算）、`homePath` 分流、`guardWorkspace` 拦下学生且不发出任何请求、`admin-ladder` 与 `profile` 共用同一判据、非法 `examId` / 题号不请求、后端 403 文案原样呈现、班级筛选下标 → `classId` 映射与切班只重取当前页签、小题按得分率 / 区分度升序且 `null` 排最后、题号重复时小题行仍有唯一列表键（`wx:key="uid"`）、整榜一次取回后翻页零请求、`rank === null` 不当成前三名、满分不可知时及格率显示「—」而不是 `0%`、`classId=0`（未知班级）不传给知识点接口、班际极差要求至少两个班有数据。
- **按需注入与用时注入**：`app.json` 增加 `"lazyCodeLoading": "requiredComponents"`（基础库 ≥2.11.1，低版本兼容但无优化效果），启动时只注入当前页所需的页面与自定义组件代码——`admin-ladder`、`change-password`、`exam-paper`、`landing` 等未访问页不再参与启动注入。`pages/detail`、`pages/trends` 进一步为海报组件配置占位组件 `view`（≥2.11.2）：只有点过「一键转发」才注入 `components/poster` 与它 `require` 的 `utils/poster.js`。时序随之改为「先 `wx:if` 挂载 → 组件 `attached` 发 `ready` → 页面 `selectComponent('#poster').open(model)`」，占位期拿不到实例方法时不再直接调用。`scripts/validate-project.mjs` 新增校验：`componentPlaceholder` 的键必须在同文件 `usingComponents` 中声明（键写错不报错，只会让用时注入静默失效）。
- **原卷与逐题正确答案**（依赖后端 Project-X v2.6.0）：新增 `pages/exam-paper/exam-paper` 页面，成绩公布且教师开启「显示原卷」后可进入 —— 先看逐题答案与每张原卷页图片（图片下方按题号渲染老师保存的答案文字，不判对错），末尾展示本人作答图块。入口两处：成绩卡片「查看原卷 ›」与详情页「查看答案解析」，两者均由后端 `paper_visible` / `paperVisible` 控制，前端不自行推断公布状态；老师从未上传原卷图片时显示「原卷未上传」。
  - `utils/examPaper.js`：响应归一化与渲染模型（纯函数，兼容 snake/camel 字段、空白折叠、题号缺失不伪造、下载失败的条目剔除因而不留破图）。
  - `services/examPaperService.js`：原卷页与作答图块图片走 `wx.downloadFile` + `Authorization: Bearer`（token 不进 URL），并发 3，页面卸载即取消且不再回写 `setData`。
  - 原卷页支持下拉刷新；图片全部下载失败时提示「试卷图片暂不可用，可下拉重试」，逐题答案不受影响照常显示。
- 新增零依赖测试套件（`node:test`）：覆盖 `utils`（response / ai / auth / request / subscribe / animate / examPaper）、`examPaperService` 的下载并发与取消、scores / leaderboard / detail / trends / change-password / profile 的页面逻辑与 canvas 绘制；`subscribe` 一侧断言失败结果的 `status` / `errno` / `detail` 三个字段与开关文案分类（404 与 503 与「用户取消」互不混用）；`npm test` 统一运行单测与既有自检。
- 恢复 CI 校验工作流（`.github/workflows/ci.yml`），在语法/JSON 校验后纳入 `npm test`。
- 管理员专属的成绩天梯管理页，依赖后端管理员鉴权的开关读取与更新接口。

### Changed
- **`utils/env.js` 新增 `LIMITS` 可改档**：小程序没有环境变量，这份文件就是中间档，与 `utils/exportTable.js` 的 `LIMIT_DEFAULTS` / `LIMIT_CEILING` 组成「默认值 + 可改 + 硬天花板」三档；改越界只被夹紧、不会把某一档整档取消。README 补了逐项语义表与「初始值 vs 上限」的区分说明。
- **`utils/request.js` 支持二进制通道**：`opts.responseType === 'arraybuffer'` 时 resolve 的就是 `ArrayBuffer`；`apiError()` 先用手写 UTF-8 解码再取 `message`，否则 403 的那句中文在二进制错误体里读不出来，教师只会看到「请求失败」。解码走 `utils/response.js` 的 `decodeUtf8`（设备上的 `TextDecoder` 不可靠：1/2/3/4 字节全支持，代理对拼接，截断序列丢弃，游离的后续字节跳过）。
- **`clearLocalUserData()` 连导出文件一起清**：401 被动登出与主动退出登录都调用 `exportStore.clearAll()`，删除 `px_exports/` 下的 xlsx 与 `px_exports_index` 索引——导出的文件是他人成绩明文，不能留在共用设备上。
- **`npm test` 追加分析自检**：`test` 链尾加 `node utils/analysis.js`，教师端归一化与 `utils/response.js`、`scripts/cache-selfcheck.js` 一样在 CI 里跑自带自测块。CI 工作流无需改动：`scripts/validate-project.mjs` 本就校验 `app.json` 注册页与 `usingComponents`，新增五个教师页面直接纳入覆盖。
- **订阅开关说清为什么失败**：`utils/subscribe.js` 原先把四类失败压成三个 `reason` 且丢尽细节——HTTP 状态与后端 `message` 被扔掉，微信的 `errno` / `errMsg` 也被扔掉，结果「后端没部署（404）」「服务端没配环境变量（503）」「网络不通」「用户自己点了取消」在界面上长得一模一样，只能靠猜。现结果统一为 `{ ok, accepted, reason, status, errno, detail }`；`pages/profile` 按状态码分文案（403/401 → 登录已过期，404/503 → 服务尚未就绪，`status === 0` → 网络异常，其余 → 绑定失败），并按弹窗返回值区分「已取消开启」与「请先在右上角设置中允许订阅消息」（`setting=ban`）、「当前暂不支持该提醒」（`setting=filter`）。面向学生不出现任何状态码或英文 `errMsg`，技术细节统一 `console.warn('[subscribe] …')`，真机 vConsole 直接可定位。
- **成绩天梯不再切开同分并列**：天梯仍默认只展示前十，但第 10 条若与后面的人同名次，该并列组一并列出（Project-X 三条天梯接口统一按 `takeLadder` 截断）。前端按后端返回条数整表渲染、不自行截断，多于 10 条时副标题改为「前十 · 同分并列全显（共 N 人）」。后端未升级时仍是硬切 10 条。
- **领奖台不再挑「三个代表」**：并列第 1 多于 3 人时，领奖台三个位置装不下整组第 1 名，摆哪三个都是任意取舍；此时改为整行「第 1 名 N 人」，全部第 1 名由下方完整榜单逐条列出。第 1 名不超过 3 人（含恰好 3 人）时领奖台照常摆放。
- **保存天梯卡同守领奖台规则**：`growth/poster.js` 的天梯卡此前固定 `slice(0, 3)`，并列第 1 超过 3 人时导出的图片仍会凭空画出「前三」，把同分的人切成上卡/不上卡两半。现由页面把 `tiedFirst` 传给海报，多于 3 人时整条横幅只写「第 1 名 N 人」，不再画三张卡。
- **学科对比并入趋势页，页面改名「分析」**：`pages/trends` 一屏给出「成绩走势」（总分 / 班均 / 年段均折线）与「学科对比」（雷达 + 明细表 + 差距柱 + 最需加强学科 + 一键转发）。TabBar、导航栏标题与页内标题同步由「趋势 / 成绩趋势」改为「分析」。两段数据各自请求 `/scores/me/trends` 与 `/scores/me/subject-comparison`、各自持有错误态与空态，任一接口异常只显示本段提示，不清空另一段；`load()` 等两个请求都回来才收 loading，避免先回来的那个提前结束下拉刷新。
- **导出页的选项改成真按钮**：`pages/t-export` 的「导出范围」「表格列」原先是一排 `.chip` 视图，而这页根本没定义过 `.chip` 基础样式（详见 Fixed），于是三种导出范围、三档列预设和「可添加」的列名在屏幕上就是几行没有边框的灰字，教师看不出哪里能点。现三处全部改为 `<button class="opt">`：墨色实描边 + 72rpx 定高 + 按压缩放 + 选中蓝底白字，左侧一枚小方块是选中记号（不只靠颜色表意），「可添加」用蓝色虚线描边与预设区分。列序的 ↑↓× 与模板的「载入 / 存 / 删」同样换成 `<button>`，首末行越界的方向键由 `disabled` 真禁用（原先只置灰却照样能点，靠 `moveColumn` 兜住才没出错）。每个 `<button>` 都复位了微信自带的 `::after` 边框与圆角，否则描边外面还套一圈双线。
- **「列模板」卡默认折叠**：一屏里最不常用的区块（多数教师直接用预设导出）此前常驻占掉一整卡。现卡头做成可点的 `.fold-head`，右侧摘要在折叠态也说清里面有什么（`已存 2/4 槽 · 用槽位3`，一个都没有时写 `未存模板` 而不是 `已存 0/4`）；模板读取失败的提示写在折叠体之外，收着也看得见。槽位数据仍按首屏取回，列表与摘要由 `applyTemplates()` 一处落数据，不会出现「摘要说已存 2 槽、展开只有一格」。

### Fixed
- **导出页的胶囊选项其实没有样式**：`pages/t-export/t-export.wxss` 的开头注释写着「复用 app.wxss 的 card / chip / badge / btn / meta 原语」，但 `app.wxss` 里从来没有 `.chip`——它是 `scores` / `t-analysis` / `t-exams` / `t-classes` / `t-question` 各写一份的页面级样式。导出页只写了 `.chip.add` 与 `.chips-wrap .chip` 两条派生规则，`border` / `padding` / `background` 一条都没落到元素上，因此「导出范围」「表格列」的选项在真机上就是一排无边框、无内距的裸文本，教师看不出可点（注释已按事实改写，选项改为 `.opt` 真按钮，见 Changed）。同一个毛病还有一处：页脚「返回分析 ›」「成绩榜 ›」沿用了 `t-analysis` / `t-ranking` 的 `.ta-link` 类名，本页同样没定义，两条链接看起来和普通文字无异——现已在本页补上。顺手把这类「只抄类名不抄样式」变成机器守：`tests/export.test.js` 新增一条，把 `t-export.wxml` 用到的类名（含三元里的 `'on'` / `'off'` / `'show'` 字面量）逐个对 `t-export.wxss` + `app.wxss` 验定义，唯一豁免是设计上只继承 `.eyebrow` 的 `.cn`，多一个未定义的类名就红。
- **中文标题被当成拉丁字母排版**（字体排列类 bug 的集中修复，`app.wxss` + 五个页面）：
  - 眉题整行套 `font-mono` + `text-transform: uppercase` + `letter-spacing: .18em` 时，汉字会被逐字撑开并按字形回退，是页面上最刺眼的一处错位。现 `.eyebrow` 本体改为无衬线 + 0.02em，等宽 / 大写 / 0.18em 只留在 `.eyebrow .en`（仅放拉丁串）上，中文部分用 `.cn` 标记并继承容器样式。
  - `.title`（-2rpx）、`.section-title`（-1rpx）、`.row-name`（-0.5rpx）、`.h-title`（-1rpx）的负字距只适合拉丁，压在中文上互相咬字，一律归零；负字距只保留在纯数字的大字号读数（`.hero-score` / `.hero-num`）上。
  - `.badge` 固定 36rpx 高配全局 1.65 行高，汉字下沿被盒子切掉（22×1.65≈36.3 > 36），补 `line-height: 1`。
  - `word-break: break-all`（`.row-name`、`.kname`）会把「2026.9.22」这类日期与知识点名从中间硬切，改 `overflow-wrap: break-word` 只在整词放不下时才断。
  - `.meta` 整行等宽让「均分 3.2 · 正确率 85%」这类中英数混排逐字回退，改无衬线 + `font-variant-numeric: tabular-nums`；`.meta--faint` 用 `--gray` + 透明度而不是 `--line`，避免灰到看不清。
  - 窄列折行：`pages/t-classes` 的题号列 92rpx 里塞「Q12·主观」必然折成两行，题号列收到 76rpx 并要求 `white-space: nowrap`（题型文案挪到右侧细字行）；`pages/t-ranking` 的「共 N 题 · xx%」列 110rpx → 130rpx 且 `.s-sub` 不换行、`.c-score` 相应收到 190rpx，`.bar-top` 由块级改为两端对齐的 flex 以容纳新增的导出入口。
  - 输入框占位色原先在四个页面各写一遍 `#B0B0B8`，与主题的 `--gray` 不一致，统一改 `var(--gray)`。
  - 进度条填充元素原先全局规则写成 `.prog > i`，而 `<i>` 不是 WXML 的合法标签、仓库里也没有任何页面用得上，是一条永远不会命中的死规则。现把原语定为 `.prog-fill`（仍在 `app.wxss`，供各页共用），导出页只保留本页的间距样式。
- **参照表参数被 env 默认值裁小**：`sideTableN` / `gapCols` 在 `env.LIMITS` 里只是「首次进入页面的初始值」，而 `buildExportBody` 早先按 `limits()` 夹紧，教师选「前 20 名」实际只导出前 10 名。现新增 `clampSetting()`，输入框与请求体的上界只认 `LIMIT_CEILING`（N 到 200、间隙列到 10），非法值/空值回落 env 默认；真正当上限用的 `classesPerExport` / `fileMb` / `keepFiles` / `previewRows` / `exportTimeoutMs` 仍走 `limits()`。
- **间隙列输入此前形同冻结**：`gapCols` 的改动没有进入请求体，页面上改了、导出的文件没改，现已接通并加了断言。
- **参照表开关的「开着但 N=0」**：关掉再打开时 `sideN` 会留在 0，开关显示为启用而导出的文件里没有参照表。现重新启用时若 `sideN <= 0` 回落 `limits().sideTableN`。
- **班级名单到手后预览不更新**：从成绩榜带班进入时名单晚于预览到达，页面停留在「全部班级」的预览上。现名单落地后按当前口径重取预览，并用 `_previewSeq` 丢弃过期响应，避免快速切班时旧数据盖新数据。
- **「我的」页眉标不再把教师写成学生**：`pages/profile/profile.wxml` 的眉标原先写死 `STUDENT · 学生档案`，而 `onShow` 只用角色决定「教师工作台」「成绩天梯管理」两个入口，角色从不参与文案——于是教师与管理员进来仍看到「学生档案」，与同页头像下方后端给的「教师」显示名自相矛盾。现文字由 `utils/role.js` 的 `profileEyebrow()` 给出：学生 `STUDENT · 学生档案`、教师 `TEACHER · 老师档案`、管理员 `ADMIN · 管理员档案`（沿用各页 `CODE · 中文` 写法，管理员与 `pages/admin-ladder` 的 `ADMIN · 管理设置` 一致）。判据仍走 `roleNameOf`（`role_name` 优先，只有 `role_id` 的旧响应同样判定），管理员复用前端唯一判据 `isAdminUser`，因此旧会话只剩历史线索时眉标与入口一起亮、不会一处一处错位；后端新增角色或认不出角色时按学生文案回落（本页默认受众是学生），不留空也不报错。文字交给模板时按本页「排版回归」的规矩由 `profileEyebrowParts()` 切成 `.en` / `.cn` 两段（等宽 + 大写只落在拉丁上），拆开再拼回等于整行文案，页面自己不拼字符串。`tests/teacher.test.js` 锁判据与拆分契约，`tests/pages.test.js` 锁 `profile.onShow` 的实际输出与模板绑定。
- **`permissions` 的「读不到」与「一个都没有」不再混为一谈**：`utils/auth.js` 的 `setPermissions` 原先在后端没返回 `permissions` 时也往 `px_perms` 写 `[]`（记住我登录），而 `utils/role.js` 又把 `[]` 和 `null` 一并当成「旧会话、放行入口」——于是**被撤掉 `grade:read` 的教师入口永远亮着**，点进去只看到后端 403 文案。现 `setPermissions` 只持久化数组、非数组直接不写键（读回 `null`），角色门按「`null` 放行、`[]` 隐藏」处理；`px_perms` 尚未发布过任何版本，不存在需要迁移的旧键值。
- **管理员判据统一到 `utils/role.js`**：`pages/admin-ladder` 自带一套宽松 `isAdmin()`（认 `isAdmin` / `role` / `role_code` / 显示名含「管理员」），而本次 `pages/profile` 改走严格的 `currentRole(u) === 'admin'`，两处一对不上就出现「管理入口看不见、天梯页面却照样能进」。现两处共用 `role.isAdminUser()`：有权威字段（`role_name` / `role_id`）时只认权威字段，完全读不到才退回历史线索——既堵住「教师显示名叫『管理员』也算管理员」的旧漏洞，又不会把升级前建立会话的管理员关在门外。
- **教师工作台的小题列表键不再用题号**：`pages/t-analysis` 的 `wx:key="questionNumber"` 与作者自己在 `t-classes.js` / `t-analysis.js` 写下的口径矛盾（同一题号的客观 / 主观两行题号相同），撞键会让列表复用出错并在控制台告警。现小题行在归一化时发一个贯穿排序的 `uid`，`wx:key` 改用 `uid`，与知识点 / 逐人得分 / 榜单三处保持一致。
- **「功能筹备中」分支此前永远走不到**：`pages/profile` 判断 `r.reason === 'noTemplate'`，但 `utils/subscribe.js` 从不返回该值——模板常量为空时照样去调弹窗，最后弹一句「授权未开启」，与页面上「开关仅管理本机授权」的禁用态自相矛盾。现 `requestSubscribe()` 在 `TEMPLATE_ID` 为空时直接返回 `noTemplate`，页面据此关掉 `subReady`。
- **合并后折线不再被学科重绘掐断**：并入一页时三张图先共用了 `_cancelAll()`，而两段数据各自异步回来各自重绘——`drawSubjects()` 会顺手取消折线仍在跑的动画，折线常停在半路（同一画布上还可能新旧两轮交错闪绘）。现改为每张图只取消自己那一轮（`_cancel`），页面隐藏/卸载时才全停。
- **画布零尺寸守卫补到共用入口**：这道判断原先只在趋势页取折线画布的路上，雷达与柱状（原 `pages/subjects`）没有，宽高为 0 时仍把 `canvas.width` 置 0 再按 dpr 缩放，画出来是退化图形。现守卫上移到 `_queryCanvas`，三张图一并受益。
- **重试时不再叠加骨架屏**：`loading` 为真即渲染骨架，已加载好的那段内容仍在下方，页面变成「骨架 + 旧数据」两层（原页面只有一段，不易看出；合并成两段后重试必现）。现只在两段都还没有数据时显示骨架。
- 删除分析页遗留的失效指引「学科雷达对比、学期进步/退步已移至「我的成绩」页的分析入口」——雷达已回到本页、学期对比整页删除、成绩页的分析入口卡也一并撤掉，按这句去找会一无所获。
- 天梯榜单中「我」那一行的高亮此前从未生效：后端天梯条目不带任何本人标记，前端 `isMe` 恒为 `false`，`.lb-row.me` 样式无对象可套。现由后端按 token 身份下发 `isCurrentUser`，前端原有映射本就兼容该字段，底色直接生效。
- 单场天梯的「我的排名」卡此前从不出现：后端把天梯名次读成 `score-table` 并不产出的 `rank` 字段，`rows[].rank` 与 `myRank` / `myScore` 一起被序列化丢弃，而天梯条目又不带本人标记；随 Project-X 改用年排 `gradeRank` 修复，前端逻辑不变。
- 成绩页、成绩卡与详情页统一显示年级排名；天梯同分学生显示相同名次。
- 统一成绩页按钮、统计卡与分析入口的对齐和字号。

### Security
- **导出文件只在本机、不接入分享**：出口只有 `wx.openDocument({ fileType: 'xlsx', showMenu: true })`，未接 `wx.shareFileMessage`，教师端页面也不新增 `onShareAppMessage` / `onShareTimeline`；页面文案直接写明「里面有其他同学的成绩：退出登录会一并删除本机文件」。本机保留份数与单文件体积都有闸门，避免把设备存储写爆。
- **`examId` / `classId` / 模板槽位逐个校验**：非法考试编号与越界槽位在本地先拒绝（不发请求），路径段一律 `encodeURIComponent`；导出接口后端的四道门禁（`requireExamAccess` + `can_view_scores` + `can_view_students` + `grade:read`）仍是权威边界，403 文案原样显示、不改写。
- **教师权限位随登录态一起清理**：登录响应的顶层 `permissions` 是工作台入口的判据，本次为它新增独立缓存键 `px_perms`（`utils/auth.js` 的 `setPermissions` / `getPermissions` / `clearPermissions`）。`setPermissions` 只接受数组：后端没给 `permissions` 时**不写键**，读回 `null`，与后端给的 `[]`（零权限）区分开——两者若混用，被撤权限的教师入口仍会亮着。退出登录与 401 被动登出都会清除该键，`utils/request.js` 的 `clearLocalUserData()` 键清单同步纳入 `px_perms`——共用设备上换到学生账号时，读不到上一个教师账号残留在本地的权限位，入口判据与 token 一样只在当前会话内有效。

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
