# Project-X Mini · 极速查分

> 面向学生的「一站式极速查分」微信小程序前端。复用已部署的 Project-X 全栈后端，本工程**只做前端，不修改后端**。

[![Platform](https://img.shields.io/badge/platform-微信小程序-brightgreen)](https://mp.weixin.qq.com/)
[![Language](https://img.shields.io/badge/language-JavaScript-yellow)](https://developer.mozilla.org/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/license-All%20Rights%20Reserved-red)]()

## 功能特性

- **极速体验**：静默登录 + 本地缓存，首屏即成绩，秒开无等待
- **查分主线**：成绩总览、逐题小分、原卷图、班级均分对比
- **学生端分析**（复刻主站）：趋势折线 / 学科雷达 / 学期对比
- **成绩天梯**：Top3 领奖台 + 完整榜单 + 我的排名（合规无段位）
- **订阅消息提醒**：授权收集 + 持久化开关（推送需后端补逻辑）
- **AI 深度分析**：兼容纯文本与结构化两种后端响应
- **editorial-brutalist 纸感蓝主题** + 克制动效（进场 / 数字滚动 / canvas 生长 / 骨架屏）

## 截图

> 待补充。建议放：`login` 登录页 / `scores` 成绩首屏 / `trends` 趋势 / `subjects` 学科对比 / `leaderboard` 天梯 五张。

## 技术栈与约束

| 项 | 说明 |
|----|------|
| 框架 | 微信原生小程序（WXML / WXSS / JS），非 uni-app / Taro |
| 语言 | 纯 JavaScript，CommonJS 模块化（`require` / `module.exports`） |
| 为什么不用 TS | 原生小程序默认不编译 `.ts`，会报「未找到 xxx.js」；本项目统一用 `.js` |
| 图表 | 原生 `<canvas type="2d">` 手绘折线 / 雷达 / 柱状（不依赖 echarts，规避 CDN 超时） |
| 样式 | editorial-brutalist 纸感蓝主题；设计令牌集中在 `app.wxss` 的 `page` CSS 变量 |
| 鉴权 | `Authorization: Bearer <token>`，token 存于 `wx.StorageSync` |
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
│   └── score-card/                  # 成绩卡片组件：直角白卡 + 品牌蓝分数 + 学科标签
│
├── pages/
│   ├── login/                       # 账号密码登录：记住我 + 静默登录
│   ├── scores/                      # 成绩首屏：总览卡 + 最新大卡 + 列表 + 搜索 + 学科筛选 + 天梯/分析入口
│   ├── detail/                      # 成绩详情：逐题小分 + 班级均分 + 原卷图 + 本场 AI 分析
│   ├── trends/                      # 趋势页：原生 canvas 折线（总分 / 班均 / 年段均）
│   ├── subjects/                    # 学科对比：雷达（我的均分 vs 班级均分）+ 明细表 + 差距柱 + 薄弱学科
│   ├── semester/                    # 学期对比：本学期 vs 上学期 + 进步/退步标签 + 学科明细 delta
│   ├── leaderboard/                 # 成绩天梯：Top3 领奖台 + 完整榜单 + 我的排名（合规无段位）
│   └── profile/                     # 我的：个人信息 + 整体 AI 报告 + 订阅开关 + 退出
│
└── utils/
    ├── env.js                       # API_BASE / API_PREFIX 常量
    ├── request.js                   # wx.request 封装：自动带 Bearer，401 跳登录
    ├── auth.js                      # 登录态管理（token / user 存取、login / logout / isLoggedIn）
    ├── cache.js                     # 成绩本地缓存（秒开）
    ├── ai.js                        # AI 响应归一化（兼容纯文本 / 结构化对象）
    ├── subscribe.js                 # 订阅消息授权封装（含 TEMPLATE_ID 占位常量）
    └── animate.js                   # 数字滚动补间工具（缓出，含 cancel 清理）
```

`app.json` 页面注册（8 个页面，启动页为 `login`）：

```json
"pages": [
  "pages/login/login",
  "pages/scores/scores",
  "pages/detail/detail",
  "pages/trends/trends",
  "pages/profile/profile",
  "pages/leaderboard/leaderboard",
  "pages/subjects/subjects",
  "pages/semester/semester"
]
```

TabBar 三项：`成绩`（scores）/ `趋势`（trends）/ `我的`（profile），选中色 `#2E44FF`（亮蓝）。

## 快速开始

1. **克隆仓库**

   ```bash
   git clone <your-repo-url> projectX-mini
   ```

2. **用微信开发者工具导入**：选择工程目录 `projectX-mini`（注意目录名大写 `X`、无连字符）。

3. **AppID**：工程内已填正式 `wx7c255cb7fec43a9e`；也可用测试号，按需切换 `project.config.json`。

4. **编译**（`Ctrl+B`）。若报合法域名相关错误，二选一：

   - 开发期：右上角「详情」→「本地设置」→ 勾选 **不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书**；
   - 正式发布前：小程序后台 → 开发管理 → 开发设置 → 服务器域名，将 `dl5zx.cn` 加入
     **request 合法域名** 与 **downloadFile 合法域名**（原卷图走 downloadFile）。

5. 全部 `.js` 已通过 `node --check` 语法校验；改动后若编译报错，先确认未引入 `.ts`。

## 启动与登录流程

- 启动页为 `login`。`app.js` 的 `onLaunch` 会同步本地 `px_token`，存在则视为已登录。
- 登录成功后 `reLaunch` 到 `pages/scores/scores`（成绩页）。
- 任意接口返回 `401` → `utils/request.js` 自动清除 token 并 `reLaunch` 回登录页（强制重新鉴权）。
- 「记住我」：登录时 `isPersistent=true`，后端下发约 180 天有效期 token。

### 登录凭据规则（由后端逻辑决定，前端透传）

`POST /api/auth/login` 的 `identifier` 同时匹配 **用户名 / 学号 / 邮箱**：

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
| POST | `/api/auth/login` | `{identifier,password,isPersistent}` → `{token,user}` | `utils/auth.js` |
| GET | `/api/scores/me` | 本人全部成绩（含 `exam_id/exam_name/subject/total_score/graded_at`） | `pages/scores` |
| GET | `/api/scores/me/exams/:examId` | 单场详情，逐题小分 `questions[]` | `pages/detail` |
| GET | `/api/exams/:examId/student/:studentId/scores` | 班级均分、原卷图块 | `pages/detail`（loadExtras，裸 `wx.request`） |
| GET | `/api/scores/me/trends` | 趋势数据（总分 + 班均 + 年段均） | `pages/trends` |
| GET | `/api/scores/me/subject-comparison` | 学科对比（我的均分 / 班级均分 / 差距 / 趋势 / 薄弱学科） | `pages/subjects` |
| GET | `/api/scores/me/semester-comparison` | 学期对比（本学期 vs 上学期、进步/退步学科） | `pages/semester` |
| POST | `/api/scores/me/ai-analysis` | 整体 AI 分析，请求体 `{}` | `pages/profile` |
| POST | `/api/scores/me/exams/:examId/ai-analysis` | 单场 AI 分析，请求体 `{}` | `pages/detail` |
| GET | `/api/scores/me/leaderboard?examId=` | 年级天梯（接口存在、需鉴权） | `pages/leaderboard` |

### AI 响应兼容（`utils/ai.js` 的 `normalizeReport`）

后端可能返回两种形态，前端统一归一化后再渲染：

- **纯文本**：字符串，直接作为分析正文展示；
- **结构化对象**（含下划线别名兼容）：
  - `overallJudgement` / `overall`：总体评价
  - `weakPoints`：薄弱点列表
  - `nextActions`：下一步建议
  - `teachingSuggestions`：教学/学习建议
  - `caveats`：说明事项

### 学科 / 学期 / 天梯响应兼容

- **学科对比**：响应兼容「对象 `{subjects:[...]}`」与「纯数组」两种形态；每条取 `avgScore / avgClassAvg / gapToClass / examCount / trend`，雷达图需 ≥3 学科。
- **天梯**：列表容器 `leaderboard/board/rankings/list/topTen`；单条 `studentName/name`、`totalScore/score`、`rank/ranking`；本人 `currentUser/me/self`；开关 `enabled/leaderboardEnabled`。

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

**字号阶梯**：`52`（页面主标题）/ `40`（区块标题）/ `32`（数据强调/按钮）/ `30`（重要数据）/ `28`（正文）/ `24`（次要）/ `22`（标签图例）；数据巨字（hero 72、score-card 64、学期均分 56、logo/avatar 48）保留原大并加 `tabular-nums` 等宽数字。

**动效（克制优先）**：缓出 `cubic-bezier(.22,1,.36,1)`、时长 ≤0.45s、无弹跳；进场 `riseIn` 淡入上滑 + 列表 stagger；数字滚动 `utils/animate.js`；canvas 生长（折线/雷达/柱）；骨架屏；六页下拉刷新。

## 待办与后端依赖（非代码阻塞项）

1. **订阅消息正式生效**需两步：小程序后台申请「成绩发布通知」模板并填入 `utils/subscribe.js` 的 `TEMPLATE_ID`；后端补充成绩发布时 `subscribeMessage.send` 推送逻辑。
2. **天梯管理员开关**：前端已读 `enabled/leaderboardEnabled` 控制显隐，由后端按管理员配置返回。
3. **原卷图域名**：`downloadFile` 合法域名需含 `dl5zx.cn`。
4. **指纹/面容解锁（Soter）**：留待后续版本。

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

- 原卷图、AI 分析、天梯、学科/学期对比任一项接口异常时均**静默降级或提示**，不阻塞查分主线。
- 雷达图需 ≥3 个学科，学科数不足时自动降级为纯表格并提示。
- 图表使用原生 canvas，复杂交互（如双指缩放）暂不支持。

## 许可证

**保留所有权利（All Rights Reserved）。** 本仓库代码**仅供查看**，未授予任何使用、复制、修改、分发或商业利用的许可。详见 [LICENSE](./LICENSE)。

如需在自己的项目中使用本代码，请先联系作者获取书面授权。

## 免责声明

本仓库为**前端源码**，依赖的 Project-X 后端 `https://dl5zx.cn` 由后端维护方独立部署与运营，其数据、接口与可用性不在本仓库范围内。本前端仅做展示与教学用途，不对后端数据的准确性或可用性作任何担保。

---

Made by JOJO · 大连五中 IT
