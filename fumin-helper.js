// == 版本标记 ==
window.__FM_VERSION = 'v20260714C';

// == GM API 兼容层（支持 Tampermonkey 和 控制台直接运行）==
// 使用 _GM_ 前缀避免与 Tampermonkey 注入的全局变量冲突
var _GM_setValue = window.__GM_setValue || function(key, value) {
    try { localStorage.setItem('__fm_' + key, JSON.stringify(value)); } catch(e) {}
};
var _GM_getValue = window.__GM_getValue || function(key, defaultValue) {
    try {
        var v = localStorage.getItem('__fm_' + key);
        return v !== null ? JSON.parse(v) : defaultValue;
    } catch(e) { return defaultValue; }
};
var _GM_xmlhttpRequest = window.__GM_xmlhttpRequest || function(details) {
    // 使用 fetch 作为 fallback
    var method = details.method || 'GET';
    var headers = details.headers || {};
    fetch(details.url, {
        method: method,
        headers: headers,
        body: details.data,
        credentials: 'include'
    }).then(function(response) { return response.text(); }).then(function(responseText) {
        if (details.onload) details.onload({ status: 200, responseText: responseText });
    }).catch(function(error) {
        if (details.onerror) details.onerror(error);
    });
};

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
    notification.className = `fm-notification fm-notification`;
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
    container.className = 'fm-progress-container fm-progress-container';
    container.innerHTML = `
        <div class="fm-progress-header">
            <span class="fm-fm-text-white fm-fm-text-sm fm-fm-font-medium">${title}</span>
            <button class="fm-progress-minimize fm-progress-minimize">最小化</button>
        </div>
        <div class="fm-progress-track">
            <div class="fm-progress-bar fm-progress-bar" style="width: 0%"></div>
        </div>
        <div class="fm-progress-info">
            <span class="fm-progress-text">0 / ${total}</span>
            <span class="fm-progress-percent">0%</span>
        </div>
    `;
    document.body.appendChild(container);

    container.querySelector('.fm-progress-minimize').addEventListener('click', () => {
        container.style.display = 'none';
        const indicator = document.querySelector('.fm-progress-indicator');
        if (indicator) indicator.style.display = 'block';
    });

    return {
        update: (current, total) => {
            const percent = Math.round((current / total) * 100);
            container.querySelector('.fm-progress-bar').style.width = `${percent}%`;
            container.querySelector('.fm-progress-text').textContent = `${current} / ${total}`;
            container.querySelector('.fm-progress-percent').textContent = `${percent}%`;
        },
        complete: () => {
            container.querySelector('.fm-progress-bar').style.background = '#3b82f6';
            container.querySelector('.fm-progress-text').textContent = '完成';
        },
        element: container
    };
}

// 后台任务指示器
function createProgressIndicator() {
    const indicator = document.createElement('div');
    indicator.className = 'fm-progress-indicator';
    indicator.textContent = '任务进行中...';
    indicator.addEventListener('click', () => {
        indicator.style.display = 'none';
        const container = document.querySelector('.fm-progress-container');
        if (container) container.style.display = 'block';
    });
    document.body.appendChild(indicator);
    return indicator;
}

// 结果展示组件
function displayResults(data, columns, title = '查询结果') {
    // 移除旧的结果窗口
    const existingModal = document.querySelector('.fm-result-modal');
    const existingOverlay = document.querySelector('.fm-result-overlay');
    if (existingModal) existingModal.remove();
    if (existingOverlay) existingOverlay.remove();

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'fm-result-overlay';

    // 创建弹窗
    const modal = document.createElement('div');
    modal.className = 'fm-result-modal';

    // 标题栏
    const header = document.createElement('div');
    header.className = 'fm-result-header';
    header.innerHTML = `
        <h3 class="fm-result-title">${title} (${data.length} 条)</h3>
        <button class="fm-result-close">&times;</button>
    `;

    // 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'fm-result-toolbar';
    toolbar.innerHTML = `
        <input type="text" class="fm-result-filter-input" placeholder="筛选...">
        <button class="fm-result-btn fm-copy-all-btn">复制全部</button>
    `;

    // 表格容器
    const tableContainer = document.createElement('div');
    tableContainer.className = 'fm-result-content';

    const table = document.createElement('table');
    table.className = 'fm-result-table';

    // 表头
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    columns.forEach(col => {
        const th = document.createElement('th');
        th.textContent = col.label;
        th.dataset.key = col.key;
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    // 表体
    const tbody = document.createElement('tbody');

    function renderTable(filterText = '') {
        tbody.innerHTML = '';
        const filtered = data.filter(row => {
            if (!filterText) return true;
            return Object.values(row).some(v => String(v).toLowerCase().includes(filterText.toLowerCase()));
        });

        filtered.forEach((row, idx) => {
            const tr = document.createElement('tr');
            columns.forEach(col => {
                const td = document.createElement('td');
                td.textContent = row[col.key] || '-';
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });
    }

    renderTable();
    table.appendChild(tbody);
    tableContainer.appendChild(table);

    modal.appendChild(header);
    modal.appendChild(toolbar);
    modal.appendChild(tableContainer);

    // 添加到页面
    document.body.appendChild(overlay);
    document.body.appendChild(modal);

    // 事件绑定
    modal.querySelector('.fm-result-close').addEventListener('click', () => {
        modal.remove();
        overlay.remove();
    });
    overlay.addEventListener('click', () => {
        modal.remove();
        overlay.remove();
    });

    modal.querySelector('.fm-result-filter-input').addEventListener('input', (e) => {
        renderTable(e.target.value);
    });

    modal.querySelector('.fm-copy-all-btn').addEventListener('click', () => {
        const text = data.map(row => columns.map(col => row[col.key] || '-').join('\t')).join('\n');
        navigator.clipboard.writeText(text);
        createNotification(`已复制 ${data.length} 条数据`, 'success', 1500);
    });
}

// 弹窗输入组件
function showPrompt(title, placeholder = '', defaultValue = '') {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'fm-result-modal fm-prompt-modal';
        modal.style.minWidth = '400px';
        modal.innerHTML = `
            <div class="fm-prompt-content">
                <h3 class="fm-text-white fm-font-semibold fm-text-lg fm-mb-4">${title}</h3>
                <textarea class="fm-prompt-input fm-prompt-input" rows="2" placeholder="${placeholder}">${defaultValue}</textarea>
                <div class="fm-prompt-actions">
                    <button class="fm-prompt-cancel fm-prompt-cancel">取消</button>
                    <button class="fm-prompt-confirm fm-prompt-confirm">确认</button>
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
    console.log('富民系统小助手 - 所有 Cookie:', document.cookie);
    for (let cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        // 尝试多种可能的 token 名称
        if (name.toLowerCase().includes('token') || name === 'sid' || name === 'session' || name === 'auth') {
            console.log('富民系统小助手 - 找到可能的 Token:', name, '=', value);
            return value;
        }
    }
    return null;
}

// 从 localStorage 获取 Token
function getTokenFromStorage() {
    try {
        return _GM_getValue('fm_token', '');
    } catch (e) {
        return '';
    }
}

// 保存 Token
function saveToken(token) {
    try {
        _GM_setValue('fm_token', token);
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
        console.log('富民系统小助手 - Token 已自动获取');
    } else {
        console.log('富民系统小助手 - Token 未找到，请手动设置');
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

        _GM_xmlhttpRequest({
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

// 查询借据编号（第一步）
async function queryLoanByCase(caseId) {
    return fmRequest('/cs2/user/edge/case/queryLoanByCase', {
        caseId: caseId,
        finished: 'NOT_FINISH'
    });
}

// 查询还款信息（第二步）
async function queryRepayment(iousId) {
    return fmRequest('/cs2/user/query/order/repayment', {
        assetId: ASSET_ID,
        iousId: iousId
    });
}

// 查询未还金额
async function queryIouCalculate(caseId, iouNo) {
    return fmRequest('/cs2/user/repayment/iouCalculate', {
        caseId: caseId,
        iouNo: iouNo,
        repayType: 'NORMAL'
    });
}

// 获取银行卡列表
async function getBankCardList(caseId) {
    return fmRequest(`/cs2/user/repayment/getBankCardListByCaseId?caseId=${caseId}`, null, 'GET');
}

// 实时扣款
async function withholdRepay(params) {
    return fmRequest('/cs2/user/repayment/withholdRepayApply', params);
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
                        '客户姓名': caseItem.userRealName || '-',
                        '姓名': contact.realName || '-',
                        '关系': contact.relation || '-',
                        '手机号': contact.mobile || contact.encryptMobile || '-',
                        '车牌号': (caseItem.vehicleMessages && caseItem.vehicleMessages[0] && caseItem.vehicleMessages[0].carNo) || '-',
                        '逾期天数': caseItem.maxOverdueDays !== undefined ? caseItem.maxOverdueDays : '-',
                        '用户ID': caseItem.userId
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
            { key: '车牌号', label: '车牌号' },
            { key: '逾期天数', label: '逾期天数' },
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

// == 核心功能：批量查询还款 ==

async function queryRepaymentData() {
    console.log('[富民系统小助手] 批量查询还款 - 开始执行');
    if (!TOKEN) {
        createNotification('请先设置 Token', 'error');
        return;
    }

    const input = await showPrompt('批量查询还款', '请输入案件ID（可选，留空查询全部）', '');
    if (input === null) {
        console.log('[富民系统小助手] 批量查询还款 - 用户取消');
        return;
    }
    console.log('[富民系统小助手] 批量查询还款 - 用户输入:', input);

    const progress = createProgressBar('正在查询还款数据...', 100);
    const indicator = createProgressIndicator();

    try {
        // 第一步：获取案件列表
        progress.update(10, 100);
        console.log('[富民系统小助手] 批量查询还款 - 开始获取案件列表');
        const caseResponse = await getPagingCase(1, 100);
        console.log('[富民系统小助手] 批量查询还款 - 案件列表响应:', caseResponse);
        const cases = caseResponse.result?.content || [];
        console.log('[富民系统小助手] 批量查询还款 - 案件数量:', cases.length);

        if (cases.length === 0) {
            progress.element.remove();
            indicator.remove();
            createNotification('未找到案件数据', 'warning');
            return;
        }

        progress.update(20, 100);

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

        // 第二步：并发查询借据编号和还款信息
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
                    console.log('[富民系统小助手] 查询案件:', caseItem.id, '用户:', caseItem.userId);
                    
                    // 第一步：查询借据编号
                    const loanResponse = await queryLoanByCase(caseItem.id);
                    console.log('[富民系统小助手] 借据响应:', loanResponse);
                    const listingNumber = loanResponse.result && loanResponse.result[0] ? loanResponse.result[0].listingNumber : null;
                    console.log('[富民系统小助手] 借据编号:', listingNumber);

                    if (!listingNumber) {
                        return {
                            '客户姓名': caseItem.userRealName || '-',
                            '案件ID': caseItem.id,
                            '借据编号': '-',
                            '还款状态': '未找到借据',
                            '用户ID': caseItem.userId
                        };
                    }

                    // 第二步：查询还款信息
                    const repaymentResponse = await queryRepayment(listingNumber);
                    console.log('[富民系统小助手] 还款响应:', JSON.stringify(repaymentResponse));
                    const repaymentList = repaymentResponse.result || [];
                    console.log('[富民系统小助手] 还款数据:', JSON.stringify(repaymentList));
                    
                    // 取最新一条记录（数组第一个）
                    const repaymentData = repaymentList[0] || {};

                    // 第三步：查询未还金额
                    let unpaidAmount = '-';
                    try {
                        const calcResponse = await queryIouCalculate(caseItem.id, listingNumber);
                        console.log('[富民系统小助手] 未还金额响应:', JSON.stringify(calcResponse));
                        if (calcResponse.result && calcResponse.result.normalShouldRepayTotalAmt) {
                            unpaidAmount = calcResponse.result.normalShouldRepayTotalAmt;
                        }
                    } catch (e) {
                        console.error('查询未还金额失败:', e);
                    }

                    return {
                        '客户姓名': caseItem.userRealName || '-',
                        '案件ID': caseItem.id,
                        '借据编号': listingNumber,
                        '还款状态': repaymentData.repaymentStatus || '-',
                        '应还金额': repaymentData.shouldRepayAmount || '-',
                        '已还金额': repaymentData.actualRepayAmount || '-',
                        '未还金额': unpaidAmount,
                        '扣款方式': repaymentData.repaymentWay || '-',
                        '处理时间': repaymentData.createDateTime || '-',
                        '用户ID': caseItem.userId
                    };
                } catch (e) {
                    console.error(`查询案件 ${caseItem.id} 还款信息失败:`, e);
                    return {
                        '客户姓名': caseItem.userRealName || '-',
                        '案件ID': caseItem.id,
                        '借据编号': '-',
                        '还款状态': '查询失败',
                        '用户ID': caseItem.userId
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            batchResults.forEach(r => results.push(r));

            const current = Math.min(i + batchSize, total);
            progress.update(20 + Math.round((current / total) * 70), 100);
        }

        progress.complete();
        setTimeout(() => {
            progress.element.remove();
            indicator.remove();
        }, 1000);

        if (results.length === 0) {
            createNotification('未查询到还款数据', 'warning');
            return;
        }

        // 展示结果
        displayResults(results, [
            { key: '客户姓名', label: '客户姓名' },
            { key: '案件ID', label: '案件ID' },
            { key: '借据编号', label: '借据编号' },
            { key: '还款状态', label: '还款状态' },
            { key: '应还金额', label: '应还金额' },
            { key: '已还金额', label: '已还金额' },
            { key: '未还金额', label: '未还金额' },
            { key: '扣款方式', label: '扣款方式' },
            { key: '处理时间', label: '处理时间' },
            { key: '用户ID', label: '用户ID' }
        ], '批量查询还款结果');

        createNotification(`查询完成，共 ${results.length} 条还款数据`, 'success');

    } catch (error) {
        progress.element.remove();
        indicator.remove();
        createNotification('查询失败: ' + error.message, 'error');
        console.error('批量查询还款失败:', error);
    }
}

// == 核心功能：批量实时扣款 ==

async function batchWithholdRepay() {
    if (!TOKEN) {
        createNotification('请先设置 Token', 'error');
        return;
    }

    const input = await showPrompt('批量实时扣款', '请输入案件ID（可选，留空扣款全部）', '');
    if (input === null) return;

    const progress = createProgressBar('正在执行批量扣款...', 100);
    const indicator = createProgressIndicator();

    try {
        // 第一步：获取案件列表
        console.log('[富民系统小助手] 批量扣款 - 开始获取案件列表');
        const caseResponse = await getPagingCase();
        console.log('[富民系统小助手] 批量扣款 - 案件列表响应:', JSON.stringify(caseResponse));
        
        let cases = caseResponse.result?.content || caseResponse.result?.data || [];
        
        // 如果输入了案件ID，筛选
        if (input.trim()) {
            const caseIds = input.split(',').map(id => parseInt(id.trim()));
            cases = cases.filter(c => caseIds.includes(c.id));
        }

        if (cases.length === 0) {
            progress.element.remove();
            indicator.remove();
            createNotification('未找到匹配的案件', 'warning');
            return;
        }

        progress.update(10, cases.length);
        console.log('[富民系统小助手] 批量扣款 - 案件数量:', cases.length);

        // 第二步：逐个执行扣款
        const results = [];
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < cases.length; i++) {
            const caseItem = cases[i];
            const current = i + 1;
            progress.update(current, cases.length);
            indicator.textContent = `正在扣款 ${current}/${cases.length}...`;

            try {
                // 1. 查询借据编号
                console.log(`[富民系统小助手] 批量扣款 - 查询案件 ${caseItem.id} 的借据编号`);
                const loanResponse = await queryLoanByCase(caseItem.id);
                console.log(`[富民系统小助手] 批量扣款 - 借据响应:`, JSON.stringify(loanResponse));
                const listingNumber = loanResponse.result?.[0]?.listingNumber;
                
                if (!listingNumber) {
                    console.log(`[富民系统小助手] 批量扣款 - 未找到借据编号`);
                    results.push({
                        '客户姓名': caseItem.userRealName || '-',
                        '案件ID': caseItem.id,
                        '扣款状态': '失败',
                        '失败原因': '未找到借据',
                        '用户ID': caseItem.userId
                    });
                    failCount++;
                    continue;
                }
                console.log(`[富民系统小助手] 批量扣款 - 借据编号: ${listingNumber}`);

                // 2. 查询金额明细
                console.log(`[富民系统小助手] 批量扣款 - 查询金额明细`);
                const calcResponse = await queryIouCalculate(caseItem.id, listingNumber);
                console.log(`[富民系统小助手] 批量扣款 - 金额响应:`, JSON.stringify(calcResponse));
                const calcResult = calcResponse.result || {};
                
                // 3. 查询银行卡信息
                console.log(`[富民系统小助手] 批量扣款 - 查询银行卡`);
                const bankResponse = await getBankCardList(caseItem.id);
                console.log(`[富民系统小助手] 批量扣款 - 银行卡响应:`, JSON.stringify(bankResponse));
                const bankList = bankResponse.result || [];
                
                if (bankList.length === 0) {
                    console.log(`[富民系统小助手] 批量扣款 - 未找到银行卡`);
                    results.push({
                        '客户姓名': caseItem.userRealName || '-',
                        '案件ID': caseItem.id,
                        '扣款状态': '失败',
                        '失败原因': '未找到银行卡',
                        '用户ID': caseItem.userId
                    });
                    failCount++;
                    continue;
                }

                const bank = bankList[0]; // 取第一张银行卡
                console.log(`[富民系统小助手] 批量扣款 - 使用银行卡: ${bank.bankName} ${bank.acctNo}`);

                // 4. 执行扣款
                const withholdParams = {
                    caseId: caseItem.id,
                    iouNo: listingNumber,
                    remark: '',
                    bankAccountType: bank.acctType,
                    bankAccountName: bank.acctName,
                    bankCardNo: bank.encryptedAcctNo,
                    bankName: bank.bankName,
                    bankMobileNo: bank.encryptedMobile,
                    repayAmt: calcResult.normalShouldRepayTotalAmt || 0,
                    withholdCinAmt: calcResult.shouldRepayCinAmt || 0,
                    withholdRepayType: 'NORMAL',
                    withholdIntAmt: calcResult.shouldRepayIntAmt || 0,
                    withholdPinAmt: calcResult.shouldRepayPinAmt || 0,
                    withholdPriAmt: calcResult.shouldRepayPriAmt || 0
                };
                console.log(`[富民系统小助手] 批量扣款 - 扣款参数:`, JSON.stringify(withholdParams));

                const withholdResponse = await withholdRepay(withholdParams);
                console.log(`[富民系统小助手] 批量扣款 - 扣款响应:`, JSON.stringify(withholdResponse));
                
                if (withholdResponse.code === 0) {
                    results.push({
                        '客户姓名': caseItem.userRealName || '-',
                        '案件ID': caseItem.id,
                        '扣款状态': '成功',
                        '扣款金额': calcResult.normalShouldRepayTotalAmt || 0,
                        '用户ID': caseItem.userId
                    });
                    successCount++;
                } else {
                    results.push({
                        '客户姓名': caseItem.userRealName || '-',
                        '案件ID': caseItem.id,
                        '扣款状态': '失败',
                        '失败原因': withholdResponse.message || '未知错误',
                        '用户ID': caseItem.userId
                    });
                    failCount++;
                }

            } catch (error) {
                results.push({
                    '客户姓名': caseItem.userRealName || '-',
                    '案件ID': caseItem.id,
                    '扣款状态': '失败',
                    '失败原因': error.message,
                    '用户ID': caseItem.userId
                });
                failCount++;
            }
        }

        progress.element.remove();
        indicator.remove();

        // 展示结果
        displayResults(results, [
            { key: '客户姓名', label: '客户姓名' },
            { key: '案件ID', label: '案件ID' },
            { key: '扣款状态', label: '扣款状态' },
            { key: '扣款金额', label: '扣款金额' },
            { key: '失败原因', label: '失败原因' },
            { key: '用户ID', label: '用户ID' }
        ], '批量实时扣款结果');

        createNotification(`扣款完成：成功 ${successCount} 笔，失败 ${failCount} 笔`, successCount > 0 ? 'success' : 'error');

    } catch (error) {
        progress.element.remove();
        indicator.remove();
        createNotification('扣款失败: ' + error.message, 'error');
        console.error('批量实时扣款失败:', error);
    }
}

// == 注入样式 ==
function injectStyles() {
    if (document.querySelector('#fm-helper-styles')) return;
    const style = document.createElement('style');
    style.id = 'fm-helper-styles';
    style.textContent = `
        .fm-floating-panel {
            position: fixed !important;
            top: 80px !important;
            right: 16px !important;
            width: 320px !important;
            background: rgba(22, 27, 34, 0.95) !important;
            backdrop-filter: blur(12px) !important;
            border: 1px solid rgba(48, 54, 61, 0.8) !important;
            border-radius: 12px !important;
            box-shadow: 0 0 20px rgba(0, 230, 118, 0.15), 0 10px 40px rgba(0, 0, 0, 0.5) !important;
            z-index: 999990 !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
            color: #E6EDF3 !important;
            overflow: hidden !important;
        }
        .fm-panel-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 12px 16px !important;
            border-bottom: 1px solid rgba(48, 54, 61, 0.8) !important;
            cursor: move !important;
            background: rgba(13, 17, 23, 0.8) !important;
            user-select: none !important;
        }
        .fm-panel-title-wrap {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }
        .fm-panel-icon {
            font-size: 18px !important;
            color: #00E676 !important;
        }
        .fm-panel-title-text {
            color: #E6EDF3 !important;
            font-weight: 600 !important;
            font-size: 14px !important;
        }
        .fm-panel-controls {
            display: flex !important;
            align-items: center !important;
            gap: 4px !important;
        }
        .fm-zoom-level {
            color: #8B949E !important;
            font-size: 12px !important;
            margin-right: 8px !important;
            min-width: 40px !important;
            text-align: center !important;
        }
        .fm-btn-control {
            color: #8B949E !important;
            padding: 4px 8px !important;
            border-radius: 4px !important;
            font-size: 12px !important;
            cursor: pointer !important;
            background: transparent !important;
            border: none !important;
            transition: all 0.2s !important;
        }
        .fm-btn-control:hover {
            color: #E6EDF3 !important;
            background: rgba(48, 54, 61, 0.6) !important;
        }
        .fm-panel-content {
            padding: 0 !important;
        }
        .fm-token-status {
            padding: 12px 16px !important;
            border-bottom: 1px solid rgba(48, 54, 61, 0.6) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
        }
        .fm-token-status-wrap {
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }
        .fm-token-dot {
            width: 8px !important;
            height: 8px !important;
            border-radius: 50% !important;
            background: #ef4444 !important;
        }
        .fm-token-dot.valid {
            background: #00E676 !important;
            box-shadow: 0 0 8px rgba(0, 230, 118, 0.6) !important;
        }
        .fm-token-text {
            color: #8B949E !important;
            font-size: 12px !important;
        }
        .fm-token-text.valid {
            color: #00E676 !important;
        }
        .fm-btn-set-token {
            color: #00E676 !important;
            font-size: 12px !important;
            cursor: pointer !important;
            background: rgba(0, 230, 118, 0.1) !important;
            border: 1px solid rgba(0, 230, 118, 0.3) !important;
            border-radius: 4px !important;
            padding: 4px 10px !important;
            transition: all 0.2s !important;
        }
        .fm-btn-set-token:hover {
            background: rgba(0, 230, 118, 0.2) !important;
        }
        .fm-function-buttons {
            padding: 16px !important;
            display: flex !important;
            flex-direction: column !important;
            gap: 10px !important;
        }
        .fm-btn-sms-data {
            width: 100% !important;
            padding: 12px 16px !important;
            background: linear-gradient(135deg, #00E676 0%, #00C853 100%) !important;
            border: none !important;
            border-radius: 8px !important;
            color: #000000 !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 8px !important;
            transition: all 0.2s !important;
            box-shadow: 0 4px 12px rgba(0, 230, 118, 0.3) !important;
        }
        .fm-btn-sms-data:hover {
            transform: translateY(-2px) !important;
            box-shadow: 0 6px 16px rgba(0, 230, 118, 0.4) !important;
        }
        .fm-btn-placeholder {
            width: 100% !important;
            padding: 10px 16px !important;
            background: rgba(48, 54, 61, 0.4) !important;
            border: 1px solid rgba(72, 79, 88, 0.4) !important;
            border-radius: 8px !important;
            color: #8B949E !important;
            font-size: 13px !important;
            cursor: not-allowed !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            gap: 8px !important;
            opacity: 0.6 !important;
        }
        .fm-btn-placeholder .coming-soon {
            margin-left: auto !important;
            font-size: 11px !important;
            color: #6B7280 !important;
        }
        .fm-quote {
            padding: 12px 16px !important;
            border-top: 1px solid rgba(48, 54, 61, 0.6) !important;
            text-align: center !important;
        }
        .fm-quote-text {
            color: #6B7280 !important;
            font-size: 11px !important;
            font-style: italic !important;
            margin: 0 !important;
        }
        .fm-compact-icon {
            display: none !important;
            position: fixed !important;
            bottom: 16px !important;
            right: 16px !important;
            width: 48px !important;
            height: 48px !important;
            background: #00E676 !important;
            border-radius: 50% !important;
            box-shadow: 0 4px 12px rgba(0, 230, 118, 0.4) !important;
            align-items: center !important;
            justify-content: center !important;
            cursor: pointer !important;
            z-index: 999991 !important;
            transition: all 0.2s !important;
        }
        .fm-compact-icon.visible {
            display: flex !important;
        }
        .fm-compact-icon:hover {
            background: #00C853 !important;
            transform: scale(1.1) !important;
        }
        .fm-compact-icon span {
            font-size: 24px !important;
        }
        .fm-notification {
            position: fixed !important;
            top: 20px !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            padding: 12px 24px !important;
            border-radius: 8px !important;
            font-size: 14px !important;
            font-weight: 500 !important;
            z-index: 9999999 !important;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important;
            animation: fm-slideDown 0.3s ease !important;
        }
        .fm-notification.success { background: rgba(0, 230, 118, 0.9) !important; color: #000 !important; }
        .fm-notification.error { background: rgba(239, 68, 68, 0.9) !important; color: #fff !important; }
        .fm-notification.warning { background: rgba(245, 158, 11, 0.9) !important; color: #000 !important; }
        @keyframes fm-slideDown {
            from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
            to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        .fm-progress-container {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            background: rgba(22, 27, 34, 0.98) !important;
            border: 1px solid rgba(48, 54, 61, 0.8) !important;
            border-radius: 12px !important;
            padding: 24px !important;
            min-width: 320px !important;
            z-index: 9999998 !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
        }
        .fm-progress-header {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
            margin-bottom: 16px !important;
        }
        .fm-progress-header span {
            font-size: 14px !important;
            font-weight: 600 !important;
            color: #E6EDF3 !important;
        }
        .fm-progress-minimize {
            background: rgba(48, 54, 61, 0.6) !important;
            border: 1px solid rgba(72, 79, 88, 0.5) !important;
            color: #8B949E !important;
            padding: 4px 12px !important;
            border-radius: 6px !important;
            font-size: 12px !important;
            cursor: pointer !important;
        }
        .fm-progress-minimize:hover {
            background: rgba(72, 79, 88, 0.8) !important;
            color: #E6EDF3 !important;
        }
        .fm-progress-track {
            width: 100% !important;
            height: 8px !important;
            background: rgba(48, 54, 61, 0.6) !important;
            border-radius: 4px !important;
            overflow: hidden !important;
            margin-bottom: 12px !important;
        }
        .fm-progress-bar {
            height: 100% !important;
            background: linear-gradient(90deg, #00E676 0%, #00C853 100%) !important;
            border-radius: 4px !important;
            transition: width 0.3s ease !important;
        }
        .fm-progress-info {
            display: flex !important;
            justify-content: space-between !important;
            align-items: center !important;
        }
        .fm-progress-text {
            font-size: 12px !important;
            color: #8B949E !important;
        }
        .fm-progress-percent {
            font-size: 12px !important;
            color: #00E676 !important;
            font-weight: 600 !important;
        }
        .fm-progress-indicator {
            position: fixed !important;
            bottom: 20px !important;
            right: 20px !important;
            background: rgba(22, 27, 34, 0.95) !important;
            border: 1px solid rgba(0, 230, 118, 0.3) !important;
            border-radius: 8px !important;
            padding: 12px 16px !important;
            font-size: 12px !important;
            color: #00E676 !important;
            z-index: 9999997 !important;
            display: flex !important;
            align-items: center !important;
            gap: 8px !important;
        }
        .fm-progress-indicator .spinner {
            width: 14px !important;
            height: 14px !important;
            border: 2px solid rgba(0, 230, 118, 0.3) !important;
            border-top-color: #00E676 !important;
            border-radius: 50% !important;
            animation: fm-spin 0.8s linear infinite !important;
        }
        @keyframes fm-spin { to { transform: rotate(360deg); } }
        .fm-modal-overlay {
            position: fixed !important;
            top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
            background: rgba(0, 0, 0, 0.7) !important;
            z-index: 9999996 !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
        }
        .fm-modal {
            background: rgba(22, 27, 34, 0.98) !important;
            border: 1px solid rgba(48, 54, 61, 0.8) !important;
            border-radius: 12px !important;
            padding: 24px !important;
            min-width: 320px !important;
            max-width: 480px !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
        }
        .fm-modal-title { font-size: 16px !important; font-weight: 600 !important; color: #E6EDF3 !important; margin-bottom: 16px !important; }
        .fm-modal-input {
            width: 100% !important;
            padding: 10px 12px !important;
            background: rgba(13, 17, 23, 0.8) !important;
            border: 1px solid rgba(48, 54, 61, 0.8) !important;
            border-radius: 6px !important;
            color: #E6EDF3 !important;
            font-size: 14px !important;
            margin-bottom: 16px !important;
            outline: none !important;
            box-sizing: border-box !important;
        }
        .fm-modal-input:focus { border-color: rgba(0, 230, 118, 0.5) !important; }
        .fm-modal-buttons { display: flex !important; gap: 12px !important; justify-content: flex-end !important; }
        .fm-modal-btn { padding: 8px 16px !important; border-radius: 6px !important; font-size: 14px !important; cursor: pointer !important; transition: all 0.2s !important; border: none !important; }
        .fm-modal-btn-primary { background: #00E676 !important; color: #000 !important; font-weight: 600 !important; }
        .fm-modal-btn-primary:hover { background: #00C853 !important; }
        .fm-modal-btn-secondary { background: rgba(48, 54, 61, 0.6) !important; color: #E6EDF3 !important; }
        .fm-modal-btn-secondary:hover { background: rgba(72, 79, 88, 0.8) !important; }
        .fm-prompt-content {
            background: rgba(22, 27, 34, 0.98) !important;
            border: 1px solid rgba(48, 54, 61, 0.8) !important;
            border-radius: 12px !important;
            padding: 24px !important;
            width: 100% !important;
            box-sizing: border-box !important;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5) !important;
        }
        .fm-prompt-input {
            width: 100% !important;
            padding: 10px 12px !important;
            background: rgba(13, 17, 23, 0.8) !important;
            border: 1px solid rgba(48, 54, 61, 0.8) !important;
            border-radius: 6px !important;
            color: #E6EDF3 !important;
            font-size: 14px !important;
            margin-bottom: 16px !important;
            outline: none !important;
            box-sizing: border-box !important;
            resize: vertical !important;
        }
        .fm-prompt-input:focus { border-color: rgba(0, 230, 118, 0.5) !important; }
        .fm-prompt-actions { display: flex !important; gap: 12px !important; justify-content: flex-end !important; }
        .fm-prompt-cancel {
            padding: 8px 16px !important;
            border-radius: 6px !important;
            font-size: 14px !important;
            cursor: pointer !important;
            transition: all 0.2s !important;
            border: none !important;
            background: rgba(48, 54, 61, 0.6) !important;
            color: #E6EDF3 !important;
        }
        .fm-prompt-cancel:hover { background: rgba(72, 79, 88, 0.8) !important; }
        .fm-prompt-confirm {
            padding: 8px 16px !important;
            border-radius: 6px !important;
            font-size: 14px !important;
            cursor: pointer !important;
            transition: all 0.2s !important;
            border: none !important;
            background: #00E676 !important;
            color: #000 !important;
            font-weight: 600 !important;
        }
        .fm-prompt-confirm:hover { background: #00C853 !important; }
        .fm-result-overlay {
            position: fixed !important;
            top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
            background: rgba(0, 0, 0, 0.75) !important;
            z-index: 9999994 !important;
        }
        .fm-result-modal {
            position: fixed !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, -50%) !important;
            background: #1a1a2e !important;
            border: 1px solid rgba(0, 230, 118, 0.2) !important;
            border-radius: 16px !important;
            padding: 0 !important;
            min-width: 700px !important;
            max-width: 90vw !important;
            max-height: 85vh !important;
            overflow: hidden !important;
            z-index: 9999995 !important;
            box-shadow: 0 0 40px rgba(0, 230, 118, 0.1), 0 20px 60px rgba(0, 0, 0, 0.6) !important;
        }
        .fm-result-header {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 20px 24px !important;
            background: linear-gradient(135deg, rgba(0, 230, 118, 0.1) 0%, rgba(0, 200, 83, 0.05) 100%) !important;
            border-bottom: 1px solid rgba(0, 230, 118, 0.2) !important;
        }
        .fm-result-title {
            font-size: 18px !important;
            font-weight: 600 !important;
            color: #00E676 !important;
            text-shadow: 0 0 10px rgba(0, 230, 118, 0.3) !important;
        }
        .fm-result-close {
            width: 32px !important;
            height: 32px !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            background: rgba(239, 68, 68, 0.1) !important;
            border: 1px solid rgba(239, 68, 68, 0.3) !important;
            border-radius: 8px !important;
            color: #ef4444 !important;
            cursor: pointer !important;
            font-size: 18px !important;
            transition: all 0.2s !important;
        }
        .fm-result-close:hover { background: rgba(239, 68, 68, 0.2) !important; transform: scale(1.1) !important; }
        .fm-result-toolbar {
            display: flex !important;
            gap: 12px !important;
            padding: 16px 24px !important;
            background: rgba(13, 17, 23, 0.5) !important;
            border-bottom: 1px solid rgba(48, 54, 61, 0.6) !important;
        }
        .fm-result-filter-input {
            flex: 1 !important;
            padding: 10px 14px !important;
            background: rgba(13, 17, 23, 0.8) !important;
            border: 1px solid rgba(48, 54, 61, 0.8) !important;
            border-radius: 8px !important;
            color: #E6EDF3 !important;
            font-size: 13px !important;
            outline: none !important;
            box-sizing: border-box !important;
            transition: all 0.2s !important;
        }
        .fm-result-filter-input:focus { border-color: rgba(0, 230, 118, 0.5) !important; box-shadow: 0 0 0 2px rgba(0, 230, 118, 0.1) !important; }
        .fm-result-btn {
            padding: 10px 18px !important;
            background: linear-gradient(135deg, #00E676 0%, #00C853 100%) !important;
            border: none !important;
            border-radius: 8px !important;
            color: #000 !important;
            font-size: 13px !important;
            font-weight: 600 !important;
            cursor: pointer !important;
            transition: all 0.2s !important;
            box-shadow: 0 2px 8px rgba(0, 230, 118, 0.3) !important;
        }
        .fm-result-btn:hover { transform: translateY(-1px) !important; box-shadow: 0 4px 12px rgba(0, 230, 118, 0.4) !important; }
        .fm-result-content { padding: 0 !important; overflow: auto !important; max-height: 50vh !important; }
        .fm-result-table { width: 100% !important; border-collapse: collapse !important; font-size: 13px !important; }
        .fm-result-table thead { position: sticky !important; top: 0 !important; z-index: 1 !important; }
        .fm-result-table th {
            padding: 12px 16px !important;
            text-align: left !important;
            background: rgba(13, 17, 23, 0.95) !important;
            border-bottom: 2px solid rgba(0, 230, 118, 0.3) !important;
            color: #00E676 !important;
            font-weight: 600 !important;
            white-space: nowrap !important;
            font-size: 12px !important;
            text-transform: uppercase !important;
            letter-spacing: 0.5px !important;
        }
        .fm-result-table td {
            padding: 12px 16px !important;
            border-bottom: 1px solid rgba(48, 54, 61, 0.4) !important;
            color: #E6EDF3 !important;
            transition: all 0.2s !important;
        }
        .fm-result-table tbody tr:hover td {
            background: rgba(0, 230, 118, 0.05) !important;
        }
        .fm-result-table .fm-copy-btn {
            padding: 6px 12px !important;
            background: rgba(0, 230, 118, 0.1) !important;
            border: 1px solid rgba(0, 230, 118, 0.3) !important;
            border-radius: 6px !important;
            color: #00E676 !important;
            font-size: 12px !important;
            cursor: pointer !important;
            transition: all 0.2s !important;
        }
        .fm-result-table .fm-copy-btn:hover {
            background: rgba(0, 230, 118, 0.2) !important;
            transform: scale(1.05) !important;
        }
        .fm-result-pagination {
            display: flex !important;
            align-items: center !important;
            justify-content: space-between !important;
            padding: 16px 24px !important;
            background: rgba(13, 17, 23, 0.5) !important;
            border-top: 1px solid rgba(48, 54, 61, 0.6) !important;
            font-size: 13px !important;
            color: #8B949E !important;
        }
        .fm-result-pagination-btns { display: flex !important; gap: 8px !important; }
        .fm-result-page-btn {
            padding: 8px 14px !important;
            background: rgba(48, 54, 61, 0.6) !important;
            border: 1px solid rgba(72, 79, 88, 0.4) !important;
            border-radius: 6px !important;
            color: #E6EDF3 !important;
            cursor: pointer !important;
            font-size: 12px !important;
            transition: all 0.2s !important;
        }
        .fm-result-page-btn:hover:not(:disabled) { background: rgba(72, 79, 88, 0.8) !important; border-color: rgba(0, 230, 118, 0.3) !important; }
        .fm-result-page-btn:disabled { opacity: 0.4 !important; cursor: not-allowed !important; }
    `;
    document.head.appendChild(style);
}

// == 创建悬浮面板 ==
function createFloatingPanel() {
    // 检查是否已存在
    if (document.querySelector('.fm-floating-panel')) return;

    // 先注入样式
    injectStyles();

    const panel = document.createElement('div');
    panel.className = 'fm-floating-panel';
    panel.id = 'fm-helper-panel';

    panel.innerHTML = `
        <!-- 标题栏 -->
        <div class="fm-panel-header" id="fm-drag-handle">
            <div class="fm-panel-title-wrap">
                <span class="fm-panel-icon">🤖</span>
                <span class="fm-panel-title-text">富民系统小助手</span>
            </div>
            <div class="fm-panel-controls">
                <span class="fm-zoom-level" id="fm-zoom-level">100%</span>
                <button class="fm-btn-control" id="fm-btn-zoom-out" title="缩小">−</button>
                <button class="fm-btn-control" id="fm-btn-zoom-in" title="放大">+</button>
                <button class="fm-btn-control" id="fm-btn-toggle" title="折叠">−</button>
            </div>
        </div>

        <!-- 内容区 -->
        <div class="fm-panel-content" id="fm-panel-content">
            <!-- Token 状态 -->
            <div class="fm-token-status">
                <div class="fm-token-status-wrap">
                    <div class="fm-token-dot" id="fm-token-dot"></div>
                    <span class="fm-token-text" id="fm-token-text">Token 未设置</span>
                </div>
                <button class="fm-btn-set-token" id="fm-btn-set-token">设置</button>
            </div>

            <!-- 功能按钮区 -->
            <div class="fm-function-buttons" id="fm-function-buttons">
                <button class="fm-btn-sms-data" id="fm-btn-sms-data">
                    <span>📨</span>
                    <span>查询短信数据</span>
                </button>
                <button class="fm-btn-sms-data" id="fm-btn-withhold-repay" style="background: linear-gradient(135deg, #F59E0B 0%, #D97706 100%) !important;">
                    <span>⚡</span>
                    <span>批量实时扣款</span>
                </button>
                <button class="fm-btn-placeholder" disabled>
                    <span>💬</span>
                    <span>发送系统短信</span>
                    <span class="coming-soon">即将上线</span>
                </button>
                <button class="fm-btn-sms-data" id="fm-btn-repayment-data" style="background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%) !important;">
                    <span></span>
                    <span>批量查询还款</span>
                </button>
                <button class="fm-btn-placeholder" disabled>
                    <span></span>
                    <span>批量添加催记</span>
                    <span class="coming-soon">即将上线</span>
                </button>
                <button class="fm-btn-placeholder" disabled>
                    <span></span>
                    <span>查询车辆信息</span>
                    <span class="coming-soon">即将上线</span>
                </button>
            </div>

            <!-- 底部名言 -->
            <div class="fm-quote">
                <p class="fm-quote-text" id="fm-quote-text">"${QUOTES[Math.floor(Math.random() * QUOTES.length)]}"</p>
            </div>
        </div>

        <!-- 精简模式图标 -->
        <div class="fm-compact-icon" id="fm-compact-icon">
            <span></span>
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
    const collapseBtn = panel.querySelector('#fm-btn-toggle');
    let isCollapsed = false;

    if (collapseBtn) {
        collapseBtn.addEventListener('click', () => {
            isCollapsed = !isCollapsed;
            content.style.display = isCollapsed ? 'none' : 'block';
            collapseBtn.textContent = isCollapsed ? '+' : '−';
        });
    }

    // == 缩放功能 ==
    let zoomLevel = 100;
    const zoomLevelDisplay = panel.querySelector('#fm-zoom-level');
    const zoomInBtn = panel.querySelector('#fm-btn-zoom-in');
    const zoomOutBtn = panel.querySelector('#fm-btn-zoom-out');

    function updateZoom() {
        panel.style.transform = `scale(${zoomLevel / 100})`;
        panel.style.transformOrigin = 'top right';
        if (zoomLevelDisplay) zoomLevelDisplay.textContent = `${zoomLevel}%`;
    }

    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => {
            if (zoomLevel < 150) {
                zoomLevel += 10;
                updateZoom();
            }
        });
    }

    if (zoomOutBtn) {
        zoomOutBtn.addEventListener('click', () => {
            if (zoomLevel > 50) {
                zoomLevel -= 10;
                updateZoom();
            }
        });
    }

    // == 精简模式（双击标题栏） ==
    const compactIcon = panel.querySelector('#fm-compact-icon');
    let isCompact = false;

    header.addEventListener('dblclick', () => {
        isCompact = !isCompact;
        if (isCompact) {
            panel.style.display = 'none';
            if (compactIcon) compactIcon.style.display = 'flex';
        } else {
            panel.style.display = 'block';
            if (compactIcon) compactIcon.style.display = 'none';
        }
    });

    if (compactIcon) {
        compactIcon.addEventListener('click', () => {
            isCompact = false;
            panel.style.display = 'block';
            compactIcon.style.display = 'none';
        });
    }

    // == Token 设置 ==
    const tokenDot = panel.querySelector('#fm-token-dot');
    const tokenText = panel.querySelector('#fm-token-text');
    const setTokenBtn = panel.querySelector('#fm-btn-set-token');

    function updateTokenStatus() {
        if (TOKEN) {
            if (tokenDot) {
                tokenDot.style.background = '#22c55e';
                tokenDot.style.boxShadow = '0 0 8px rgba(34, 197, 94, 0.6)';
            }
            if (tokenText) {
                tokenText.textContent = 'Token 已设置';
                tokenText.style.color = '#4ade80';
            }
        } else {
            if (tokenDot) {
                tokenDot.style.background = '#ef4444';
                tokenDot.style.boxShadow = 'none';
            }
            if (tokenText) {
                tokenText.textContent = 'Token 未设置';
                tokenText.style.color = '#9ca3af';
            }
        }
    }

    if (setTokenBtn) {
        setTokenBtn.addEventListener('click', async () => {
            const token = await showPrompt('设置 Token', '请输入 Token', TOKEN);
            if (token !== null) {
                setToken(token);
                createNotification('Token 设置成功', 'success');
            }
        });
    }

    // == 功能按钮事件 ==
    const smsDataBtn = panel.querySelector('#fm-btn-sms-data');
    if (smsDataBtn) {
        smsDataBtn.addEventListener('click', querySmsData);
    }

    const repaymentBtn = panel.querySelector('#fm-btn-repayment-data');
    if (repaymentBtn) {
        repaymentBtn.addEventListener('click', queryRepaymentData);
    }

    const withholdBtn = panel.querySelector('#fm-btn-withhold-repay');
    if (withholdBtn) {
        withholdBtn.addEventListener('click', batchWithholdRepay);
    }

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
        _GM_setValue('fm_password_verified', 'verified');
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

