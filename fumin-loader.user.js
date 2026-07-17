// ==UserScript==
// @name         富民系统小助手 - 加载器
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  富民催收系统悬浮工具面板 - 动态加载远程代码
// @author       Coze Coding
// @match        https://fmcs.fbank.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-idle
// @connect      *
// ==/UserScript==

(function() {
    'use strict';

    // 将 GM API 挂载到页面 window 上，供远程代码调用
    var pageWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    pageWindow.__GM_setValue = GM_setValue;
    pageWindow.__GM_getValue = GM_getValue;
    pageWindow.__GM_xmlhttpRequest = GM_xmlhttpRequest;

    // 远程代码地址（GitHub Pages）- 混淆版本
    // 临时禁用：将 REMOTE_URL 设为空即可停止加载远程代码
    var REMOTE_URL = ''; // 临时关闭，需要时改回 'https://xiaowen326.github.io/assistant-fumin/fumin-helper-obfuscated.js'

    // 加载远程代码
    GM_xmlhttpRequest({
        method: 'GET',
        url: REMOTE_URL + '?t=' + Date.now(),
        onload: function(response) {
            if (response.status === 200 && response.responseText) {
                try {
                    // 通过 script 标签注入到页面（GM API 通过 window.__GM_xx 桥接）
                    var script = document.createElement('script');
                    script.textContent = response.responseText;
                    (document.head || document.documentElement).appendChild(script);
                    script.remove();
                    console.log('[富民系统小助手] 远程代码加载成功');
                } catch(e) {
                    console.error('[富民系统小助手] 执行失败:', e);
                }
            } else {
                console.error('[富民系统小助手] 加载失败:', response.status);
            }
        },
        onerror: function(error) {
            console.error('[富民系统小助手] 加载出错:', error);
        }
    });
})();
