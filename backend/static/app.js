// LiteFlow Frontend Core Engine

const API_BASE = ""; // Relative path fits perfectly because they share the same origin

// Global variables
let activeTab = "dashboard";
let monacoEditor = null;
let currentEditingScriptId = null;
let logPollingInterval = null;

// Default code template for new scripts
const CODE_TEMPLATE = `import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

print(">>> LiteFlow Data Processing Pipeline Starting...")

# 1. Simulate data
data = {
    'Department': ['Sales', 'Marketing', 'R&D', 'HR', 'Finance'],
    'Value': np.random.randint(100, 1000, 5)
}
df = pd.DataFrame(data)
print("Data frame initialized:\\n", df)

# 2. Generate visualization
plt.figure(figsize=(8, 5))
plt.bar(df['Department'], df['Value'], color='#8b5cf6')
plt.title("Departmental Distribution - LiteFlow Demo")
plt.xlabel("Department")
plt.ylabel("Performance Score")
plt.tight_layout()

# Save image to workspace (this becomes an artifact)
plt.savefig("chart_demo.png")
print(">>> Chart generated and saved to workspace as 'chart_demo.png'")
print(">>> Process Completed Successfully!")
`;

// Initialize App
document.addEventListener("DOMContentLoaded", () => {
    // Nav bar listeners
    document.getElementById("nav-dashboard").addEventListener("click", () => switchTab("dashboard"));
    document.getElementById("nav-scripts").addEventListener("click", () => switchTab("scripts"));
    document.getElementById("nav-history").addEventListener("click", () => switchTab("history"));
    document.getElementById("btn-create-script").addEventListener("click", () => openScriptModal(null));
    document.getElementById("btn-save-script").addEventListener("click", saveScript);

    // Load Monaco Editor
    initMonaco();

    // Initial Load
    switchTab("dashboard");
});

// Monaco Editor Initialization
function initMonaco() {
    require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.39.0/min/vs' } });
    require(['vs/editor/editor.main'], function () {
        monaco.editor.defineTheme('liteflow-dark', {
            base: 'vs-dark',
            inherit: true,
            rules: [
                { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
                { token: 'keyword', foreground: 'ff79c6' },
                { token: 'string', foreground: 'f1fa8c' }
            ],
            colors: {
                'editor.background': '#0f172a', // Tailwind slate-950/900
                'editor.lineHighlightBackground': '#1e293b',
            }
        });

        monacoEditor = monaco.editor.create(document.getElementById('monaco-container'), {
            value: CODE_TEMPLATE,
            language: 'python',
            theme: 'liteflow-dark',
            automaticLayout: true,
            fontSize: 13,
            lineHeight: 20,
            minimap: { enabled: false }
        });
    });
}

// Switch UI tabs
async function switchTab(tabName) {
    activeTab = tabName;
    
    // Update Sidebar CSS
    const buttons = document.querySelectorAll(".nav-btn");
    buttons.forEach(btn => {
        btn.classList.remove("bg-slate-800", "text-white", "shadow-sm");
        btn.classList.add("text-slate-400", "hover:text-white", "hover:bg-slate-800/50");
        const icon = btn.querySelector("i");
        if (icon) icon.classList.remove("text-brand-500");
    });

    const activeBtn = document.getElementById(`nav-${tabName}`);
    activeBtn.classList.add("bg-slate-800", "text-white", "shadow-sm");
    activeBtn.classList.remove("text-slate-400", "hover:text-white", "hover:bg-slate-800/50");
    const activeIcon = activeBtn.querySelector("i");
    if (activeIcon) activeIcon.classList.add("text-brand-500");

    // Update Topbar page title
    const pageTitles = {
        dashboard: "控制中心",
        scripts: "脚本管理",
        history: "运行历史"
    };
    document.getElementById("page-title").textContent = pageTitles[tabName];

    // Load & Render Content
    renderView(tabName);
}

// Render dynamic content based on tab
async function renderView(tabName) {
    const container = document.getElementById("view-container");
    container.innerHTML = `<div class="flex items-center justify-center py-12"><div class="w-8 h-8 border-4 border-brand-500 border-t-transparent rounded-full animate-spin"></div></div>`;

    try {
        if (tabName === "dashboard") {
            const scripts = await getScripts();
            const executions = await getExecutions();
            renderDashboard(container, scripts, executions);
        } else if (tabName === "scripts") {
            const scripts = await getScripts();
            renderScriptsList(container, scripts);
        } else if (tabName === "history") {
            const executions = await getExecutions();
            renderHistoryList(container, executions);
        }
        // Refresh icons
        lucide.createIcons();
    } catch (err) {
        container.innerHTML = `
            <div class="bg-rose-500/10 border border-rose-500/20 text-rose-200 p-4 rounded-lg flex items-center gap-3">
                <i data-lucide="alert-triangle" class="w-5 h-5 text-rose-500 shrink-0"></i>
                <div>
                    <span class="font-bold">数据加载失败:</span>
                    <span>${err.message}。请确认后端服务已启动并运行。</span>
                </div>
            </div>
        `;
        lucide.createIcons();
    }
}

// --- View Renderers ---

function renderDashboard(container, scripts, executions) {
    // Calculations
    const activeSchedules = scripts.filter(s => s.is_active && s.cron_expression).length;
    const runsToday = executions.filter(e => {
        const runTime = new Date(e.start_time);
        const today = new Date();
        return runTime.toDateString() === today.toDateString();
    }).length;

    const failedRuns = executions.filter(e => e.status === "failed").length;
    const totalRuns = executions.length;
    const successRate = totalRuns > 0 ? (((totalRuns - failedRuns) / totalRuns) * 100).toFixed(1) : "0.0";

    container.innerHTML = `
        <!-- Stats Grid -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div class="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-center justify-between">
                <div>
                    <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider block">已导入脚本数</span>
                    <span class="text-3xl font-bold mt-1.5 block">${scripts.length}</span>
                </div>
                <div class="p-3 bg-slate-950 border border-slate-800 rounded-lg text-slate-400">
                    <i data-lucide="file-code" class="w-6 h-6"></i>
                </div>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-center justify-between">
                <div>
                    <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider block">活动调度任务</span>
                    <span class="text-3xl font-bold mt-1.5 block text-indigo-400">${activeSchedules}</span>
                </div>
                <div class="p-3 bg-slate-950 border border-slate-800 rounded-lg text-indigo-400">
                    <i data-lucide="clock" class="w-6 h-6"></i>
                </div>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-center justify-between">
                <div>
                    <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider block">今日执行次数</span>
                    <span class="text-3xl font-bold mt-1.5 block text-brand-400">${runsToday}</span>
                </div>
                <div class="p-3 bg-slate-950 border border-slate-800 rounded-lg text-brand-400">
                    <i data-lucide="play" class="w-6 h-6"></i>
                </div>
            </div>
            <div class="bg-slate-900 border border-slate-800 p-6 rounded-xl flex items-center justify-between">
                <div>
                    <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider block">执行成功率</span>
                    <span class="text-3xl font-bold mt-1.5 block text-emerald-400">${successRate}%</span>
                </div>
                <div class="p-3 bg-slate-950 border border-slate-800 rounded-lg text-emerald-400">
                    <i data-lucide="check-circle" class="w-6 h-6"></i>
                </div>
            </div>
        </div>

        <!-- Recent Executions -->
        <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div class="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
                <h3 class="font-bold text-slate-200">最近执行历史 (实时)</h3>
                <span class="text-xs text-slate-400">展示最新 10 条记录</span>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-950/50 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                            <th class="px-6 py-3.5">脚本名称</th>
                            <th class="px-6 py-3.5">状态</th>
                            <th class="px-6 py-3.5">开始时间</th>
                            <th class="px-6 py-3.5">持续时间</th>
                            <th class="px-6 py-3.5 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800 text-sm text-slate-300">
                        ${executions.slice(0, 10).map(ex => {
                            const duration = ex.end_time ? formatDuration(ex.start_time, ex.end_time) : "-";
                            const statusColor = getStatusBadgeClass(ex.status);
                            const startTime = new Date(ex.start_time).toLocaleString();

                            return `
                                <tr>
                                    <td class="px-6 py-4 font-semibold text-slate-200">${escapeHtml(ex.script_name)}</td>
                                    <td class="px-6 py-4">
                                        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}">
                                            ${ex.status === 'running' ? '<span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>' : ''}
                                            ${translateStatus(ex.status)}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-slate-400">${startTime}</td>
                                    <td class="px-6 py-4 text-slate-400">${duration}</td>
                                    <td class="px-6 py-4 text-right">
                                        <button onclick="window.viewLogs(${ex.id})" class="text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1 ml-auto">
                                            <i data-lucide="terminal" class="w-4 h-4"></i> 查看日志与产物
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join("")}
                        ${executions.length === 0 ? '<tr><td colspan="5" class="px-6 py-8 text-center text-slate-500">暂无执行历史，请尝试手动运行脚本！</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderScriptsList(container, scripts) {
    container.innerHTML = `
        <div class="grid grid-cols-1 gap-4">
            ${scripts.map(script => {
                return `
                    <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-slate-700/60 transition-all">
                        <div class="space-y-1">
                            <div class="flex items-center gap-3">
                                <h3 class="text-base font-bold text-slate-100">${escapeHtml(script.name)}</h3>
                                <span class="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${script.is_active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-950 text-slate-400 border border-slate-800'}">
                                    ${script.is_active ? '已启用调度' : '未启用调度'}
                                </span>
                            </div>
                            <p class="text-sm text-slate-400">${escapeHtml(script.description || "无描述信息")}</p>
                            
                            <div class="flex flex-wrap items-center gap-x-6 gap-y-2 pt-2 text-xs text-slate-500">
                                <span class="flex items-center gap-1.5">
                                    <i data-lucide="clock" class="w-3.5 h-3.5"></i>
                                    调度规则: <code class="bg-slate-950 px-1.5 py-0.5 rounded text-brand-400">${script.cron_expression || "手动触发"}</code>
                                </span>
                                <span class="flex items-center gap-1.5">
                                    <i data-lucide="package" class="w-3.5 h-3.5"></i>
                                    依赖库数: <span class="text-slate-300 font-semibold">${script.requirements ? script.requirements.trim().split("\n").filter(Boolean).length : 0}</span>
                                </span>
                            </div>
                        </div>

                        <!-- Action Buttons -->
                        <div class="flex items-center gap-2.5 shrink-0 self-end md:self-auto">
                            <button onclick="window.triggerImmediateRun(${script.id})" class="px-3.5 py-2 text-xs font-semibold text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center gap-1.5 transition-all">
                                <i data-lucide="play" class="w-3.5 h-3.5 text-emerald-400"></i> 立即运行
                            </button>
                            <button onclick="window.openScriptModal(${script.id})" class="px-3.5 py-2 text-xs font-semibold text-white bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg flex items-center gap-1.5 transition-all">
                                <i data-lucide="edit" class="w-3.5 h-3.5 text-brand-400"></i> 编辑
                            </button>
                            <button onclick="window.confirmDeleteScript(${script.id})" class="px-3.5 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 border border-slate-800/80 rounded-lg flex items-center gap-1.5 transition-all">
                                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i> 删除
                            </button>
                        </div>
                    </div>
                `;
            }).join("")}
            ${scripts.length === 0 ? `
                <div class="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
                    <i data-lucide="folder-open" class="w-12 h-12 text-slate-600 mx-auto mb-4"></i>
                    <h4 class="font-bold text-slate-300 mb-1">暂无脚本</h4>
                    <p class="text-sm text-slate-500 mb-4">您可以点击右上方按钮新建一个调度脚本。</p>
                </div>
            ` : ''}
        </div>
    `;
}

function renderHistoryList(container, executions) {
    container.innerHTML = `
        <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse">
                    <thead>
                        <tr class="bg-slate-950/50 border-b border-slate-800 text-slate-400 text-xs uppercase tracking-wider font-semibold">
                            <th class="px-6 py-3.5">执行 ID</th>
                            <th class="px-6 py-3.5">脚本名称</th>
                            <th class="px-6 py-3.5">状态</th>
                            <th class="px-6 py-3.5">开始时间</th>
                            <th class="px-6 py-3.5">持续时间</th>
                            <th class="px-6 py-3.5 text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-800 text-sm text-slate-300">
                        ${executions.map(ex => {
                            const duration = ex.end_time ? formatDuration(ex.start_time, ex.end_time) : "-";
                            const statusColor = getStatusBadgeClass(ex.status);
                            const startTime = new Date(ex.start_time).toLocaleString();

                            return `
                                <tr>
                                    <td class="px-6 py-4 font-mono text-xs text-slate-500">#${ex.id}</td>
                                    <td class="px-6 py-4 font-semibold text-slate-200">${escapeHtml(ex.script_name)}</td>
                                    <td class="px-6 py-4">
                                        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor}">
                                            ${ex.status === 'running' ? '<span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>' : ''}
                                            ${translateStatus(ex.status)}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-slate-400">${startTime}</td>
                                    <td class="px-6 py-4 text-slate-400">${duration}</td>
                                    <td class="px-6 py-4 text-right">
                                        <button onclick="window.viewLogs(${ex.id})" class="text-brand-400 hover:text-brand-300 font-semibold flex items-center gap-1 ml-auto">
                                            <i data-lucide="terminal" class="w-4 h-4"></i> 日志与分析图表
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join("")}
                        ${executions.length === 0 ? '<tr><td colspan="6" class="px-6 py-8 text-center text-slate-500">暂无执行历史记录。</td></tr>' : ''}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// --- API Fetch wrappers ---

async function getScripts() {
    const res = await fetch(`${API_BASE}/api/scripts`);
    if (!res.ok) throw new Error("获取脚本失败");
    return await res.json();
}

async function getScript(id) {
    const res = await fetch(`${API_BASE}/api/scripts/${id}`);
    if (!res.ok) throw new Error("获取脚本详情失败");
    return await res.json();
}

async function getExecutions() {
    const res = await fetch(`${API_BASE}/api/executions`);
    if (!res.ok) throw new Error("获取执行记录失败");
    return await res.json();
}

async function getExecution(id) {
    const res = await fetch(`${API_BASE}/api/executions/${id}`);
    if (!res.ok) throw new Error("获取执行详情失败");
    return await res.json();
}

// --- Script Operations ---

window.openScriptModal = async function(scriptId) {
    currentEditingScriptId = scriptId;
    const modal = document.getElementById("modal-script");
    const modalTitle = document.getElementById("modal-title");
    
    // Clear inputs
    document.getElementById("script-name").value = "";
    document.getElementById("script-desc").value = "";
    document.getElementById("script-cron").value = "";
    document.getElementById("script-reqs").value = "";
    document.getElementById("script-active").checked = true;

    if (scriptId) {
        modalTitle.textContent = "编辑脚本";
        try {
            const script = await getScript(scriptId);
            document.getElementById("script-name").value = script.name;
            document.getElementById("script-desc").value = script.description || "";
            document.getElementById("script-cron").value = script.cron_expression || "";
            document.getElementById("script-reqs").value = script.requirements || "";
            document.getElementById("script-active").checked = script.is_active;
            
            if (monacoEditor) {
                monacoEditor.setValue(script.code);
            }
        } catch (err) {
            alert("加载脚本详情失败: " + err.message);
            return;
        }
    } else {
        modalTitle.textContent = "新建脚本";
        if (monacoEditor) {
            monacoEditor.setValue(CODE_TEMPLATE);
        }
    }

    modal.classList.remove("hidden");
    lucide.createIcons();
};

window.closeScriptModal = function() {
    document.getElementById("modal-script").classList.add("hidden");
};

async function saveScript() {
    const name = document.getElementById("script-name").value.trim();
    const description = document.getElementById("script-desc").value.trim();
    const cron_expression = document.getElementById("script-cron").value.trim() || null;
    const requirements = document.getElementById("script-reqs").value.trim();
    const is_active = document.getElementById("script-active").checked;
    const code = monacoEditor ? monacoEditor.getValue() : "";

    if (!name) {
        alert("请输入脚本名称！");
        return;
    }

    const payload = {
        name,
        description,
        cron_expression,
        requirements,
        is_active,
        code
    };

    try {
        let res;
        if (currentEditingScriptId) {
            // Update
            res = await fetch(`${API_BASE}/api/scripts/${currentEditingScriptId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        } else {
            // Create
            res = await fetch(`${API_BASE}/api/scripts`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
        }

        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || "保存脚本失败");
        }

        closeScriptModal();
        renderView(activeTab); // Refresh current view
    } catch (err) {
        alert("保存失败: " + err.message);
    }
}

window.confirmDeleteScript = async function(id) {
    if (confirm("确定要删除该脚本吗？删除后将彻底移除物理目录和运行记录！")) {
        try {
            const res = await fetch(`${API_BASE}/api/scripts/${id}`, { method: "DELETE" });
            if (!res.ok) throw new Error("删除失败");
            renderView(activeTab);
        } catch (err) {
            alert(err.message);
        }
    }
};

window.triggerImmediateRun = async function(id) {
    try {
        const res = await fetch(`${API_BASE}/api/scripts/${id}/run`, { method: "POST" });
        if (!res.ok) throw new Error("触发执行失败");
        const data = await res.json();
        
        // Open log modal instantly and start polling
        viewLogs(data.execution_id);
    } catch (err) {
        alert(err.message);
    }
};

// --- Execution Log Operations ---

window.viewLogs = async function(executionId) {
    const modal = document.getElementById("modal-log");
    modal.classList.remove("hidden");
    
    // Clear previous logs/artifacts
    document.getElementById("log-terminal").textContent = ">>> 初始化连接中...\n";
    document.getElementById("artifacts-container").innerHTML = "";
    document.getElementById("log-meta").textContent = "载入中...";

    // Clear existing polling
    if (logPollingInterval) clearInterval(logPollingInterval);

    // Initial load
    await pollExecution(executionId);

    // Setup loop polling (every 1.5 seconds)
    logPollingInterval = setInterval(() => {
        pollExecution(executionId);
    }, 1500);

    lucide.createIcons();
};

window.closeLogModal = function() {
    document.getElementById("modal-log").classList.add("hidden");
    if (logPollingInterval) {
        clearInterval(logPollingInterval);
        logPollingInterval = null;
    }
    // Refresh dashboard / script list state when log viewer closes
    renderView(activeTab);
};

async function pollExecution(executionId) {
    try {
        const ex = await getExecution(executionId);
        
        // Render logs
        const term = document.getElementById("log-terminal");
        term.textContent = ex.log_content || ">>> 等待进程响应中...\n";
        
        // Autoscroll to bottom if log page is active
        term.scrollTop = term.scrollHeight;

        // Render meta details
        const startTime = new Date(ex.start_time).toLocaleString();
        const duration = ex.end_time ? formatDuration(ex.start_time, ex.end_time) : "进行中...";
        document.getElementById("log-meta").textContent = `执行 ID: #${ex.id} | 开始于: ${startTime} | 持续时长: ${duration}`;

        // Stop polling if completed
        if (ex.status !== "pending" && ex.status !== "running") {
            if (logPollingInterval) {
                clearInterval(logPollingInterval);
                logPollingInterval = null;
            }
            // Add final artifacts list if success
            renderArtifacts(ex.artifacts);
        }
    } catch (err) {
        document.getElementById("log-terminal").textContent += `\n[获取状态异常: ${err.message}]\n`;
        if (logPollingInterval) {
            clearInterval(logPollingInterval);
            logPollingInterval = null;
        }
    }
}

function renderArtifacts(artifactsJsonString) {
    const container = document.getElementById("artifacts-container");
    container.innerHTML = "";

    try {
        const artifacts = JSON.parse(artifactsJsonString || "[]");
        if (artifacts.length === 0) {
            container.innerHTML = `<p class="text-xs text-slate-500 py-4 text-center">本次运行未产生任何附件产物。</p>`;
            return;
        }

        artifacts.forEach(art => {
            const sizeKB = (art.size / 1024).toFixed(1);
            const downloadUrl = `/api/artifacts/download?path=${encodeURIComponent(art.path)}`;
            
            // Check if it's an image
            let previewHtml = "";
            if (art.type.startsWith("image/")) {
                previewHtml = `
                    <div class="mt-2.5 rounded-lg overflow-hidden border border-slate-800 bg-slate-950">
                        <img src="${downloadUrl}" alt="${art.name}" class="w-full h-auto object-cover max-h-48 cursor-zoom-in" onclick="window.open('${downloadUrl}')">
                    </div>
                `;
            }

            container.innerHTML += `
                <div class="bg-slate-950/80 border border-slate-800 rounded-lg p-3 hover:border-brand-500/40 transition-all flex flex-col">
                    <div class="flex items-start justify-between gap-2">
                        <div class="truncate">
                            <span class="text-xs font-bold text-slate-200 block truncate" title="${art.name}">${art.name}</span>
                            <span class="text-[10px] text-slate-500 mt-0.5 block">${sizeKB} KB | ${art.type}</span>
                        </div>
                        <a href="${downloadUrl}" download="${art.name}" class="p-1.5 bg-slate-900 border border-slate-800 rounded hover:bg-brand-600 hover:text-white transition-colors shrink-0">
                            <i data-lucide="download" class="w-3.5 h-3.5"></i>
                        </a>
                    </div>
                    ${previewHtml}
                </div>
            `;
        });
        
        lucide.createIcons();
    } catch (err) {
        container.innerHTML = `<p class="text-xs text-rose-400 p-2">产物解析异常: ${err.message}</p>`;
    }
}

window.scrollLogToBottom = function() {
    const term = document.getElementById("log-terminal");
    term.scrollTop = term.scrollHeight;
};

// --- Helper Functions ---

function translateStatus(status) {
    const dict = {
        pending: "排队中",
        running: "运行中",
        success: "执行成功",
        failed: "执行失败"
    };
    return dict[status] || status;
}

function getStatusBadgeClass(status) {
    const dict = {
        pending: "bg-amber-500/10 text-amber-400 border border-amber-500/20",
        running: "bg-blue-500/10 text-blue-400 border border-blue-500/20",
        success: "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20",
        failed: "bg-rose-500/10 text-rose-400 border border-rose-500/20"
    };
    return dict[status] || "bg-slate-800 text-slate-300";
}

function formatDuration(startStr, endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    const diffMs = end - start;
    if (diffMs < 1000) return `${diffMs}ms`;
    const diffSec = (diffMs / 1000).toFixed(1);
    return `${diffSec}秒`;
}

function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#039;");
}
