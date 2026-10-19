# 行程共享保存

网页：https://estella2012.github.io/travel-plan/

保存接口：`POST https://travel-plan-state.estella2012-travel.workers.dev/state`

每项安排的“编辑”按钮可修改时间、标题、说明、路线和标签。“完成”结束编辑；右下角“保存”将文字与折叠、提醒隐藏状态一起写入 `estella2012/travel-plan` 的 `main/state.json`。其他人刷新后读取这些内容。

文字保存在 `edits` 对象中，以 HTML 的 `data-edit-id` 对应字段。日期和提醒状态仍以各自 ID 保存。请求是完整状态；最后成功写入的版本生效。GitHub 写入冲突返回 409，不自动重试。

Worker 的 `GITHUB_TOKEN` 绑定需要该仓库的 Contents 读写权限。令牌不进入网页。接口允许所有访客保存，没有登录或访问口令。

本地验证：`node --test worker.test.mjs`。
