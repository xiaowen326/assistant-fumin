#!/bin/bash
# 部署富民系统小助手到 GitHub Pages
# 用法：./deploy.sh

set -e

# 配置
REPO_NAME="assistant-fumin"
GITHUB_USER="xiaowen326"
REMOTE_REPO="https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

echo "=== 富民系统小助手 - GitHub Pages 部署脚本 ==="
echo ""

# 检查必要文件
if [ ! -f "fumin-helper.js" ]; then
    echo "错误：找不到 fumin-helper.js"
    echo "请先运行：python3 convert.py"
    exit 1
fi

# 检查 git 是否安装
if ! command -v git &> /dev/null; then
    echo "错误：未安装 git"
    exit 1
fi

# 创建临时目录
TEMP_DIR=$(mktemp -d)
echo "临时目录：${TEMP_DIR}"

# 克隆仓库（如果存在）
if [ -d "${TEMP_DIR}/${REPO_NAME}" ]; then
    rm -rf "${TEMP_DIR}/${REPO_NAME}"
fi

echo "克隆仓库..."
git clone "${REMOTE_REPO}" "${TEMP_DIR}/${REPO_NAME}" 2>/dev/null || {
    echo "仓库不存在，创建新仓库..."
    mkdir -p "${TEMP_DIR}/${REPO_NAME}"
    cd "${TEMP_DIR}/${REPO_NAME}"
    git init
    git remote add origin "${REMOTE_REPO}"
}

cd "${TEMP_DIR}/${REPO_NAME}"

# 复制文件
echo "复制文件..."
cp ../../fumin-helper.js ./fumin-helper.js
cp ../../README.md ./README.md 2>/dev/null || true

# 提交并推送
echo "提交更改..."
git add .
git commit -m "feat: 更新富民系统小助手 $(date '+%Y-%m-%d %H:%M:%S')" || {
    echo "没有更改需要提交"
    exit 0
}

echo "推送到 GitHub..."
git push origin main || git push origin master

echo ""
echo "=== 部署完成！ ==="
echo "访问地址：https://${GITHUB_USER}.github.io/${REPO_NAME}/fumin-helper.js"
echo ""
echo "清理临时文件..."
rm -rf "${TEMP_DIR}"
echo "完成！"
