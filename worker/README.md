# 行程状态保存函数

一个 Cloudflare Worker；无需数据库、npm 依赖或登录系统。任何访客都可以调用 `POST /state` 保存共享状态。

函数只更新 `estella2012/travel-plan` 的 `main` 分支、`state.json` 文件。仓库、分支、文件路径均固定在代码中，请求不能指定其他写入目标。接受的状态只有当前日期的 `open` / `closed`，以及两条提醒的 `open` / `closed` / `removed`。

## 在手机或浏览器部署

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)，选择 Workers Free 方案。
2. 打开 **Workers & Pages**，创建名为 `travel-plan-state` 的 Worker。
3. 打开代码编辑器，用本目录 `worker.mjs` 的完整内容替换示例代码，点击 **Deploy**。
4. 在 GitHub 创建细粒度 personal access token：Repository access 只选择 `estella2012/travel-plan`；Repository permissions 中将 **Contents** 设为 **Read and write**。设置适当的到期时间。
5. 回到 Worker 的 **Settings → Variables and Secrets → Add**：
   - Type：**Secret**
   - Variable name：`GITHUB_TOKEN`
   - Value：刚创建的 GitHub 令牌
6. 点击 **Deploy** 应用 Secret。令牌只填在 Cloudflare，不要提交到 GitHub，也不要发送到聊天。
7. 复制 Worker 的正式地址，例如 `https://travel-plan-state.<你的子域名>.workers.dev`，发回当前对话。接入网页的保存地址为该地址后加 `/state`。

目前线上网页仍使用原来的令牌弹窗；取得真实 Worker 地址后再替换保存代码，避免发布尚不可用的按钮。

## 如果使用命令行

在本目录执行：

```sh
npx wrangler login
npx wrangler deploy
npx wrangler secret put GITHUB_TOKEN
```

在最后一步的隐藏输入提示里输入令牌。不要把令牌直接写在命令参数或配置文件中。

## 接口

```http
POST /state
Content-Type: application/json

{"2026-10-22":"closed","notice-jiuzhai-stay":"removed"}
```

成功返回 `{"saved":true}`，其他访客刷新网页后读取共享状态。每次保存完整替换 `state.json`；先后保存时，以最后成功保存的状态为准。同时写入产生冲突时返回 409，不自动重试。

允许所有来源调用（CORS `*`），没有登录或访问口令，符合公开共同编辑的用途。GitHub 令牌不会返回到客户端。

## 本地验证

```sh
node --test worker.test.mjs
```

测试使用模拟 GitHub 响应，不访问或修改线上仓库。

## 官方参考

- [Cloudflare Secret 配置](https://developers.cloudflare.com/workers/configuration/secrets/)
- [Worker 部署](https://developers.cloudflare.com/workers/get-started/guide/)
- [GitHub 文件写入 API](https://docs.github.com/en/rest/repos/contents#create-or-update-file-contents)
