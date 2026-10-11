# Project-X Mini · 极速查分

> 面向学生的「一站式极速查分」微信小程序前端，并对教师 / 管理员开放**只读成绩分析工作台**。复用已部署的 Project-X 全栈后端，本工程**只做前端，不修改后端**。

[![Platform](https://img.shields.io/badge/platform-微信小程序-brightgreen)](https://mp.weixin.qq.com/)
[![Language](https://img.shields.io/badge/language-JavaScript-yellow)](https://developer.mozilla.org/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-red)]()

## 功能特性

- **极速体验**：静默登录 + 本地缓存，首屏即成绩，秒开无等待
- **查分主线**：成绩总览、逐题小分、原卷图、班级均分对比
- **学生端分析**（复刻主站）：分析页一屏给出趋势折线 + 学科雷达 / 明细表 / 差距柱 / 薄弱学科
- **教师工作台（只读分析）**：教师与管理员专属，学生既看不到入口也进不了页面。考试列表 → 单场分析（概况 / 小题得分率 / 分布与指标 / 知识点四个页签，班级可筛选）→ 小题逐人得分钻取、成绩榜、班际对比。全部为 GET 只读，改分 / 发布 / 阅卷提交不在小程序侧提供
- **成绩天梯**：Top3 领奖台（并列第 1 多于 3 人时不挑代表，改为一行「第 1 名 N 人」）+ 前十榜单 + 本人高亮 + 我的排名（合规：仅公布部分排名/前十名，同分并列跨截断线时该组一并公布）
- **订阅消息提醒**：授权收集 + 持久化开关（推送需后端补逻辑）
- **AI 深度分析**：兼容纯文本与结构化两种后端响应
- **一键转发**：成绩报告（detail）与学科对比（分析页）一键生成海报图片，可分享微信好友·朋友圈或保存到相册，含小程序来源水印
- **获客扩展（分层架构）**：公开落地页（landing）+ 分享菜单全页覆盖 + 成绩/天梯卡离屏绘制存相册（天梯卡与页面同规则：并列第 1 超 3 人时只写「第 1 名 N 人」，不硬凑前三）+ 邀请归因（inviter/schoolCode 编解码、登录后深链）+ 订阅引导 + 数据埋点；业务层 `services/` 与增长横切层 `growth/` 解耦
- **editorial-brutalist 纸感蓝主题** + 克制动效（进场 / 数字滚动 / canvas 生长 / 骨架屏）

## 最近更新（2026-10-09）

> 本节汇总近期前端改动的用户可见部分，完整技术记录见 [CHANGELOG](./CHANGELOG.md)。

- **教师工作台（只读分析）上线**：教师与管理员登录后落在工作台首屏（学生仍落在成绩页），「我的」页对教师/管理员多出「教师工作台」入口，学生看不到该入口。
  - `t-exams` 考试列表：本人可见的考试（数据范围完全由后端决定，前端不自行放大），按考试日期倒序 + 学科筛选 + 关键词搜索，顶部汇总考试数 / 已公布数 / 已判分数。
  - `t-analysis` 单场分析：四个页签——概况（均分 / 标准差 / 及格率 / 优秀率 / 五数概括 / 与上次考试对比）、小题得分率（得分率、难度 P、区分度 D、错误率档，可排序、题号为数字时可下钻）、分布与指标（分数段直方图 + 信度指标）、知识点薄弱。页签各自持有加载与错误态，任一接口失败不影响其余页签；班级筛选对全部页签生效。
  - `t-question` 小题逐人得分、`t-ranking` 成绩榜（整榜一次取回，分页与搜索都在本地）、`t-classes` 班际对比（各班统计量 + 同题得分率极差 Top10）。
- **教师端不进 TabBar**：TabBar 仍是「成绩 / 分析 / 我的」三项，工作台由登录分流与「我的」页入口进入，教师端页面自带回「我的」按钮，因此学生端可见界面与查分流程保持不变。

## 最近更新（2026-08-19）

> 本节汇总近期前端改动的用户可见部分，完整技术记录见 [CHANGELOG](./CHANGELOG.md)。

- **获客扩展（4 期）**：新增公开落地页（承载学校+邀请人参数，引导登录）；全页可分享到好友/朋友圈；成绩卡/天梯卡一键保存相册；邀请归因与登录后深链；订阅引导与数据埋点；业务层 `services/` 与增长层 `growth/` 完成分层解耦。

## 最近更新（2026-08-18）

> 本节汇总近期前端改动的用户可见部分，完整技术记录见 [CHANGELOG](./CHANGELOG.md)。

- **一键转发**：成绩报告与学科对比页新增「一键转发」按钮，自动将页面内容（含成绩数据、雷达图 / 差距柱状图、排版）绘制为高清海报，可分享到微信好友·朋友圈或保存到相册，并带「数据来自 X-exam 小程序」来源水印。长内容自动完整截取，不截断。

## 最近更新（2026-08-09）

> 本节汇总近期前端改动的用户可见部分，完整技术记录见 [CHANGELOG](./CHANGELOG.md)。

- **「我的」页 UI 优化**：增大眉题/标题/信息卡/区块标题间距（呼吸感）；退出登录按钮由撑满整宽改为水平居中。

## 截图

> 待补充。建议放：`login` 登录页 / `scores` 成绩首屏 / `trends` 分析（趋势 + 学科对比） / `leaderboard` 天梯 四张。

## 技术栈与约束

| 项 | 说明 |
|----|------|
| 框架 | 微信原生小程序（WXML / WXSS / JS），非 uni-app / Taro |
| 语言 | 纯 JavaScript，CommonJS 模块化（`require` / `module.exports`） |
| 为什么不用 TS | 原生小程序默认不编译 `.ts`，会报「未找到 xxx.js」；本项目统一用 `.js` |
| 图表 | 原生 `<canvas type="2d">` 手绘折线 / 雷达 / 柱状（不依赖 echarts，规避 CDN 超时） |
| 样式 | editorial-brutalist 纸感蓝主题；设计令牌集中在 `app.wxss` 的 `page` CSS 变量 |
| 鉴权 | `Authorization: Bearer <token>`，token 存于 `wx.StorageSync`；登录响应的角色权限位另存 `px_perms`，退出登录与 401 被动登出时一并清除 |
| 代码注入 | `app.json` 开「按需注入」（`lazyCodeLoading: "requiredComponents"`，基础库 ≥2.11.1）；`pages/detail`、`pages/trends` 的海报组件再叠「用时注入」（`componentPlaceholder: { "poster": "view" }`，≥2.11.2），未点「一键转发」就不注入 `components/poster` 与 `utils/poster.js`。低于对应版本兼容但无优化效果 |
| 合法域名 | 开发期可勾「不校验合法域名」；正式发布需在小程序后台配置 |

## 目录结构

```
projectX-mini/
├── app.js / app.json / app.wxss     # 全局逻辑、页面与 tabBar 注册、brutalist 令牌 + 动效原语
├── project.config.json              # 工程配置（含 AppID，可提交）
├── project.private.config.json      # 本地私有配置（已被 .gitignore 忽略，不提交）
├── sitemap.json
├── README.md / LICENSE / .gitignore # 仓库说明与元数据
│
├── components/
│   ├── poster/                      # 一键转发弹层：离屏绘制海报，用时注入（占位组件 view）
│   └── score-card/                  # 成绩卡片组件：直角白卡 + 品牌蓝分数 + 学科标签
│
├── pages/
│   ├── login/                       # 账号密码登录：记住我 + 静默登录
│   ├── scores/                      # 成绩首屏：总览卡 + 最新大卡 + 列表 + 搜索 + 学科筛选 + 天梯入口
│   ├── detail/                      # 成绩详情：逐题小分 + 班级均分 + 原卷图 + 本场 AI 分析
│   ├── trends/                      # 分析页：折线（总分 / 班均 / 年段均）+ 学科雷达 + 明细表 + 差距柱 + 薄弱学科
│   ├── leaderboard/                 # 成绩天梯：领奖台（第 1 名超 3 人时只报规模）+ 前十榜单 + 我的排名
│   ├── profile/                     # 我的：个人信息 + 整体 AI 报告 + 订阅开关 + 教师工作台入口 + 退出
│   ├── t-exams/                     # 教师工作台首屏：可见考试列表（学科筛选 + 搜索 + 汇总）
│   ├── t-analysis/                  # 单场分析四页签：概况 / 小题得分率 / 分布与指标 / 知识点（班级筛选）
│   ├── t-question/                  # 小题逐人得分（按得分排序，可从分析页小题下钻进入）
│   ├── t-ranking/                   # 成绩榜（整榜一次取回，本地分页 + 本地搜索 + 班级筛选）
│   └── t-classes/                   # 班际对比：各班统计量 + 同题得分率极差 Top10
│
├── services/                        # 业务层：页面只调 service，不直接 require request
│   ├── scoresService.js             # 成绩 / 学科对比 / 趋势 / 单场详情 + 缓存
│   ├── leaderboardService.js        # 天梯
│   ├── examPaperService.js          # 原卷页与作答图块下载
│   ├── ladderSettingsService.js     # 天梯开关读写（仅管理员）
│   ├── growthService.js             # 增长编排：邀请归因 / 分享 / 订阅引导 / 埋点
│   └── teacherService.js            # 教师工作台：只含 GET，无改分 / 发布 / 阅卷提交
│
└── utils/
    ├── env.js                       # API_BASE / API_PREFIX 常量
    ├── request.js                   # wx.request 封装：自动带 Bearer，401 跳登录
    ├── response.js                  # 后端响应归一化（字段别名 + 数值容错）
    ├── analysis.js                  # 教师端分析数据归一化（后端 snake/camel 别名 + 数值容错 + 自检块）
    ├── role.js                      # 角色与能力判定（工作台准入、登录落地页、页面前守卫）
    ├── auth.js                      # 登录态管理（token / user / permissions 存取、login / logout / isLoggedIn）
    ├── cache.js                     # 成绩本地缓存（秒开）
    ├── ai.js                        # AI 响应归一化（兼容纯文本 / 结构化对象）
    ├── subscribe.js                 # 订阅消息授权封装（TEMPLATE_ID + 带 status/errno/detail 的失败结果）
    └── animate.js                   # 数字滚动补间工具（缓出，含 cancel 清理）
```

`app.json` 页面注册（15 个页面，启动页为 `login`）：

```json
"pages": [
  "pages/login/login",
  "pages/landing/landing",
  "pages/change-password/change-password",
  "pages/scores/scores",
  "pages/detail/detail",
  "pages/exam-paper/exam-paper",
  "pages/trends/trends",
  "pages/profile/profile",
  "pages/admin-ladder/admin-ladder",
  "pages/leaderboard/leaderboard",
  "pages/t-exams/t-exams",
  "pages/t-analysis/t-analysis",
  "pages/t-question/t-question",
  "pages/t-ranking/t-ranking",
  "pages/t-classes/t-classes"
]
```

TabBar 三项：`成绩`（scores）/ `分析`（trends）/ `我的`（profile），选中色 `#2E44FF`（亮蓝）。

## 快速开始

1. **克隆仓库**

   ```bash
   git clone <your-repo-url> projectX-mini
   ```

2. **用微信开发者工具导入**：选择工程目录 `projectX-mini`（注意目录名大写 `X`、无连字符）。

3. **AppID**：工程内已填正式 `wx898f2f45a283582f`；也可用测试号，按需切换 `project.config.json`。

4. **编译**（`Ctrl+B`）。若报合法域名相关错误，二选一：

   - 开发期：右上角「详情」→「本地设置」→ 勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**；
   - 正式发布前：小程序后台 → 开发管理 → 开发设置 → 服务器域名，将 `dl5zx.cn` 加入
     **request 合法域名** 与 **downloadFile 合法域名**（原卷图走 downloadFile）。

5. 全部 `.js` 已通过 `node --check` 语法校验；改动后若编译报错，先确认未引入 `.ts`。

## 测试

零依赖（Node 内置 `node:test` + `assert`），无需安装依赖：

- `npm test` 先跑 `scripts/validate-project.mjs`（语法 / JSON / 页面注册一致性校验），再运行 `tests/` 单测，最后复用既有自检（`scripts/cache-selfcheck.js`、`utils/response.js`、`utils/analysis.js` 自检块）。
- `tests/teacher.test.js` 覆盖教师工作台：角色门（教师 / 管理员可达，学生与未知角色一律拒绝）、五个页面的 `onLoad` 守卫（学生被拦下时不发任何请求）、以及数值口径归一化——非法 `examId` / 题号不请求、满分不可知时及格率显示「—」而不是 `0%`、`null` 名次不当成前三名、班际极差要求至少两个班有数据、知识点沿用后端排序而前端不重排。

## 启动与登录流程

- 启动页为 `login`；本地已存 token 时自动 `reLaunch` 到登录落地页（静默登录），无需重复输入账号密码。
- 登录成功 / 静默登录均经 `utils/role.homePath()` 分流：教师与管理员进 `pages/t-exams/t-exams`（工作台首屏），学生进 `pages/scores/scores`（成绩页）。
- 邀请深链（`examId` → 单场成绩页）只对学生生效；教师与管理员即便带着深链也一律落到工作台。教师工作台五个页面在 `onLoad` 里各自调用 `role.guardWorkspace()`，不合格角色直接送回成绩页，请求根本不发。
- 任意接口返回 `401` → `utils/request.js` 自动清除 token 并 `reLaunch` 回登录页（强制重新鉴权）。
- 「记住我」：登录时 `isPersistent=true`，后端下发约 180 天有效期 token。

### 登录凭据规则（由后端逻辑决定，前端透传）

`POST /api/auth/login` 的 `identifier` 同时匹配 **用户名 / 学号**：

| 账号来源 | 账号 | 密码 |
|----------|------|------|
| 网页端 CSV 批量导入 | `P` + 学号（如 `P20260101`） | `P` + 学号 |
| 演示种子脚本 | 学号本身（如 `20260101`） | 学号本身 |
| 未显式设密码 | 学号本身 | 学号本身 |

> 注意：生产库 `dl5zx.cn` 当前**未**导入演示账号，需用真实导入学生的 `P`+学号登录。

## 后端接口契约（前端依赖清单）

> 路径均含统一前缀 `/api`。所有需鉴权接口自动带 `Authorization: Bearer <token>`。

| 方法 | 路径 | 说明 | 调用位置 |
|------|------|------|----------|
| POST | `/api/auth/login` | `{identifier,password,isPersistent}` → `{token,user,permissions,passwordChangeRequired}` | `utils/auth.js` |
| GET | `/api/scores/me` | 本人全部成绩（含 `exam_id/exam_name/subject/total_score/graded_at`） | `pages/scores` |
| GET | `/api/scores/me/exams/:examId` | 单场详情：逐题小分 + 班级均分 + 原卷图块 | `pages/detail` |
| GET | `/api/scores/me/trends` | 趋势数据（总分 + 班均 + 年段均） | `pages/trends`（分析页 · 成绩走势） |
| GET | `/api/scores/me/subject-comparison` | 学科对比（我的均分 / 班级均分 / 差距 / 趋势 / 薄弱学科） | `pages/trends`（分析页 · 学科对比） |
| POST | `/api/scores/me/ai-analysis` | 整体 AI 分析，请求体 `{}` | `pages/profile` |
| POST | `/api/scores/me/exams/:examId/ai-analysis` | 单场 AI 分析，请求体 `{}` | `pages/detail` |
| GET | `/api/ladder/exams/:examId` | 年级天梯前十 + 我的排名（同分并列跨截断线时该组一并返回，可能多于 10 条；关闭时返回 403） | `pages/leaderboard`（scores 最新考试 / detail） |
| GET | `/api/ladder/config` | 仅管理员：`{enabled}`，读取天梯开关 | `pages/admin-ladder` |
| PUT | `/api/ladder/config` | 仅管理员：请求 `{enabled}`，更新天梯开关 | `pages/admin-ladder` |
| GET | `/api/exams?selection=1` | 教师 / 管理员可见的考试列表；`selection=1` 才带出 `grade_name / graded_count / avg_score / score_published` | `pages/t-exams` |
| GET | `/api/analysis/exams/:examId/classes` | 本场考试的班级名单（班级筛选器的数据源） | `pages/t-analysis` `t-ranking` |
| GET | `/api/analysis/exams/:examId/overview` | 概况：均分 / 标准差 / 及格率 / 优秀率 / 五数概括 / 满分，并带分数段分布 `distribution` 与错误率分桶 `errorRateBuckets` | `pages/t-analysis`（概况、分布与指标） |
| GET | `/api/analysis/exams/:examId/previous` | 与上一场同类考试对比 | `pages/t-analysis`（概况） |
| GET | `/api/analysis/exams/:examId/questions` | 小题得分率 + 难度 P + 区分度 D + 错误人数与错误率档 | `pages/t-analysis`（小题得分率） |
| GET | `/api/analysis/exams/:examId/question-students` | 某一小题的逐人得分（下钻） | `pages/t-question` |
| GET | `/api/analysis/exams/:examId/metrics` | 整卷难度 / 区分度 / 信度（样本不足时信度为 `null`） | `pages/t-analysis`（分布与指标） |
| GET | `/api/analysis/exams/:examId/students` | 整场成绩榜（无服务端分页与排序参数，一次返回） | `pages/t-ranking` |
| GET | `/api/analysis/exams/:examId/class-comparison?all=1` | 班际对比：各班统计量 + 逐题各班得分率 | `pages/t-classes` |
| GET | `/api/analysis/knowledge-points/:examId` | 知识点薄弱（路径为 `/analysis/knowledge-points/:examId`，不是 `/analysis/exams/:id/...`；后端已按薄弱程度排序） | `pages/t-analysis`（知识点） |

> 除 `classes` 外，上述班级可选参数统一走 `?classId=`；`services/teacherService.js` 只包含 GET，改分、公布、阅卷提交等写操作在小程序侧一律不提供。

> 管理入口与教师工作台的判据是登录响应 `user.role_name`（缺失时回落到 `role_id`：1=admin / 2=teacher / 3=student），后端**从不**返回 `user.isAdmin` / `user.is_admin` / `user.role`；角色与权限位统一由 `utils/role.js` 判定，实际权限仍必须由后端接口鉴权。

### 教师工作台的角色门禁

「学生既不能看也不能用」这一条由**两层**共同保证，权威在后端：

| 层 | 位置 | 判据 | 失败表现 |
|----|------|------|----------|
| 后端（真实边界） | `/api/exams` 走 examGate（`exam:read`），`/api/analysis/*` 走 analysisGate（`grade:read`），逐接口再叠 `requireExamAccess` + `can_view_charts` / `can_view_students` | 角色默认权限集：admin `['*']`、teacher 含 `grade:read`、**student 仅 `score:read`**；考试数据范围由 `getVisibleExamIds` 决定（admin 全量，教师按任教学段，其余为空） | 学生 token 请求这些接口一律 `403`，前端原样显示后端 `message` |
| 前端（入口与页面） | `utils/role.js` + `role.guardWorkspace()` | `role_name / role_id` 判角色（后端从不返回 `user.role` / `isAdmin`；管理员判定统一走 `role.isAdminUser()`，旧会话才退回历史线索），教师还需实际持有 `grade:read`；未知角色默认拒绝 | 学生看不到「教师工作台」入口，直接输 URL 也会被 `reLaunch` 回成绩页，请求不发 |

- 权限位来自登录响应的顶层 `permissions`，与 `user` 分开存于 `px_perms`；退出登录、401 被动登出都会清除，避免上一个账号的角色残留在设备上。`setPermissions` 只在拿到数组时写键，所以「后端没给 `permissions`」读回 `null`，与「后端给了 `[]`（零权限）」是两种状态。
- 入口判据按上面两种状态分开处理：读不到权限位（`null`，含本次改动之前建立的旧会话）时**放行**工作台入口，真实鉴权仍由后端执行，接口 403 会在页签上显示后端文案，避免把老用户挡在门外又给不出原因；后端明确给了空数组时**隐藏**入口，不留一个点了只会报 403 的死入口。
- 管理员判据是 `role.isAdminUser()`，`pages/profile` 的「教师工作台 / 管理」两张卡片与 `pages/admin-ladder` 的准入守卫共用同一个函数：有 `role_name` / `role_id` 时只认这两个权威字段，完全读不到（旧会话）才退回 `isAdmin` / `role` / 显示名含「管理员」这些历史线索。
- 管理员与教师走同一条判定，因此功能天然同步到管理员端；`teacher_role`（`subject_teacher` / `head_teacher` / `grade_leader`）仅用于文案展示，不参与门禁。

### AI 响应兼容（`utils/ai.js` 的 `normalizeReport`）

后端可能返回两种形态，前端统一归一化后再渲染：

- **纯文本**：字符串，直接作为分析正文展示；
- **结构化对象**（含下划线别名兼容）：
  - `overallJudgement` / `overall`：总体评价
  - `weakPoints`：薄弱点列表
  - `nextActions`：下一步建议
  - `teachingSuggestions`：教学/学习建议
  - `caveats`：说明事项

### 学科 / 天梯响应兼容

- **学科对比**：响应兼容「对象 `{subjects:[...]}`」与「纯数组」两种形态；每条取 `avgScore / avgClassAvg / gapToClass / examCount / trend`，雷达图需 ≥3 学科。分析页内与「成绩走势」各自独立请求、各自持有错误态，学科对比接口异常只在本段显示错误与「点击重试」，不影响折线。
- **天梯**：列表容器 `leaderboard/board/rankings/list/topTen`；单条 `studentName/name`、`totalScore/score`、`rank/ranking`；同分学生使用相同竞赛排名，且后端截断线不切开同分并列——榜单可能多于 10 条，前端按返回条数全量渲染、副标题改为「前十 · 同分并列全显（共 N 人）」；本人由单条 `isCurrentUser` 标记（后端按 token 身份下发，客户端不自判），`myRank`/`myScore` 为全量年排；领奖台只在并列第 1 ≤3 人时摆位，多于 3 人时按 `tiedFirst` 改显示「第 1 名 N 人」，全部第 1 名仍由下方榜单逐条列出，「保存天梯卡」把同一个 `tiedFirst` 传给 `growth/poster.js`、走一样的分支；关闭时接口返回 403。

## 设计语言（editorial-brutalist）

集中在 `app.wxss` 的 `page` CSS 变量。**视觉语言：米白纸面、1px 直角细线卡、黑硬偏移阴影（仅重点卡）、超大黑标题、等宽体眉题、深色反白块。**

**配色纪律：亮蓝 `#2E44FF` 为唯一品牌强调色（标识/主按钮/选中态/当前数据系列）；绯红 `#C00F28` 仅用于错误/危险/异常语义；荧光绿 `#C8FF33` 每页 ≤1 处点缀。**

| 令牌 | 值 | 用途 |
|------|----|------|
| `--paper` `#F1EFE9` / `--paper-2` `#E9E6DE` | 纸面 / 纸面-2 | 页面底色、灰卡 |
| `--ink` `#1A1917` / `--ink-soft` `#4A4842` / `--gray` `#8B887E` | 墨 / 墨柔 / 灰 | 文字三阶 |
| `--line` `#D8D5CB` | 细线 | 卡片/输入/表格 1px 边 |
| `--blue` `#2E44FF` / `--blue-deep` `#1F30C8` | 品牌蓝 / 深蓝 | 主色、选中、主按钮、当前系列 |
| `--blue-soft` `rgba(46,68,255,.09)` / `--blue-bd` `rgba(46,68,255,.35)` | 蓝软底 / 蓝边 | 标签、胶囊选中、我的行 |
| `--lime` `#C8FF33` | 荧光绿 | 最需加强学科徽标（每页 ≤1 处） |
| `--err` `#C00F28` | 绯红 | 仅登录失败、落后柱、退步标签、退出按钮 |
| `--dark` `#141413` | 深色 | 登录 hero 反白块 |
| `--shadow-hard` `8rpx 8rpx 0 var(--ink)` | 黑硬偏移阴影 | 仅 3 处重点卡：登录卡 / 成绩 hero / 天梯第一名 |

**字号阶梯**：`52`（页面主标题）/ `40`（区块标题）/ `32`（数据强调/按钮）/ `30`（重要数据）/ `28`（正文）/ `24`（次要）/ `22`（标签图例）；数据巨字（hero 72、score-card 64、logo/avatar 48）保留原大并加 `tabular-nums` 等宽数字。

**动效（克制优先）**：缓出 `cubic-bezier(.22,1,.36,1)`、时长 ≤0.45s、无弹跳；进场 `riseIn` 淡入上滑 + 列表 stagger；数字滚动 `utils/animate.js`；canvas 生长（折线/雷达/柱）；骨架屏；五页下拉刷新。

## 待办与后端依赖（非代码阻塞项）

1. **订阅消息正式生效**：小程序端与后端（Project-X v2.6.0）代码均已完成，剩下的全在部署侧 —— 小程序后台选用「考试成绩通知」模板并核对 `utils/subscribe.js` 的 `TEMPLATE_ID`，服务端配置三项环境变量、把 IP 加进白名单、按体验版→线上版灰度。逐步命令见后端仓库 `readus/WECHAT-GRADE-RELEASE-开发者上线清单.md`。**提审前务必先把该版本部署上线**，否则审核员打开「我的 → 成绩发布提醒」会看到失败提示。
2. **天梯管理员开关**：后端对 `GET/PUT /api/ladder/config` 执行管理员鉴权；开关关闭时学生端天梯接口返回 403，前端显示「天梯功能暂未开启」。
3. **原卷图域名**：`downloadFile` 合法域名需含 `dl5zx.cn`。
4. **指纹/面容解锁（Soter）**：留待后续版本。
5. **教师工作台验收**：本机没有开发者工具，需在有工具的设备上用真实教师 / 管理员账号过一遍五个页面，并在主站后台临时关闭某教师的「图表」「学生名单」查看权限，确认对应页签显示后端 403 文案而不是空白或 0%。

## 微信小程序平台限制（本项目相关）

本项目为微信原生小程序，上线与运行受平台约束。以下为与本项目直接相关的要点（细节以微信官方文档为准）：

**包体积**
- 主包 / 单个分包 ≤ 2MB；全量（主包 + 所有分包）≤ 20MB（官方分包页标注部分场景可达 30MB，实际以微信后台上传提示为准）。
- 大图片、字体、视频等静态资源应外置 CDN，并通过对应合法域名加载；本项目用系统字体、原卷图走 `downloadFile` 域名，无本地大资源。

**网络请求**
- 仅支持 HTTPS，且请求域名须在小程序后台配置合法域名白名单（request / uploadFile / downloadFile / socket 各自独立）；不支持 HTTP、IP 直连、未备案域名。
- 开发期可勾「不校验合法域名」绕过；本项目 `dl5zx.cn` 已加入 request 与 downloadFile 白名单。
- 并发：`wx.request` 最多 10 个并发；WebSocket 并发连接数有上限（约 5 个）。
- 超时：默认 60s；小程序切到后台约 5s 后仍未完成的请求会被中断，需在 `onHide` 持久化进行中状态。
- 自建服务器（非小程序云开发）须完成 ICP 备案，否则无法过审上线。

**存储与渲染**
- 本地存储：单个 key ≤ 1MB，总容量 ≤ 10MB；大文件改走云端或文件系统 API。
- `setData`：单次数据量建议 ≤ 256KB（瞬时 ≤ 1MB），频率建议每秒 ≤ 20 次，须合并 / 节流。
- 后台存活：切后台约 5s 后挂起，重要状态在 `onHide` 持久化。
- 内存：iOS 约 1GB，Android 因机型差异较大；大图与长列表需及时释放，避免 OOM。

**原生组件与分包**
- `<canvas type="2d">` 为原生组件，层级最高、`z-index` 无效；需在其上覆盖元素时必须用 `cover-view` / `cover-image`。本项目图表为底部绘制，无覆盖需求。
- 2d canvas 需在页面 `onReady` 后通过 `SelectorQuery` 获取节点，并用 `requestAnimationFrame` 驱动动画；旧 canvas 接口已废弃。
- 分包规则：tabBar 页面必须放主包；主包不可引用分包资源，分包可引用主包；分包间不可互跳，须经主包中转。
- 安全沙箱禁止 `eval` / `new Function` 等动态执行代码。

## 已知限制与降级策略

### 教师工作台（只读）

- **未做开发者工具与真机验证**：本机没有微信开发者工具，五个教师页面只跑过零依赖单测与仓库自检（JS 语法、JSON、`app.json` 页面注册、事件处理函数与类名/CSS 变量齐全）。分数段直方图的 canvas 实机渲染、`<picker>` 班级筛选的手势、骨架屏与动效在真机低端机上的表现都**尚未核对**，合并后需在有开发者工具的机器上过一遍。
- **不含任何写操作**：改分、批量发布、阅卷提交、原卷图片、答题卡设计一律不提供，这些仍是主站能力。教师端页面也不接入 `onShareAppMessage` / `onShareTimeline` 与海报转发——页面里是他人成绩明细，不该变成可转发的分享卡片。
- **放在主包而不是分包**：教师端新增代码合计约 94KB（`pages/t-*` 五个目录 73KB + `utils/analysis.js` `utils/role.js` `services/teacherService.js` 20KB），`pages/` 整体约 182KB，相对主包 2MB 上限没有压力；分包要额外处理跨包跳转与主包依赖，收益不明显，故沿用主包 + `lazyCodeLoading: "requiredComponents"`（教师页面未访问时不参与启动注入）。
- **数据范围与查看权限由后端裁决**：教师只看自己任教学段的考试；管理员把某场考试的「图表 / 学生名单」查看权限关掉时，接口返回 403，对应页签原样显示后端 `message`，其余页签不受影响。
- **满分不可知时不编造百分比**：后端在满分缺失时把及格率 / 优秀率置 `0` 作占位，前端据 `fullScore` 是否有效改显示「—」；同理 `null` 名次显示「—」而不会被当成前三名，`null` 得分率不参与平均也不画柱。
- **非数字题号不给下钻**：`question-students` 接口对题号做 `Number()` 校验，`12(1)` 这类题号会被判 400，因此这类小题只显示不提供入口。


- 原卷图、AI 分析、天梯、学科对比任一项接口异常时均**静默降级或提示**，不阻塞查分主线。
- 雷达图需 ≥3 个学科，学科数不足时自动降级为纯表格并提示。
- 图表使用原生 canvas，复杂交互（如双指缩放）暂不支持。
- 海报组件开了用时注入：首帧它是占位 `view`，`selectComponent('#poster')` 取不到实例方法。页面须先 `wx:if` 挂载、收到组件 `ready` 后再 `open(model)`（`pages/detail`、`pages/trends` 均按此实现），新增页面复用海报时照抄这段时序。
- 订阅开关的失败文案按原因分类（`utils/subscribe.js` 返回 `reason` + `status` / `errno` / `detail`），但**面向学生只显示中文结论，不含 HTTP 状态码与 `errMsg` 原文**；技术细节走 `console.warn('[subscribe] …')`，真机 vConsole 与开发者工具可直接定位是后端未部署（404）、未配环境变量（503）还是用户自己取消。

## 许可证

**保留所有权利（All Rights Reserved）。** 本仓库代码**仅供查看**，未授予任何使用、复制、修改、分发或商业利用的许可。详见 [LICENSE](./LICENSE)。

如需在自己的项目中使用本代码，请先联系作者获取书面授权。

## 免责声明

本仓库为**前端源码**，依赖的 Project-X 后端 `https://dl5zx.cn` 由后端维护方独立部署与运营，其数据、接口与可用性不在本仓库范围内。本前端仅做展示与教学用途，不对后端数据的准确性或可用性作任何担保。
