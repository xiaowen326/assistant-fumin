# 富民系统小助手 - 开发计划

## 概述

基于易鑫系统小助手的架构，为富民催收系统（fmcs.fbank.com）开发一个 Tampermonkey 油猴脚本悬浮工具面板。首期实现**短信数据查询**功能，二期实现**批量查询还款**功能。后续功能（批量实时扣款、发送系统短信、批量添加催记、查询车辆信息）按用户提供的接口陆续迭代。

## 技术方案

| 维度 | 选择 | 理由 |
|------|------|------|
| 技术形态 | Tampermonkey 油猴脚本 | 注入到富民系统页面，与易鑫小助手一致 |
| 语言 | 原生 JavaScript（ES6+） | 油猴脚本标准，无构建依赖 |
| UI 风格 | 深色悬浮面板 + 绿色辉光 | 沿用易鑫小助手的设计，用户已熟悉 |
| Token 获取 | 从页面 Cookie 或 localStorage 读取 | 富民系统 Token 在 Header 中传递，需从登录态获取 |
| 并发策略 | Promise.all 并发查询 | 与易鑫一致，提升批量查询效率 |
| 部署方式 | GitHub Pages 远程加载 | 支持动态更新，无需重新安装脚本 |

## 功能模块

### 已实现：短信数据查询

**流程**：
1. 调用 `POST /cs2/user/edge/case/pagingCase` 获取案件列表
2. 从返回的 `result.content[]` 提取每条记录的 `id`（caseId）、`userId`
3. 对每个案件并发调用 `POST /cs2/user/contact/queryContactList`（参数：`{ caseId, assetId: 209, userId }`）
4. 整合输出：案件信息 + 联系人列表（姓名、关系、手机号、车牌号、逾期天数等）

### 新增：批量查询还款

**流程**：
1. 调用 `POST /cs2/user/edge/case/queryLoanByCase` 获取借据编号（参数：`{ caseId, finished: "NOT_FINISH" }`），返回 `listingNumber`
2. 使用 `listingNumber` 作为 `iousId`，调用 `POST /cs2/user/query/order/repayment`（参数：`{ assetId: 209, iousId }`）查询还款信息
3. 整合输出：案件信息 + 还款详情

**接口详情**：

| 接口 | 方法 | 关键 Header | 参数 | 关键返回字段 |
|------|------|------------|------|-------------|
| `/cs2/user/edge/case/queryLoanByCase` | POST | `token`, `appid: "3"` | `{ caseId, finished: "NOT_FINISH" }` | `listingNumber`（借据编号） |
| `/cs2/user/query/order/repayment` | POST | `token`, `appid: "3"` | `{ assetId: 209, iousId }` | 还款详情（待确认返回字段） |

**输出格式**：表格展示，支持筛选、复制

### 待实现（按钮已预留）

- 批量实时扣款
- 发送系统短信
- 批量添加催记
- 查询车辆信息

## 是否有原型设计

否

## 实施步骤

1. **添加批量查询还款 API 函数** — 在 `fumin-helper.user.js` 中添加 `queryLoanByCase` 和 `queryRepayment` 两个 API 函数，实现两步查询逻辑。涉及文件：`fumin-helper.user.js`

2. **添加批量查询还款功能函数** — 实现 `queryRepaymentData` 函数，包含案件列表获取、借据编号提取、还款信息并发查询、结果整合。涉及文件：`fumin-helper.user.js`

3. **启用批量查询还款按钮** — 在悬浮面板中移除"批量查询还款"按钮的 disabled 状态，绑定点击事件到 `queryRepaymentData` 函数。涉及文件：`fumin-helper.user.js`

4. **转换并部署到 GitHub Pages** — 运行 `convert.py` 转换远程代码版本，推送到 GitHub 仓库，自动更新到用户端。涉及文件：`fumin-helper.js`

5. **验证功能** — 在富民系统页面测试批量查询还款功能，确认接口调用和结果展示正常。
