# 旅行计划共享数据

网页：https://estella2012.github.io/travel-plan/

接口：`POST https://travel-plan-state.estella2012-travel.workers.dev/state`

`main/state.json` 是卡片记录的唯一数据源。`events` 数组保存卡片 ID、日期、时区和文字字段；日期/提醒 ID 保存展开、收起和提醒隐藏状态。网页从这些记录生成卡片，不再保留固定卡片或 edits 覆盖层。

编辑时间和文字后，点击右下角“保存”。编辑模式的“删除”会立即提交不含该记录的完整状态；保存成功后移除卡片。没有卡片回收站或删除标记。

每次保存完整覆盖共享数据；最后成功写入的版本生效。GitHub 写入冲突返回 409，不自动重试。Worker 的 GITHUB_TOKEN 绑定需要该仓库 Contents 读写权限；令牌不进入网页。所有访客均可编辑和保存。

本地验证：`node --test worker.test.mjs`。

## 卡片图片

`POST /images` 接收 `{content: "<WebP base64>"}`，将图片单独写入 `main/images/<UUID>.webp`，返回 `{url}`。卡片在 `fields` 中以 `kind: "image"` 和 `text: url` 保存链接，点击右下角“保存”后同步。

网页上传时将图片最长边缩至不超过 1600 像素，生成 WebP。卡片显示小缩略图；点击打开全屏对话框，右上角关闭。

发布这个版本时，先部署更新后的 Worker，再合并并发布网页；只合并 GitHub 文件不会更新 Cloudflare Worker。保持现有 GITHUB_TOKEN 绑定。
