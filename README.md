# Garmin AI 训练计划导入工具

将 AI 生成的跑步训练计划一键同步到 Garmin Connect，支持配速目标、心率目标和重复组结构。

## 功能

- **文本解析**：粘贴自然语言训练计划，AI 解析为结构化课表
- **JSON 导入**：直接导入或上传符合格式的 JSON 文件
- **AI 生成**：按 VDOT + 训练目的，由 AI 依据 Jack Daniels 理论生成课表
- **VDOT 估算**：按比赛成绩估算跑力，推算 E/M/T/I/R 各配速区间
- **同步到 Garmin**：支持配速目标、心率目标、重复组（N 组 × M 步骤）
- **合理性检查**：自动检测 AI 内容中距离/时长/配速不自洽的问题
- **周跑量统计**：显示总距离、总时长、一周跑步次数
- **健康数据分析**：查看 HRV、睡眠、身体电量等 Garmin 健康指标

> ⚠️ **仅供个人使用**：Garmin 登录态保存在服务器进程内存中，不适合多人共用同一实例。

---

## 快速开始：本地运行

### 前置要求

- Node.js 20+
- npm

### 1. 配置环境变量（可选）

在 `server/` 目录创建 `.env` 文件：

```env
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=sk-xxxxx
LLM_MODEL=deepseek-chat
```

也可以不配置，直接在界面右上角「⚙ 设置」里填写。

### 2. 安装依赖

```bash
npm --prefix server install
npm --prefix client install
```

### 3. 启动开发服务器

打开两个终端：

```bash
# 终端 1：后端（4000 端口）
cd server && npm run dev

# 终端 2：前端（5173 端口，/api 自动代理到 4000）
cd client && npm run dev
```

浏览器打开 `http://localhost:5173`

### 4. 生产构建

```bash
npm --prefix client run build   # 输出到 client/dist/
npm --prefix server run build   # 输出到 server/dist/
node server/dist/index.js       # 后端同时托管前端静态文件
```

访问 `http://localhost:4000`

---

## Docker 运行

```bash
# 构建镜像
docker build -t garmin-trainer .

# 启动容器
docker run -p 4000:4000 \
  -e LLM_BASE_URL=https://api.deepseek.com/v1 \
  -e LLM_API_KEY=sk-xxxxx \
  -e LLM_MODEL=deepseek-chat \
  garmin-trainer
```

访问 `http://localhost:4000`

### 环境变量说明

| 变量 | 说明 | 是否必须 |
|------|------|----------|
| `LLM_BASE_URL` | OpenAI 兼容接口地址（DeepSeek、通义等） | 推荐 |
| `LLM_API_KEY` | LLM API Key（不会暴露给前端） | 推荐 |
| `LLM_MODEL` | 模型名称，如 `deepseek-chat`、`qwen-plus` | 推荐 |
| `PORT` | 服务端口，默认 `4000` | 否 |

> `LLM_API_KEY` 仅在服务端使用，不会返回给浏览器。前端也可填写自己的 Key，该 Key 从浏览器直接发给模型服务商，不经过本服务器。

---

## Render 部署

项目自带 `render.yaml`，支持一键 Docker 部署。

### 步骤

1. Fork 本仓库到你的 GitHub 账号
2. 登录 [render.com](https://render.com)，点击 **New → Blueprint**
3. 连接 GitHub 仓库，Render 会自动识别 `render.yaml`
4. 在 Dashboard 配置环境变量（`LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`）
5. 点击 Deploy

> Render 免费套餐在不活跃 15 分钟后休眠，首次请求有约 30s 冷启动延迟。

### 手动创建 Web Service

| 设置项 | 值 |
|--------|-----|
| Environment | Docker |
| Dockerfile Path | `./Dockerfile` |
| Port | `4000` |

---

## 技术栈

- **前端**：React 19 + Vite + TypeScript
- **后端**：Express + TypeScript（ESM）
- **Garmin 同步**：[garmin-connect](https://github.com/6br/garmin-connect) v1.6.2（非官方 API）
- **部署**：单容器，后端同时托管前端静态文件

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/parse` | POST | 自然语言 → 结构化训练计划 JSON |
| `/api/generate` | POST | 按 VDOT + 目标生成课表 |
| `/api/garmin/login` | POST | Garmin 账号登录 |
| `/api/garmin/restore` | POST | 从 OAuth Token 恢复会话 |
| `/api/garmin/status` | GET | 查询登录状态 |
| `/api/garmin/logout` | POST | 退出登录 |
| `/api/sync` | POST | 同步训练计划到 Garmin Connect |
| `/api/garmin/delete-workouts` | POST | 删除已同步的训练（撤销） |
| `/api/health/*` | GET | Garmin 健康数据（HRV、睡眠等） |
| `/api/config` | GET | 读取服务端 LLM 配置（不含 Key） |

## Garmin 同步注意事项

- 使用 Garmin 非官方 API，不保证长期稳定，Garmin 更新可能导致同步失败
- 同步成功的训练会出现在 Garmin Connect「计划训练」列表，并在日历标记
- 支持一键撤销（删除本次同步的所有训练）
- **密码不存储**，OAuth Token 保存在浏览器 localStorage，服务器重启后需重新登录
- 中国区账号选 `garmin.cn`，国际区选 `garmin.com`
