# Garmin AI 训练计划导入工具

粘贴/导入 AI 生成的跑步训练计划 → 预览/编辑 → 同步到 Garmin Connect（手表自动同步）。

支持两种导入方式：
- **A：自然语言解析** —— 粘贴自然语言描述的训练计划，调用你自己配置的大模型 API（DeepSeek / 通义千问 / Moonshot 等任意 OpenAI 兼容接口）解析为结构化数据，自动提取目标配速和目标心率
- **B：导入 JSON** —— 直接粘贴/上传符合工具结构的 JSON（页面上有结构示例，可以喂给任意 AI 工具直接生成）

所有数据只在你的浏览器和你部署的服务之间传递；Garmin 账号密码、模型 API Key 都不会落盘存储。

## 本地运行

```bash
# 终端 1：后端 API（端口 4000）
cd server
npm install
npm run dev

# 终端 2：前端页面（端口 5173，已配置代理转发 /api 到后端）
cd client
npm install
npm run dev
```

打开 http://localhost:5173

## 使用步骤

1. （可选）在"第一步 A"中选择模型服务商、填入 API Key，粘贴自然语言计划文本，点击"解析计划"；或在"第一步 B"中直接粘贴/上传 JSON
2. 在预览表格中检查/编辑每一项训练（类型、距离、时长、配速、心率等）
3. 选择账号区域（中国区/国际区），登录 Garmin 账号，点击"同步到手表"

## 部署到云端（手机随时访问）

项目已配置为单服务部署：Express 后端同时托管构建后的前端静态文件 + API。

### 用 Render 部署（推荐）

1. 把本项目推到 GitHub 仓库
2. 在 [Render](https://render.com) 新建 Web Service，选择该仓库，Render 会自动识别 `render.yaml`（基于 `Dockerfile` 构建）
3. 部署完成后会得到一个 `https://xxx.onrender.com` 形式的网址，手机浏览器直接访问即可

### 本地构建 Docker 镜像测试

```bash
docker build -t garmin-trainer .
docker run -p 4000:4000 garmin-trainer
```

打开 http://localhost:4000 即可看到完整应用（前端+后端同源）。

## 注意事项

- Garmin 同步使用非官方的 `garmin-connect` 库登录网页接口，可能因 Garmin 改版而失效；登录态保存在服务进程内存中，重启服务后需要重新登录
- 模型 API Key 由前端直接传给后端，再由后端转发给你选择的模型服务商，不写入磁盘、不留存
- 自然语言解析功能需要你自行准备一个 OpenAI 兼容的大模型 API（如 DeepSeek、通义千问等），按量计费，单次解析成本通常在几厘到几分钱
