# LiteFlow - 轻量级脚本调度平台实现说明

我们已成功为您构建了 **LiteFlow**（轻量级 Python 脚本调度与依赖隔离平台）的全部核心代码。为了最大化降低您的运维部署成本，我们将前端与后端进行了**一体化设计**：前端采用现代化的单文件 Web SPA (HTML/JS)，直接由 FastAPI 后端静态托管。这意味着您只需运行一个 Python 进程即可启动整个平台！

---

## 🛠️ 项目结构

平台代码已写入您的工作区 `C:/Projects`，主要包含以下文件：

### 1. 后端核心
- [database.py](file:///C:/Projects/backend/database.py): 配置 SQLAlchemy 使用轻量级 SQLite 数据库。
- [models.py](file:///C:/Projects/backend/models.py): 定义 `Script`（存储脚本及调度信息）和 `Execution`（存储运行日志与产生的附件）。
- [schemas.py](file:///C:/Projects/backend/schemas.py): Pydantic 字段验证。
- [runner.py](file:///C:/Projects/backend/runner.py): **核心执行引擎**。负责为每个脚本分配物理工作目录，动态创建 Python `venv`，检查并用 Pip 隔离安装所需的依赖包，在子进程中执行脚本，实时捕获日志输出，并提取执行过程中新产生的文件（如 Matplotlib 图表）作为产物归档。
- [scheduler.py](file:///C:/Projects/backend/scheduler.py): 基于 `APScheduler` 的后台 Cron 调度管理器，支持在网页端开关任务时动态添加或移除 Job。
- [main.py](file:///C:/Projects/backend/main.py): FastAPI 路由接口，并静态托管前端资源。

### 2. 前端界面
我们为您打造了一个极具现代感的暗色调（Dark Mode）管理面板：
- [index.html](file:///C:/Projects/backend/static/index.html): 包含统计数据面板、脚本管理列表、实时日志查看终端、生成的图表产物展示区。
- [app.js](file:///C:/Projects/backend/static/app.js): 前端核心交互逻辑，利用 CDN 加载 **Monaco Editor**（VS Code 的网页核心编辑器）提供极致的 Python 代码编辑体验，支持日志轮询及图片产物的直接预览。

---

## 🚀 启动与运行指南

要启动 LiteFlow 平台，您只需在终端中执行以下两步：

### 第一步：安装平台依赖
在 `C:/Projects/backend` 目录下，激活您的虚拟环境并安装运行平台所需的库：

```bash
# 1. 激活我们为您创建的虚拟环境（Windows PowerShell）
C:\Projects\backend\venv\Scripts\Activate.ps1

# 2. 安装平台核心依赖
pip install -r C:\Projects\backend\requirements.txt
```

### 第二步：运行 FastAPI 平台
依赖安装完毕后，启动 Uvicorn 服务：

```bash
# 在 C:\Projects\backend 路径下执行
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

启动后，您可以在浏览器中直接访问：
👉 [http://127.0.0.1:8000](http://127.0.0.1:8000) 进入平台管理后台。
👉 [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs) 查看交互式 API 文档。

---

## 💡 平台特色功能演示建议

当您进入网页端后，可以尝试以下操作来测试平台的“依赖隔离”和“产物追踪”功能：

1. **新建脚本**：点击右上角 **“新建脚本”**，弹出的编辑器默认提供了一个预设模版。
2. **配置依赖**：在右侧的依赖框中，输入需要用到的科学计算和绘图库：
   ```text
   numpy
   pandas
   matplotlib
   ```
3. **设置调度**：在 Cron 输入框中填入 `*/2 * * * *` （每 2 分钟运行一次），并点击**“保存”**。
4. **运行测试**：在列表中找到您的脚本，点击 **“立即运行 (Play)”**。弹出的终端会实时为您展示如下进度：
   - 检查并创建 `C:/Projects/backend/scripts/script_1/venv`
   - 使用 pip 隔离安装 `numpy`, `pandas`, `matplotlib`
   - 启动 python 运行 `script.py` 并收集 stdout 输出。
5. **实时日志与图表预览**：
   - 运行完成后，终端日志下方会**自动出现生成的图表预览**（`chart_demo.png` 波动折线图），无需下载即可直观查看！您也可以点击下载按钮获取原文件。

---

## 📊 自动化验证结果与界面演示

我们通过自动化浏览器子代对平台进行了端到端（E2E）的黑盒验证，测试非常成功。以下是验证的关键节点截图：

### 1. 初始化控制大盘
打开平台首页，系统正常运行，SQLite 数据库初始化就绪。
![初始化仪表盘](C:/Users/hmy82/.gemini/antigravity-ide/brain/09264d2e-a4b7-4b32-bb47-fc223c0273aa/dashboard_loaded_1781811799724.png)

### 2. 编写 Python 脚本与配置依赖
点击“新建脚本”，我们在 Monaco 编辑器中输入了测试代码，并声明需要 `numpy` 与 `matplotlib` 依赖：
![编写脚本与配置依赖](C:/Users/hmy82/.gemini/antigravity-ide/brain/09264d2e-a4b7-4b32-bb47-fc223c0273aa/modal_fields_filled_1781811849560.png)

### 3. 运行环境隔离与产物自动渲染
手动点击“立即运行”，后台自动创建全新的 Python `venv` 虚拟环境，使用默认源执行 `pip install`，运行脚本，并**成功捕捉和渲染**出了生成的正弦波图表 `chart_demo.png`：
![运行日志与图表产物](C:/Users/hmy82/.gemini/antigravity-ide/brain/09264d2e-a4b7-4b32-bb47-fc223c0273aa/script_execution_success_1781811970820.png)

### 4. 仪表盘指标自动更新
运行结束后，首页的脚本总数、今日运行次数、执行成功率（100%）和历史列表均实时刷新：
![最新仪表盘指标](C:/Users/hmy82/.gemini/antigravity-ide/brain/09264d2e-a4b7-4b32-bb47-fc223c0273aa/final_dashboard_screenshot_1781811986832.png)
