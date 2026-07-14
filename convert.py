#!/usr/bin/env python3
"""
将 fumin-helper.user.js 转换为 fumin-helper.js（远程加载版本）
用法：python3 convert.py
"""

import re
import os

def convert():
    # 读取原始文件
    input_file = 'fumin-helper.user.js'
    output_file = 'fumin-helper.js'
    
    if not os.path.exists(input_file):
        print(f"错误：找不到 {input_file}")
        return
    
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 移除 UserScript 头部
    pattern = r'// ==UserScript==.*?==/UserScript==\s*\n'
    content = re.sub(pattern, '', content, flags=re.DOTALL)
    
    # 移除 (function() { 和最后的 })();
    content = content.replace("(function() {\n    'use strict';\n\n", "", 1)
    content = content.rstrip()
    if content.endswith('})();'):
        content = content[:-5]
    
    # 替换 GM API 为从 window 获取
    content = content.replace(
        "var _GM_setValue = (typeof _GM_setValue !== 'undefined') ? _GM_setValue : function(key, value) {",
        "var _GM_setValue = window.__GM_setValue || function(key, value) {"
    )
    content = content.replace(
        "var _GM_getValue = (typeof _GM_getValue !== 'undefined') ? _GM_getValue : function(key, defaultValue) {",
        "var _GM_getValue = window.__GM_getValue || function(key, defaultValue) {"
    )
    content = content.replace(
        "var _GM_xmlhttpRequest = (typeof _GM_xmlhttpRequest !== 'undefined') ? _GM_xmlhttpRequest : function(details) {",
        "var _GM_xmlhttpRequest = window.__GM_xmlhttpRequest || function(details) {"
    )
    
    # 移除每行开头的 4 个空格
    lines = content.split('\n')
    fixed_lines = []
    for line in lines:
        if line.startswith('    '):
            fixed_lines.append(line[4:])
        else:
            fixed_lines.append(line)
    content = '\n'.join(fixed_lines)
    
    # 写入新文件
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(content)
    
    print(f"转换完成！")
    print(f"输入：{input_file}")
    print(f"输出：{output_file}")
    print(f"文件大小：{len(content)} 字符")

if __name__ == '__main__':
    convert()
