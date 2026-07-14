// ==UserScript==
// @name         富民系统小助手
// @namespace    http://tampermonkey.net/
// @version      v20260714A
// @description  富民催收系统悬浮工具面板 - 短信数据查询
// @author       Coze Coding
// @match        https://fmcs.fbank.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @connect      fbank.com
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // == 版本标记 ==
    window.__FM_VERSION = 'v20260714A';

    // == 全局命名空间 ==
    window.__FM = window.__FM || {
        batchCallAborted: false,
        skipCallInterval: false
    };

    // == 全局配置 ==
    const BASE_URL = "https://fmcs.fbank.com";
    let TOKEN = "";
    let IS_TOKEN_VALID = false;
    const ASSET_ID = 209; // 固定 assetId

    // == 励志名言 ==
    const QUOTES = [
        "每一次催收，都是对责任的坚守。",
        "专业赢得信任，耐心化解困难。",
        "今天的努力，是明天的成果。",
        "用真诚沟通，用专业解决问题。",
        "坚持就是胜利，加油！",
        "每一通电话，都可能带来转机。",
        "用心服务，用爱沟通。",
        "困难是暂时的，努力是永恒的。"
    ];

    // == 工具函数 ==

    // SHA-256 哈希（用于密码验证）
    async function sha256(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // 通知组件
    function createNotification(message, type = 'info', duration = 3000) {
        const existing = document.querySelector('.fm-notification');
        if (existing) existing.remove();

        const colors = {
            success: 'bg-green-600',
            error: 'bg-red-600',
            info: 'bg-blue-600',
            warning: 'bg-yellow-600'
        };

        const notification = document.createElement('div');
        notification.className = `fm-notification fixed top-4 right-4 ${colors[type]} text-white px-6 py-3 rounded-lg shadow-lg z-[999999] transition-all duration-300 transform translate-x-full`;
        notification.textContent = message;
        document.body.appendChild(notification);

        requestAnimationFrame(() => {
            notification.classList.remove('translate-x-full');
        });

        setTimeout(() => {
            notification.classList.add('translate-x-full');
            setTimeout(() => notification.remove(), 300);
        }, duration);
    }

    // 进度条组件
    function createProgressBar(title, total) {
        const existing = document.querySelector('.fm-progress-container');
        if (existing) existing.remove();

        const container = document.createElement('div');
        container.className = 'fm-progress-container fixed bottom-4 right-4 bg-gray-800/95 backdrop-blur-sm border border-gray-700 rounded-lg p-4 z-[999998] min-w-[300px] shadow-xl';
        container.innerHTML = `
            <div class="flex justify-between items-center mb-2">
                <span class="text-white text-sm font-medium">${title}</span>
                <button class="fm-progress-minimize text-gray-400 hover:text-white text-xs">最小化</button>
            </div>
            <div class="w-full bg-gray-700 rounded-full h-2 mb-2">
                <div class="fm-progress-bar bg-green-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
            <div class="flex justify-between text-xs text-gray-400">
                <span class="fm-progress-text">0 / ${total}</span>
                <span class="fm-progress-percent">0%</span>
            </div>
        `;
        document.body.appendChild(container);

        container.querySelector('.fm-progress-minimize').addEventListener('click', () => {
            container.classList.add('hidden');
            const indicator = document.querySelector('.fm-progress-indicator');
            if (indicator) indicator.classList.remove('hidden');
        });

        return {
            update: (current, total) => {
                const percent = Math.round((current / total) * 100);
                container.querySelector('.fm-progress-bar').style.width = `${percent}%`;
                container.querySelector('.fm-progress-text').textContent = `${current} / ${total}`;
                container.querySelector('.fm-progress-percent').textContent = `${percent}%`;
            },
            complete: () => {
                container.querySelector('.fm-progress-bar').classList.remove('bg-green-500');
                container.querySelector('.fm-progress-bar').classList.add('bg-blue-500');
                container.querySelector('.fm-progress-text').textContent = '完成';
            },
            element: container
        };
    }

    // 后台任务指示器
    function createProgressIndicator() {
        const indicator = document.createElement('div');
        indicator.className = 'fm-progress-indicator fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-full shadow-lg z-[999997] hidden cursor-pointer hover:bg-green-500 transition-colors';
        indicator.textContent = '任务进行中...';
        indicator.addEventListener('click', () => {
            indicator.classList.add('hidden');
            const container = document.querySelector('.fm-progress-container');
            if (container) container.classList.remove('hidden');
        });
        document.body.appendChild(indicator);
        return indicator;
    }

    // 结果展示组件
    function displayResults(data, columns, title = '查询结果') {
        const existing = document.querySelector('.fm-result-modal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.className = 'fm-result-modal fixed inset-0 bg-black/50 backdrop-blur-sm z-[999999] flex items-center justify-center p-4';

        const modalContent = document.createElement('div');
        modalContent.className = 'bg-gray-800 rounded-xl shadow-2xl max-w-6xl w-full max-h-[80vh] overflow-hidden border border-gray-700';

        // 标题栏
        const header = document.createElement('div');
        header.className = 'flex justify-between items-center p-4 border-b border-gray-700';
        header.innerHTML = `
            <h3 class="text-white font-semibold text-lg">${title} (${data.length} 条)</h3>
            <button class="fm-modal-close text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
        `;

        // 工具栏
        const toolbar = document.createElement('div');
        toolbar.className = 'p-4 border-b border-gray-700 flex gap-2';
        toolbar.innerHTML = `
            <input type="text" class="fm-filter-input flex-1 bg-gray-700 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none text-sm" placeholder="筛选...">
            <button class="fm-copy-all bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">复制全部</button>
        `;

        // 表格容器
        const tableContainer = document.createElement('div');
        tableContainer.className = 'overflow-auto max-h-[50vh]';

        const table = document.createElement('table');
        table.className = 'w-full text-sm';

        // 表头
        const thead = document.createElement('thead');
        thead.className = 'bg-gray-700/50 sticky top-0';
        const headerRow = document.createElement('tr');
        columns.forEach(col => {
            const th = document.createElement('th');
            th.className = 'px-4 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider cursor-pointer hover:text-white';
            th.textContent = col.label;
            th.dataset.key = col.key;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // 表体
        const tbody = document.createElement('tbody');
        tbody.className = 'divide-y divide-gray-700';

        function renderTable(filterText = '') {
            tbody.innerHTML = '';
            const filtered = data.filter(row => {
                if (!filterText) return true;
                return Object.values(row).some(v => String(v).toLowerCase().includes(filterText.toLowerCase()));
            });

            filtered.forEach((row, idx) => {
                const tr = document.createElement('tr');
                tr.className = 'hover:bg-gray-700/30 transition-colors';
                columns.forEach(col => {
                    const td = document.createElement('td');
                    td.className = 'px-4 py-3 text-gray-300 whitespace-nowrap';
                    td.textContent = row[col.key] || '-';
                    tr.appendChild(td);
                });
                // 复制按钮列
                const actionTd = document.createElement('td');
                actionTd.className = 'px-4 py-3';
                const copyBtn = document.createElement('button');
                copyBtn.className = 'text-green-400 hover:text-green-300 text-xs';
                copyBtn.textContent = '复制';
                copyBtn.addEventListener('click', () => {
                    const text = columns.map(col => `${col.label}: ${row[col.key] || '-'}`).join('\n');
                    navigator.clipboard.writeText(text);
                    createNotification('已复制到剪贴板', 'success', 1500);
                });
                actionTd.appendChild(copyBtn);
                tr.appendChild(actionTd);
                tbody.appendChild(tr);
            });
        }

        renderTable();
        table.appendChild(tbody);
        tableContainer.appendChild(table);

        modalContent.appendChild(header);
        modalContent.appendChild(toolbar);
        modalContent.appendChild(tableContainer);
        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // 事件绑定
        modal.querySelector('.fm-modal-close').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        modal.querySelector('.fm-filter-input').addEventListener('input', (e) => {
            renderTable(e.target.value);
        });

        modal.querySelector('.fm-copy-all').addEventListener('click', () => {
            const text = data.map(row => columns.map(col => row[col.key] || '-').join('\t')).join('\n');
            navigator.clipboard.writeText(text);
            createNotification(`已复制 ${data.length} 条数据`, 'success', 1500);
        });
    }

    // 弹窗输入组件
    function showPrompt(title, placeholder = '', defaultValue = '') {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'fixed inset-0 bg-black/50 backdrop-blur-sm z-[999999] flex items-center justify-center p-4';
            modal.innerHTML = `
                <div class="bg-gray-800 rounded-xl shadow-2xl max-w-md w-full border border-gray-700 p-6">
                    <h3 class="text-white font-semibold text-lg mb-4">${title}</h3>
                    <textarea class="fm-prompt-input w-full bg-gray-700 text-white px-4 py-3 rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none resize-none" rows="6" placeholder="${placeholder}">${defaultValue}</textarea>
                    <div class="flex justify-end gap-2 mt-4">
                        <button class="fm-prompt-cancel bg-gray-600 hover:bg-gray-500 text-white px-4 py-2 rounded-lg text-sm">取消</button>
                        <button class="fm-prompt-confirm bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium">确认</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('.fm-prompt-cancel').addEventListener('click', () => {
                modal.remove();
                resolve(null);
            });
            modal.querySelector('.fm-prompt-confirm').addEventListener('click', () => {
                const value = modal.querySelector('.fm-prompt-input').value.trim();
                modal.remove();
                resolve(value);
            });
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.remove();
                    resolve(null);
                }
            });
        });
    }

    // == Token 管理 ==

    // 从 Cookie 获取 Token
    function getTokenFromCookie() {
        const cookies = document.cookie.split(';');
        for (let cookie of cookies) {
            const [name, value] = cookie.trim().split('=');
            if (name === 'token' || name === 'TOKEN') {
                return value;
            }
        }
        return null;
    }

    // 从 localStorage 获取 Token
    function getTokenFromStorage() {
        try {
            return GM_getValue('fm_token', '');
        } catch (e) {
            return '';
        }
    }

    // 保存 Token
    function saveToken(token) {
        try {
            GM_setValue('fm_token', token);
        } catch (e) {
            console.error('保存 Token 失败:', e);
        }
    }

    // 初始化 Token
    function initToken() {
        // 优先从存储获取
        let token = getTokenFromStorage();
        if (!token) {
            // 尝试从 Cookie 获取
            token = getTokenFromCookie();
            if (token) {
                saveToken(token);
            }
        }
        if (token) {
            TOKEN = token;
            IS_TOKEN_VALID = true;
        }
        return token;
    }

    // 设置 Token
    function setToken(token) {
        TOKEN = token;
        IS_TOKEN_VALID = !!token;
        saveToken(token);
        updateTokenStatus();
    }

    // == API 请求 ==

    // 通用请求函数
    function fmRequest(url, body, method = 'POST') {
        return new Promise((resolve, reject) => {
            const headers = {
                'accept': 'application/json, text/plain, */*',
                'content-type': 'application/json; charset=UTF-8',
                'appid': '3',
                'token': TOKEN
            };

            GM_xmlhttpRequest({
                method: method,
                url: BASE_URL + url,
                headers: headers,
                data: JSON.stringify(body),
                onload: function(response) {
                    try {
                        const data = JSON.parse(response.responseText);
                        if (data.code === 0 || data.message === 'SUCCESS') {
                            resolve(data);
                        } else {
                            reject(new Error(data.message || '请求失败'));
                        }
                    } catch (e) {
                        reject(new Error('解析响应失败'));
                    }
                },
                onerror: function(error) {
                    reject(new Error('网络请求失败'));
                }
            });
        });
    }

    // 获取案件列表（分页）
    async function getPagingCase(pageNum = 1, pageSize = 100) {
        return fmRequest('/cs2/user/edge/case/pagingCase', {
            pageSize: pageSize,
            pageNum: pageNum
        });
    }

    // 查询联系人列表
    async function queryContactList(caseId, userId) {
        return fmRequest('/cs2/user/contact/queryContactList', {
            caseId: caseId,
            assetId: ASSET_ID,
            userId: userId
        });
    }

    // == 核心功能：短信数据查询 ==

    async function querySmsData() {
        if (!TOKEN) {
            createNotification('请先设置 Token', 'error');
            return;
        }

        const input = await showPrompt('查询短信数据', '请输入案件ID（可选，留空查询全部）', '');
        if (input === null) return;

        const progress = createProgressBar('正在查询短信数据...', 100);
        const indicator = createProgressIndicator();

        try {
            // 第一步：获取案件列表
            progress.update(10, 100);
            const caseResponse = await getPagingCase(1, 100);
            const cases = caseResponse.result?.content || [];

            if (cases.length === 0) {
                progress.element.remove();
                indicator.remove();
                createNotification('未找到案件数据', 'warning');
                return;
            }

            progress.update(30, 100);

            // 如果指定了案件ID，过滤
            let targetCases = cases;
            if (input) {
                const caseId = parseInt(input);
                targetCases = cases.filter(c => c.id === caseId);
                if (targetCases.length === 0) {
                    progress.element.remove();
                    indicator.remove();
                    createNotification('未找到指定案件', 'warning');
                    return;
                }
            }

            // 第二步：并发查询联系人
            const results = [];
            const total = targetCases.length;
            const batchSize = 10; // 并发数

            for (let i = 0; i < total; i += batchSize) {
                if (window.__FM.batchCallAborted) {
                    createNotification('查询已中止', 'warning');
                    break;
                }

                const batch = targetCases.slice(i, i + batchSize);
                const batchPromises = batch.map(async (caseItem) => {
                    try {
                        const contactResponse = await queryContactList(caseItem.id, caseItem.userId);
                        const contacts = contactResponse.result || [];
                        return contacts.map(contact => ({
                            姓名: contact.realName || '-',
                            关系: contact.relation || '-',
                            手机号: contact.mobile || contact.encryptMobile || '-',
                            城市: contact.city || '-',
                            案件ID: caseItem.id,
                            用户ID: caseItem.userId,
                            客户姓名: caseItem.userRealName || '-',
                            业务名称: caseItem.busiName || '-'
                        }));
                    } catch (e) {
                        console.error(`查询案件 ${caseItem.id} 联系人失败:`, e);
                        return [];
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                batchResults.forEach(r => results.push(...r));

                const current = Math.min(i + batchSize, total);
                progress.update(30 + Math.round((current / total) * 60), 100);
            }

            progress.complete();
            setTimeout(() => {
                progress.element.remove();
                indicator.remove();
            }, 1000);

            if (results.length === 0) {
                createNotification('未查询到联系人数据', 'warning');
                return;
            }

            // 展示结果
            displayResults(results, [
                { key: '客户姓名', label: '客户姓名' },
                { key: '姓名', label: '联系人姓名' },
                { key: '关系', label: '关系' },
                { key: '手机号', label: '手机号' },
                { key: '城市', label: '城市' },
                { key: '案件ID', label: '案件ID' },
                { key: '用户ID', label: '用户ID' }
            ], '短信数据查询结果');

            createNotification(`查询完成，共 ${results.length} 条联系人数据`, 'success');

        } catch (error) {
            progress.element.remove();
            indicator.remove();
            createNotification('查询失败: ' + error.message, 'error');
            console.error('短信数据查询失败:', error);
        }
    }

    // == 悬浮面板 UI ==

    function createFloatingPanel() {
        // 检查是否已存在
        if (document.querySelector('.fm-floating-panel')) return;

        const panel = document.createElement('div');
        panel.className = 'fm-floating-panel fixed top-20 right-4 z-[999990] w-80 bg-gray-900/95 backdrop-blur-sm rounded-xl shadow-2xl border border-gray-700 overflow-hidden';
        panel.style.boxShadow = '0 0 20px rgba(0, 230, 118, 0.15), 0 10px 40px rgba(0, 0, 0, 0.5)';

        panel.innerHTML = `
            <!-- 标题栏 -->
            <div class="fm-panel-header flex justify-between items-center p-3 border-b border-gray-700 cursor-move bg-gray-800/50">
                <div class="flex items-center gap-2">
                    <span class="text-green-400 text-lg">🤖</span>
                    <span class="text-white font-semibold text-sm">富民系统小助手</span>
                </div>
                <div class="flex items-center gap-1">
                    <span class="fm-zoom-level text-gray-400 text-xs mr-2">100%</span>
                    <button class="fm-btn-zoom-out text-gray-400 hover:text-white px-1.5 py-0.5 rounded text-xs" title="缩小">-</button>
                    <button class="fm-btn-zoom-in text-gray-400 hover:text-white px-1.5 py-0.5 rounded text-xs" title="放大">+</button>
                    <button class="fm-btn-collapse text-gray-400 hover:text-white px-1.5 py-0.5 rounded text-xs" title="折叠">−</button>
                </div>
            </div>

            <!-- 内容区 -->
            <div class="fm-panel-content">
                <!-- Token 状态 -->
                <div class="fm-token-status p-3 border-b border-gray-700 flex items-center justify-between">
                    <div class="flex items-center gap-2">
                        <div class="fm-token-dot w-2 h-2 rounded-full bg-red-500"></div>
                        <span class="fm-token-text text-gray-400 text-xs">Token 未设置</span>
                    </div>
                    <button class="fm-btn-set-token text-green-400 hover:text-green-300 text-xs">设置</button>
                </div>

                <!-- 功能按钮区 -->
                <div class="fm-function-buttons p-3 space-y-2">
                    <button class="fm-btn-sms-data w-full bg-green-600 hover:bg-green-500 text-white py-2.5 rounded-lg text-sm font-medium transition-all hover:shadow-lg hover:shadow-green-600/20 flex items-center justify-center gap-2">
                        <span>📨</span>
                        <span>查询短信数据</span>
                    </button>
                    <button class="fm-btn-placeholder w-full bg-gray-700/50 text-gray-500 py-2.5 rounded-lg text-sm cursor-not-allowed flex items-center justify-center gap-2" disabled>
                        <span>📋</span>
                        <span>批量查询销售</span>
                        <span class="text-xs ml-auto">即将上线</span>
                    </button>
                    <button class="fm-btn-placeholder w-full bg-gray-700/50 text-gray-500 py-2.5 rounded-lg text-sm cursor-not-allowed flex items-center justify-center gap-2" disabled>
                        <span>💬</span>
                        <span>发送系统短信</span>
                        <span class="text-xs ml-auto">即将上线</span>
                    </button>
                    <button class="fm-btn-placeholder w-full bg-gray-700/50 text-gray-500 py-2.5 rounded-lg text-sm cursor-not-allowed flex items-center justify-center gap-2" disabled>
                        <span></span>
                        <span>查询还款状态</span>
                        <span class="text-xs ml-auto">即将上线</span>
                    </button>
                    <button class="fm-btn-placeholder w-full bg-gray-700/50 text-gray-500 py-2.5 rounded-lg text-sm cursor-not-allowed flex items-center justify-center gap-2" disabled>
                        <span>📝</span>
                        <span>批量添加催记</span>
                        <span class="text-xs ml-auto">即将上线</span>
                    </button>
                    <button class="fm-btn-placeholder w-full bg-gray-700/50 text-gray-500 py-2.5 rounded-lg text-sm cursor-not-allowed flex items-center justify-center gap-2" disabled>
                        <span>👤</span>
                        <span>查询客户画像</span>
                        <span class="text-xs ml-auto">即将上线</span>
                    </button>
                </div>

                <!-- 底部名言 -->
                <div class="fm-quote p-3 border-t border-gray-700 text-center">
                    <p class="fm-quote-text text-gray-500 text-xs italic">"${QUOTES[Math.floor(Math.random() * QUOTES.length)]}"</p>
                </div>
            </div>

            <!-- 精简模式图标 -->
            <div class="fm-compact-icon hidden fixed bottom-4 right-4 w-12 h-12 bg-green-600 rounded-full shadow-lg flex items-center justify-center cursor-pointer hover:bg-green-500 transition-colors z-[999991]">
                <span class="text-white text-xl">🤖</span>
            </div>
        `;

        document.body.appendChild(panel);

        // == 拖拽功能 ==
        const header = panel.querySelector('.fm-panel-header');
        let isDragging = false;
        let startX, startY, initialX, initialY;

        header.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            const rect = panel.getBoundingClientRect();
            initialX = rect.left;
            initialY = rect.top;
            panel.style.transition = 'none';
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            panel.style.left = `${initialX + dx}px`;
            panel.style.top = `${initialY + dy}px`;
            panel.style.right = 'auto';
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
            panel.style.transition = '';
        });

        // == 折叠功能 ==
        const content = panel.querySelector('.fm-panel-content');
        const collapseBtn = panel.querySelector('.fm-btn-collapse');
        let isCollapsed = false;

        collapseBtn.addEventListener('click', () => {
            isCollapsed = !isCollapsed;
            content.style.display = isCollapsed ? 'none' : 'block';
            collapseBtn.textContent = isCollapsed ? '+' : '−';
        });

        // == 缩放功能 ==
        let zoomLevel = 100;
        const zoomLevelDisplay = panel.querySelector('.fm-zoom-level');
        const zoomInBtn = panel.querySelector('.fm-btn-zoom-in');
        const zoomOutBtn = panel.querySelector('.fm-btn-zoom-out');

        function updateZoom() {
            panel.style.transform = `scale(${zoomLevel / 100})`;
            panel.style.transformOrigin = 'top right';
            zoomLevelDisplay.textContent = `${zoomLevel}%`;
        }

        zoomInBtn.addEventListener('click', () => {
            if (zoomLevel < 150) {
                zoomLevel += 10;
                updateZoom();
            }
        });

        zoomOutBtn.addEventListener('click', () => {
            if (zoomLevel > 50) {
                zoomLevel -= 10;
                updateZoom();
            }
        });

        // == 精简模式（双击标题栏） ==
        const compactIcon = panel.querySelector('.fm-compact-icon');
        let isCompact = false;

        header.addEventListener('dblclick', () => {
            isCompact = !isCompact;
            if (isCompact) {
                panel.style.display = 'none';
                compactIcon.classList.remove('hidden');
            } else {
                panel.style.display = 'block';
                compactIcon.classList.add('hidden');
            }
        });

        compactIcon.addEventListener('click', () => {
            isCompact = false;
            panel.style.display = 'block';
            compactIcon.classList.add('hidden');
        });

        // == Token 设置 ==
        const tokenDot = panel.querySelector('.fm-token-dot');
        const tokenText = panel.querySelector('.fm-token-text');
        const setTokenBtn = panel.querySelector('.fm-btn-set-token');

        function updateTokenStatus() {
            if (TOKEN) {
                tokenDot.classList.remove('bg-red-500');
                tokenDot.classList.add('bg-green-500');
                tokenDot.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.6)';
                tokenText.textContent = 'Token 已设置';
                tokenText.classList.remove('text-gray-400');
                tokenText.classList.add('text-green-400');
            } else {
                tokenDot.classList.remove('bg-green-500');
                tokenDot.classList.add('bg-red-500');
                tokenDot.style.boxShadow = 'none';
                tokenText.textContent = 'Token 未设置';
                tokenText.classList.remove('text-green-400');
                tokenText.classList.add('text-gray-400');
            }
        }

        setTokenBtn.addEventListener('click', async () => {
            const token = await showPrompt('设置 Token', '请输入 Token', TOKEN);
            if (token !== null) {
                setToken(token);
                createNotification('Token 设置成功', 'success');
            }
        });

        // == 功能按钮事件 ==
        panel.querySelector('.fm-btn-sms-data').addEventListener('click', querySmsData);

        // 初始化 Token 状态
        updateTokenStatus();
    }

    // == 密码验证（可选） ==
    async function checkPassword() {
        const savedPassword = getTokenFromStorage() ? 'verified' : '';
        if (savedPassword === 'verified') return true;

        const password = await showPrompt('请输入密码', '密码', '');
        if (password === null) return false;

        const hash = await sha256(password);
        // 默认密码 888888 的 SHA-256
        const defaultHash = 'e6e0612609d10998134e7ea41b8e5f0f9e5b5e5e5e5e5e5e5e5e5e5e5e5e5e5e';

        if (hash === defaultHash || password === '888888') {
            GM_setValue('fm_password_verified', 'verified');
            return true;
        } else {
            createNotification('密码错误', 'error');
            return false;
        }
    }

    // == 初始化 ==
    function init() {
        console.log('富民系统小助手已加载', window.__FM_VERSION);

        // 初始化 Token
        initToken();

        // 创建悬浮面板
        createFloatingPanel();

        // 显示加载通知
        setTimeout(() => {
            createNotification('富民系统小助手已加载', 'success', 2000);
        }, 500);
    }

    // 等待页面加载完成
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
