<<<<<<< HEAD
# assistant-fumin
=======
# 富民系统小助手

富民催收系统悬浮工具面板，提供短信数据查询等功能。

## 快速开始

### 方式一：使用加载器（推荐）

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 Tampermonkey 图标 → "添加新脚本"
3. 复制 `fumin-loader.user.js` 的全部内容
4. 粘贴并保存（Ctrl+S）
5. 访问 https://fmcs.fbank.com 即可使用

### 方式二：直接安装

1. 安装 Tampermonkey 浏览器扩展
2. 点击 Tampermonkey 图标 → "添加新脚本"
3. 复制 `fumin-helper.user.js` 的全部内容
4. 粘贴并保存（Ctrl+S）
5. 访问 https://fmcs.fbank.com 即可使用

## 功能列表

### 已实现
- ✅ 短信数据查询（分页案件 + 联系人查询）

### 待实现
- ⏳ 批量实时扣款
- ⏳ 发送系统短信
-  查询还款状态
- ⏳ 批量添加催记
- ⏳ 查询车辆信息

## 项目结构

```
── fumin-loader.user.js      # 加载器脚本（安装到 Tampermonkey）
├── fumin-helper.user.js      # 完整脚本（可直接安装）
├── fumin-helper.js           # 远程代码（部署到 GitHub Pages）
├── index.html                # 安装说明页面
├── DEPLOY.md                 # 部署指南
└── README.md                 # 本文件
```

## 技术栈

- Tampermonkey 油猴脚本
- 深色主题 + 绿色辉光 UI
- GM API 兼容层（支持 Tampermonkey 和控制台直接运行）

## 开发

### 本地测试

```bash
# 启动静态服务器
python -m http.server 5000 --bind 0.0.0.0

# 访问安装说明页面
open http://localhost:5000
```

### 更新远程代码

1. 修改 `fumin-helper.user.js`
2. 运行转换脚本生成 `fumin-helper.js`
3. 推送到 GitHub 仓库
4. 用户刷新页面自动加载最新版本

## 许可证

MIT
>>>>>>> 2f59fef (feat: 添加加载器和 GitHub Pages 部署配置)
