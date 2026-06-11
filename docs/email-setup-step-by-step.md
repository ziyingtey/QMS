# QGo 验证邮件：一步一步（Step by step）

按顺序做即可。默认是 **真发邮件**（`DryRun: false`）。  
客户注册后收到的是 **6 位验证码（OTP）**，在 App 里输入即可验证邮箱；**不再依赖**邮件里的点击链接（旧链接接口仍保留兼容）。

---

## 第一步：Google 打开「应用专用密码」

1. 浏览器打开：<https://myaccount.google.com/security>  
2. 确认已开启 **两步验证**（没有的话先按页面提示打开）。  
3. 搜索或进入 **应用专用密码**（App passwords）。  
4. 选「邮件」或「其他」，名称随便填（例如 `QGo API`）→ **生成**。  
5. 复制 **16 位密码**（形如 `abcd efgh ijkl mnop`，中间可能有空格）。  
   - 发 SMTP 时用的是 **这一段**，**不是**你平时登录 Gmail 的密码。

---

## 第二步：在本机保存 SMTP 密码（不要写进 Git）

在终端执行（把引号里换成你刚复制的 **应用专用密码**）：

```bash
cd src/QMS.Api
dotnet user-secrets set "Smtp:Password" "abcdefghijklmnop"
```

- 项目里已配置 `UserSecretsId`，这条命令会把密码存在 **本机用户目录**，**不会**进 `git status`。  
- `appsettings.Development.json` 里 **`User` / `FromEmail`** 已与发件 Gmail 一致；**`Password` 留空**，运行时会被 User Secrets 覆盖。

若你换电脑，在新电脑上 **再执行一次** `dotnet user-secrets set ...`（Secrets 不随 Git 同步）。

---

## 第三步：确认开发环境配置（一般不用改）

打开 `src/QMS.Api/appsettings.Development.json`，确认类似：

- `"DryRun": false`（要真发信）  
- `"Host": "smtp.gmail.com"`  
- `"User"` / `"FromEmail"`：你的发件 Gmail（与 Google 里开应用密码的账号一致）

手机上的 Expo 请用 **`EXPO_PUBLIC_API_URL=http://你电脑的局域网IP:5154`**，这样 App 才能连上本机 API 调用 **`/api/auth/verify-otp`** 提交验证码。

---

## 第四步：重启 API

1. 在跑 `dotnet run` 的终端按 **Ctrl+C** 停掉。  
2. 再执行：

```bash
cd src/QMS.Api
dotnet run
```

确认终端里没有一启动就报错。

---

## 第五步：在 App 里再注册一次

1. 打开 QGo → **Register**。  
2. 填 **要收验证信的那个邮箱**（可以和发件 Gmail 不同，例如你自己的另一个邮箱）。  
3. 点 **Create account**。  
4. 若成功，会进入「检查邮箱 / 输入验证码」界面（真发信时 **没有** 黄色 dry-run 提示）。

若出现 **HTTP 400**：看弹窗/终端说明（缺密码、格式错误等）。  
若出现 **HTTP 502**：多半是应用专用密码错、或 Gmail 拦截，对照终端错误改。

---

## 第六步：去 Gmail 里找邮件并输入验证码

1. 打开你 **注册时填的收件邮箱** 的 Gmail。  
2. 看 **收件箱**，没有则看 **垃圾邮件**。  
3. 主题类似 **Verify your QGo account**，邮件正文里有 **6 位数字**。  
4. 回到 QGo，在验证码输入框里 **输入这 6 位数字** → 点 **Verify code**。  
5. 验证成功后，用 **同一邮箱 + 密码** → **Sign in** 登录。

---

## 可选：暂时不想发真邮件（演示用）

编辑 `appsettings.Development.json`：

```json
"DryRun": true
```

重启 API。此时 **不会** 往任何邮箱发信；**6 位验证码**会出现在 **运行 API 的终端日志**里（搜 `SMTP DryRun` 或邮件主题相关日志），在 App 里输入即可。

要恢复真发信，改回 `"DryRun": false` 并保证 **User Secrets 里已有 `Smtp:Password`**。

---

## 对照表

| 你想… | 做法 |
|--------|------|
| 真收到 Gmail | `DryRun: false` + User Secrets 里的应用专用密码 + 重启 API |
| 不配邮箱、只过流程 | `DryRun: true` + 从终端日志看 6 位码，在 App 里 Verify |

更细的说明见：[real-email-verification-smtp.md](real-email-verification-smtp.md)。
