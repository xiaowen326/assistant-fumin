# 富民系统小助手 - GitHub Pages 部署指南

## 项目结构

```
assistant-fumin/
├── fumin-helper.js      # 富民系统小助手主代码（部署到 GitHub Pages）
└── README.md            # 部署说明
```

## 部署步骤

### 1. 创建 GitHub 仓库

1. 访问 https://github.com/new
2. 仓库名：`assistant-fumin`
3. 设为 Public（公开）
4. 创建仓库

### 2. 上传代码

**方式一：通过 Git 命令**

```bash
# 克隆仓库
git clone https://github.com/xiaowen326/assistant-fumin.git
cd assistant-fumin

# 复制主代码文件
cp /workspace/projects/fumin-helper.js ./fumin-helper.js

# 提交并推送
git add .
git commit -m "feat: 添加富民系统小助手主代码"
git push origin main
```

**方式二：通过 GitHub 网页**

1. 访问 https://github.com/xiaowen326/assistant-fumin
2. 点击 "Add file" → "Upload files"
3. 上传 `fumin-helper.js` 文件
4. 提交更改

### 3. 启用 GitHub Pages

1. 访问仓库 Settings → Pages
2. Source 选择 "Deploy from a branch"
3. Branch 选择 "main"，目录选择 "/ (root)"
4. 点击 Save

### 4. 获取访问地址

启用后，访问地址为：
```
https://xiaowen326.github.io/assistant-fumin/fumin-helper.js
```

### 5. 更新加载器中的 URL

如果仓库名或用户名不同，需要修改 `fumin-loader.user.js` 中的 `REMOTE_URL`：

```javascript
var REMOTE_URL = 'https://你的用户名.github.io/你的仓库名/fumin-helper.js';
```

## 使用方式

### 安装加载器

1. 安装 Tampermonkey 浏览器扩展
2. 点击 Tampermonkey 图标 → "添加新脚本"
3. 复制 `fumin-loader.user.js` 的全部内容
4. 粘贴并保存（Ctrl+S）
5. 访问 https://fmcs.fbank.com 即可使用

### 更新主代码

当需要更新功能时：

1. 修改 `fumin-helper.js` 文件
2. 推送到 GitHub 仓库
3. 用户刷新页面即可自动加载最新版本（带时间戳防缓存）

## 注意事项

1. **跨域问题**：GitHub Pages 默认支持 CORS，无需额外配置
2. **缓存问题**：加载器使用 `?t=Date.now()` 防止浏览器缓存
3. **GM API 桥接**：通过 `window.__GM_setValue` 等方式将 GM API 暴露给远程代码
4. **安全性**：确保 GitHub 仓库为 Public，否则无法访问

## 文件说明

| 文件 | 说明 | 用途 |
|------|------|------|
| `fumin-loader.user.js` | 加载器脚本 | 安装到 Tampermonkey，负责加载远程代码 |
| `fumin-helper.js` | 主代码文件 | 部署到 GitHub Pages，包含所有功能逻辑 |

## 后续更新

当富民系统小助手需要更新功能时：

1. 修改 `/workspace/projects/fumin-helper.js`
2. 复制到 `assistant-fumin` 仓库
3. 推送到 GitHub
4. 用户刷新页面即可
