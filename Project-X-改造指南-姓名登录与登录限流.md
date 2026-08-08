# Project-X 改造指南：姓名登录 + 登录限流修正

> 用途：本期不实现，仅留作日后落地的分步操作手册。
> 范围：仅涉及主工程 `D:/paper star GitHub storage/Project-X/`（后端 Node + Express）。
> 结论前置：这两项**根因都在后端**，微信小程序 `projectX-mini` 侧**无需改业务代码**（登录接口只是把 `identifier` 原样 `POST /api/auth/login`）。
> 关联问题：原用户反馈「无法用姓名登录」「重复登录时间限制锁死在前端」——前者为后端未支持姓名匹配，后者经核查**前端并无任何锁死/倒计时代码**，实际限制来自后端 `express-rate-limit`（15 分钟 / 10 次 / IP，超了返 429）。

---

## 项一：支持「姓名」登录

### 1.1 现状核对（已读源码坐实）
- 路由注释锁死了标识种类：`src/server/routes/auth.ts:39`
  ```
  identifier：用户名、学号或职工号
  ```
- 实际匹配逻辑：`src/server/services/AuthService.ts:101-112`
  ```ts
  let user = await this.userRepo.findByUsername(identifier);          // 第103行
  if (!user && /^\d+$/.test(identifier)) {
    user = await this.userRepo.findByStudentNumber(identifier);       // 第107行：纯数字才查学号
  }
  if (!user) {
    return { success: false, message: "用户名或密码错误" };           // 第110-112行
  }
  ```
- 仓储现有方法样式（`src/server/repositories/UserRepository.ts:41-47`）统一为
  `this.db.get(\`SELECT u.*, r.name as role_name, ... FROM users u JOIN roles r ON r.id=u.role_id WHERE u.<字段> = ? AND u.is_active = 1\`, <值>)`。
- 数据库：学生就是 `role_id = 3` 的 user；`users.name` 存真实姓名，**不保证唯一**（同名同姓存在）。

### 1.2 设计决策（落地前必须拍板）
| 决策点 | 推荐方案 | 理由 |
|--------|----------|------|
| 同名冲突怎么办 | 查到 >1 个活跃用户即拒绝，提示「存在多名同名用户，请使用学号或账号登录」 | 避免误登他人账号；密码校验前就拦截，安全 |
| 是否限定学生 | 不限定角色，任何活跃用户按姓名都可登 | 教师/管理员也可能想用姓名；保持简单 |
| 前端要改吗 | 不改（identifier 透传）；仅建议把登录框 placeholder 从「学号或用户名」改为「学号 / 用户名 / 姓名」 | 降低用户误用姓名的概率 |
| 模糊匹配？ | **不做** LIKE，只用精确 `=` | 登录是鉴权入口，模糊匹配会放大碰撞面 |

### 1.3 具体改动步骤

**步骤 A — 仓储新增 `findByName`（返回数组以检测重名）**
文件：`src/server/repositories/UserRepository.ts`（在 `findByStudentNumber` 后插入）
```ts
  async findByName(name: string): Promise<UserRecord[]> {
    return await this.db.all(
      `SELECT u.*, r.name as role_name, r.display_name as role_display_name
       FROM users u JOIN roles r ON r.id = u.role_id
       WHERE u.name = ? AND u.is_active = 1`,
      name
    );
  }
```

**步骤 B — 服务层在「学号也查不到」后补姓名分支**
文件：`src/server/services/AuthService.ts`，把第 105-112 行原结构改为：
```ts
    if (!user && /^\d+$/.test(identifier)) {
      // 纯数字，尝试学号
      user = await this.userRepo.findByStudentNumber(identifier);
    }

    // 新增：姓名登录（同名须唯一，否则拒绝，避免误登）
    if (!user) {
      const byName = await this.userRepo.findByName(identifier);
      if (byName.length > 1) {
        return { success: false, message: "存在多名同名用户，请使用学号或账号登录" };
      }
      user = byName[0] ?? null;
    }

    if (!user) {
      return { success: false, message: "用户名或密码错误" };
    }
```

**步骤 C — 更新路由注释与 JSDoc（避免后人误解）**
文件：`src/server/routes/auth.ts`
- 第 39 行注释改为：
  ```
  identifier：用户名、学号、职工号或姓名（姓名须唯一，重名请用学号/账号）
  ```
- 第 99-100 行 `AuthService.login` 的 JSDoc 注释 `支持用户名（学号/职工号）或邮箱登录` → 追加「或姓名（重名时请使用学号/账号）」。

**步骤 D —（可选）前端 placeholder 文案**
文件：`D:\X-exam storage\X-exam\pages\login\login.wxml` 的账号输入框 `placeholder`，由「学号或用户名」改为「学号 / 用户名 / 姓名」。纯文案，无逻辑改动。

### 1.4 验证
```bash
# 类型检查
npm run typecheck

# 功能自测（用已存在的学生姓名，且该姓名在库里唯一）
curl -s -X POST http://localhost:端口/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"identifier":"张三","password":"<该生密码>"}'
# 期望：返回 token + user

# 重名场景：构造两个同名活跃学生后调用，期望 message="存在多名同名用户，请使用学号或账号登录"

# 回归：原学号 / P+学号 / 用户名登录仍正常
```

### 1.5 风险与注意
- `users.name` 现有数据可能含前后空格或全半角，建议在 `findByName` 里 `identifier.trim()` 后再查，并在入库环节统一 trim（独立任务，不阻塞本次）。
- 若日后做「按班级去重」（同一班级内姓名唯一），可把 `findByName` 改为联 `class_students` 并按请求附带的 `classId` 过滤——但登录时无 classId，故本期不引入，靠「重名即拒绝」兜底即可。
- 不要在登录接口对姓名做大小写不敏感 LIKE，会扩大碰撞面并拖慢索引。

---

## 项二：登录限流从「全局 IP 桶」改为「账号 + IP 桶」

### 2.1 现状核对（已读源码坐实）
文件：`src/server/routes/auth.ts:10-17`
```ts
// P1-1 (H-S9): 登录接口速率限制 — 每个 IP 15 分钟内最多 10 次尝试，防止暴力破解
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "登录尝试过于频繁，请 15 分钟后重试" }
});
```
- 问题（已记录为 `PX-SEC-048`）：`keyGenerator` 缺省 = 按 `req.ip`，即**全 IP 共享一个桶**。
  - 后果 1：同 WiFi / 同 NAT 出口的多名师生共享 10 次额度，一人狂试会**误伤同 IP 所有人**（用户感知的「锁死」）。
  - 后果 2：攻击者可对受害者账号从自己 IP 狂试，把**受害者自己**的登录额度打满，实施 DoS（因为受害者与其同 IP 或全局桶被占）。
- 前端无任何锁死代码（已 grep 确认 `login.js` 无 `setTimeout`/冷却/锁定），用户看到的「锁死」就是这条后端 429 提示。

### 2.2 设计决策
| 决策点 | 推荐方案 | 理由 |
|--------|----------|------|
| 限流 key | `login:<identifier>:<ip>` | 每「账号×IP」独立桶，既防单账号爆破，又互不误伤 |
| 阈值 | 保持 10 次 / 15 分钟 | 不变，仅改 key 维度 |
| 前端倒计时 | 可选：解析 `Retry-After` 显示倒计时 | 纯 UX，不改服务端行为；解决「用户不知还要等多久」 |
| 是否按账号维度单独锁 | 否（key 已含 identifier，天然按账号隔离） | 避免引入账号级永久锁逻辑 |

### 2.3 具体改动步骤

**步骤 A — 改 `keyGenerator`（核心修复）**
文件：`src/server/routes/auth.ts`，把 `loginLimiter` 改为：
```ts
// P1-1 (H-S9): 登录接口速率限制 — 每个「账号 × IP」15 分钟内最多 10 次，防爆破且互不误伤
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,   // 会写入 Retry-After 响应头，供前端倒计时
  legacyHeaders: false,
  // 关键：把限流维度从「全局 IP」收紧为「账号 + IP」，避免同 IP 多人互相误伤（PX-SEC-048）
  keyGenerator: (req) => {
    const identifier = (req.body && req.body.identifier) || '';
    const ip = req.ip || 'unknown';
    return `login:${identifier}:${ip}`;
  },
  message: { message: "登录尝试过于频繁，请 15 分钟后再试" }
});
```
> 注意：`req.body` 在限流中间件执行时已可用，因为 `express.json()` 是全局前置中间件（在 `app.ts` 注册，早于路由挂载）。

**步骤 B —（可选 UX）小程序前端解析 429 倒计时**
文件：`D:\X-exam storage\X-exam\utils\request.js` 与 `pages/login/login.js`
- 在 `request.js` 的失败分支，若 `statusCode === 429`，把 `res.header['Retry-After']`（秒）一并带出（如挂到 rejection 对象的 `retryAfter` 字段）。
- 在 `login.js` 的 `.catch` 里：
  ```js
  .catch(function (err) {
    if (err && err.statusCode === 429) {
      const sec = Number(err.retryAfter) || 900;   // 兜底 15 分钟
      // 用 setData 显示「请 xx 秒后重试」倒计时，到 0 解锁登录按钮
    } else {
      self.setData({ error: (err && err.message) || '登录失败，请重试' });
    }
  })
  ```
> 这一步**不改变服务端限流行为**，仅把「还要等多久」告诉用户，体验更友好。可单独排期，不强求与项二 A 同步。

### 2.4 验证
```bash
# 类型检查
npm run typecheck

# 同账号同 IP 连点 11 次，第 11 次应 429，且响应头含 Retry-After
for i in $(seq 1 11); do curl -s -o /dev/null -w "%{http_code} " -X POST .../api/auth/login -H ... -d '{"identifier":"wrong","password":"x"}'; done
# 期望：前 10 次 401，第 11 次 429

# 不同账号同 IP 互不影响：账号 A 打满后，账号 B 仍能正常登录（证明不再共享全局桶）
```

### 2.5 风险与注意
- `express-rate-limit` 默认用内存存储（`MemoryStore`），多实例/集群部署时各节点桶独立、限流会被稀释。若日后上多副本，需改用共享存储（Redis `RateLimitRedisStore` 或 DB 表）。本期单机/单进程无需动。
- `req.ip` 在反向代理后可能取到代理 IP；确保 `app.set('trust proxy', 1)`（或对应层数）已配置，否则 key 里的 IP 失真、限流形同虚虚设。改动前先确认 `app.ts` 的 trust proxy 设置。
- 不要把 `keyGenerator` 写成仅按 `identifier`（去掉 IP）——那会被攻击者用不同 IP 绕过；必须「账号+IP」双因子。

---

## 收尾：回归命令（两项都改完后统一跑）
```bash
npm run typecheck      # 类型
npm run verify:auth    # 鉴权相关回归（仓库现有 54 项断言，若存在）
npm run build          # 构建
```
小程序侧：微信开发者工具 `Ctrl+B` 重新编译，验证「姓名唯一者可登、重名者被提示用学号、登录失败提示正常、可选倒计时生效」。

> 修订记录：本指南依据 2026-08-08 对 `auth.ts` / `AuthService.ts` / `UserRepository.ts` 的实读内容撰写，行号对应彼时主分支。
