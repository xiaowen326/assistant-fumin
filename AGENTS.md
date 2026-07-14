# AGENTS.md - 富民系统小助手

## 项目概述

富民系统小助手是一个 Tampermonkey 油猴脚本，注入到富民催收系统（fmcs.fbank.com）中，提供悬浮工具面板功能。首期实现短信数据查询功能，后续将陆续添加更多功能。

## 项目结构

```
/workspace/projects/
── .coze                    # 项目配置（native-static 模板）
── index.html               # 安装说明页面
── fumin-helper.user.js     # 油猴脚本主文件
├── styles/                  # 样式目录（备用）
└── .cozeproj/               # 原型设计文件
    └── prototype/web/
        ├── home.html        # 悬浮面板原型
        └── .canvas.json     # 画板配置
```

## 核心文件

| 文件 | 说明 |
|------|------|
| `fumin-helper.user.js` | 油猴脚本主文件，包含所有功能逻辑 |
| `index.html` | 安装说明页面，提供脚本下载和使用指南 |

## 功能模块

### 已实现
- **短信数据查询**：通过 pagingCase + queryContactList 两步查询，获取案件联系人信息

### 待实现（按钮已预留）
- 批量查询销售
- 发送系统短信
- 查询还款状态
- 批量添加催记
- 查询客户画像

## 技术栈

- **类型**：Tampermonkey 油猴脚本（单文件 JS）
- **注入域名**：`https://fmcs.fbank.com/*`
- **GM API**：GM_setValue、GM_getValue、GM_xmlhttpRequest
- **UI 风格**：深色主题 + 绿色辉光（#00E676）

## 关键配置

| 配置项 | 值 | 说明 |
|--------|-----|------|
| BASE_URL | `https://fmcs.fbank.com` | 富民系统域名 |
| ASSET_ID | `209` | 固定 assetId |
| Token 位置 | Header: `token` | 从 Cookie 或 GM 存储获取 |
| 额外 Header | `appid: "3"` | 富民系统必需 |

## API 接口

### 第一步：获取案件列表
```javascript
POST /cs2/user/edge/case/pagingCase
Body: { pageSize: 100, pageNum: 1 }
```

### 第二步：查询联系人
```javascript
POST /cs2/user/contact/queryContactList
Body: { caseId, assetId: 209, userId }
```

## 开发规范

1. **Token 管理**：优先从 GM 存储获取，其次从 Cookie 获取
2. **并发控制**：联系人查询采用分批并发（每批 10 个）
3. **错误处理**：每个请求独立 try-catch，单个失败不影响整体
4. **UI 组件**：复用易鑫系统助手的组件模式（进度条、结果表格、通知等）

## 构建与运行

```bash
# 开发预览（安装说明页面）
python -m http.server 5000 --bind 0.0.0.0

# 脚本安装
# 1. 下载 fumin-helper.user.js
# 2. 在 Tampermonkey 中创建新脚本并粘贴代码
# 3. 访问 fmcs.fbank.com 即可使用
```

## 后续扩展

添加新功能时：
1. 在 `fumin-helper.user.js` 中添加对应的 API 函数
2. 在悬浮面板的功能按钮区添加新按钮（移除 disabled 状态）
3. 绑定按钮点击事件到对应的功能函数
4. 更新 index.html 的功能列表
