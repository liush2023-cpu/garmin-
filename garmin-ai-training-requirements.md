# Garmin AI 个性化训练系统 — 开发需求文档

## 项目背景

基于现有 garth 项目（已实现 Garmin Connect 登录认证 + 训练计划推送）进行扩展，新增数据读取、本地 API 服务和 AI 分析能力，实现完整的"读取健康数据 → AI 分析 → 生成训练计划 → 推送到手表"闭环。

**现有能力（不需要改动）：**
- garth 账号认证登录
- 训练计划数据推送到 Garmin Connect

**目标：新增以下能力：**
1. 读取 Garmin 健康与运动数据
2. 本地 FastAPI 服务暴露数据接口
3. AI 分析身体状态，生成个性化训练建议

---

## 模块一：数据拉取模块

**文件名：** `data_puller.py`

**要求：** 基于 garth 已有的认证 session，调用 Garmin Connect API 拉取以下数据。

### 1.1 需要拉取的数据类型

| 数据类型 | Garmin API 端点 | 说明 |
|----------|-----------------|------|
| HRV 数据 | `/wellness-service/wellness/dailyHeartRateVariability` | 夜间 HRV 均值、RMSSD |
| 睡眠数据 | `/wellness-service/wellness/dailySleepData` | 睡眠分期、睡眠评分、总时长 |
| 身体电量 | `/wellness-service/wellness/bodyBattery/valuesForDay` | Body Battery 全天曲线 |
| 静息心率 | `/wellness-service/wellness/dailyHeartRate` | 每日静息心率 |
| 训练负荷 | `/metrics-service/metrics/maxmet/daily` | 急性/慢性训练负荷 |
| 运动活动 | `/activitylist-service/activities/search/activities` | 近期跑步/骑行等活动列表 |
| 单次活动详情 | `/activity-service/activity/{activityId}` | 单次活动的完整数据（配速、心率区间、步频等） |

### 1.2 函数接口要求

```python
# 所有函数接收 days 参数，默认拉取最近 14 天
def get_hrv_data(days: int = 14) -> list[dict]
def get_sleep_data(days: int = 14) -> list[dict]
def get_body_battery(days: int = 7) -> list[dict]
def get_resting_heart_rate(days: int = 14) -> list[dict]
def get_training_load(days: int = 28) -> list[dict]
def get_activities(limit: int = 20) -> list[dict]
def get_activity_detail(activity_id: str) -> dict
```

### 1.3 错误处理要求
- API 请求失败时记录日志，返回空列表，不中断程序
- 添加请求间隔（每次请求间隔 0.5s），避免触发 Garmin 限流
- 数据缓存到本地 SQLite（`cache.db`），同一天内同类数据不重复请求

---

## 模块二：本地 FastAPI 服务

**文件名：** `server.py`

**启动命令：** `uvicorn server:app --port 8000 --reload`

**要求：** 提供跨域支持（CORS allow_origins=["*"]），供前端 React artifact 调用。

### 2.1 API 端点列表

```
GET  /api/status          # 系统状态 + 最新身体电量和 HRV 摘要
GET  /api/hrv?days=14     # HRV 趋势数据
GET  /api/sleep?days=14   # 睡眠数据
GET  /api/body-battery?days=7   # 身体电量趋势
GET  /api/rhr?days=14     # 静息心率趋势
GET  /api/load?days=28    # 训练负荷数据
GET  /api/activities?limit=20   # 活动列表
GET  /api/activity/{id}   # 单次活动详情
GET  /api/readiness       # 综合今日训练准备度（0-100 分）
```

### 2.2 /api/readiness 端点计算逻辑

返回一个综合评分和分项指标，字段如下：

```json
{
  "score": 78,
  "level": "良好",
  "components": {
    "hrv_status": "正常",       // 与个人基线对比
    "sleep_quality": "良好",    // 基于昨晚睡眠评分
    "body_battery": 65,         // 当前身体电量值
    "fatigue_load": "中等"      // 基于近 7 天训练负荷
  },
  "suggestion": "可进行中等强度训练，建议阈值跑或 M 配速长跑"
}
```

评分规则：
- HRV 高于个人 7 日均值 +5% 以上：+20 分
- HRV 在均值 ±5% 范围内：+10 分
- HRV 低于均值 -10% 以上：-10 分
- 睡眠评分 >75：+20 分；50-75：+10 分；<50：-5 分
- 身体电量 >70：+20 分；40-70：+10 分；<40：0 分
- 近 7 天训练负荷较低（急慢比 <0.8）：+10 分加成
- 近 7 天训练负荷过高（急慢比 >1.3）：-15 分

---

## 模块三：AI 分析引擎

**文件名：** `analyzer.py`

**说明：** 调用 Claude API（claude-sonnet-4-20250514），传入健康数据，返回训练建议。

### 3.1 用户训练背景（固定上下文，写入 system prompt）

```
用户训练背景：
- 当前 VDOT：约 42
- 目标 VDOT：48
- 目标比赛：全程马拉松，目标成绩 3小时30分
- 目标比赛日期：2025年11月
- 当前周跑量：40-50 km/周
- 轻松跑配速：5:30-6:00/km
- 阈值跑配速：4:30/km
- 训练体系：Jack Daniels VDOT 框架
- 训练阶段：基础期（以 E 跑和 M 跑为主）
- 近期问题：膝关节后内侧轻微过负荷，注意控制 I 跑和下坡跑
```

### 3.2 分析函数接口

```python
def analyze_weekly_plan(health_data: dict) -> dict:
    """
    输入：包含 hrv、sleep、body_battery、load、recent_activities 的 dict
    输出：{
        "readiness_summary": str,   # 身体状态总结（2-3句）
        "this_week_adjustment": str, # 本周训练调整建议
        "key_session": str,         # 本周重点课次建议
        "caution": str,             # 需要注意的事项
        "updated_vdot": float       # 基于近期活动数据的 VDOT 估算（如有足够数据）
    }
    """
```

### 3.3 Prompt 模板

```
以下是用户过去 14 天的健康和训练数据：

【HRV 趋势】
{hrv_data}

【睡眠数据】
{sleep_data}

【身体电量】
{body_battery}

【近期训练负荷】
{load_data}

【最近5次跑步活动】
{recent_activities}

请基于以上数据和用户训练背景，输出：
1. 当前身体状态评估（疲劳程度、恢复状况）
2. 本周训练量和强度调整建议（相比标准计划是否需要升/降）
3. 本周最重要的一次训练课次具体安排（类型、距离、目标配速）
4. 需要特别注意的事项

请用简洁中文回答，每项不超过3句话。
```

---

## 模块四：数据缓存模块

**文件名：** `cache.py`

**说明：** 基于 SQLite，避免频繁调用 Garmin API。

### 4.1 缓存策略

| 数据类型 | 缓存有效期 |
|----------|-----------|
| HRV、睡眠、静息心率 | 当日数据缓存 24 小时 |
| 身体电量 | 缓存 1 小时 |
| 训练负荷 | 缓存 24 小时 |
| 活动列表 | 缓存 2 小时 |
| 活动详情 | 永久缓存（历史数据不变） |

### 4.2 表结构

```sql
CREATE TABLE cache (
    key TEXT PRIMARY KEY,       -- "{data_type}_{date}" 或 "{data_type}_{id}"
    data TEXT NOT NULL,         -- JSON 字符串
    fetched_at INTEGER NOT NULL -- Unix 时间戳
);
```

---

## 项目文件结构

```
garmin-ai-trainer/
├── main.py              # 入口：初始化 garth 认证，启动服务
├── server.py            # FastAPI 服务
├── data_puller.py       # Garmin 数据拉取
├── analyzer.py          # AI 分析引擎
├── cache.py             # SQLite 缓存
├── config.py            # 配置（用户背景信息、VDOT 参数等）
├── requirements.txt     # 依赖
└── README.md            # 启动说明
```

---

## 依赖清单（requirements.txt）

```
garth>=0.4.0
fastapi>=0.110.0
uvicorn>=0.27.0
anthropic>=0.25.0
aiohttp>=3.9.0
python-dotenv>=1.0.0
```

---

## 环境变量（.env 文件）

```
ANTHROPIC_API_KEY=your_key_here
GARMIN_EMAIL=your_garmin_email
GARMIN_PASSWORD=your_garmin_password
```

---

## 启动流程

```bash
# 安装依赖
pip install -r requirements.txt

# 首次运行（garth 登录认证）
python main.py --login

# 启动本地服务
python main.py
# 或
uvicorn server:app --port 8000 --reload

# 访问
# http://localhost:8000/api/status    查看系统状态
# http://localhost:8000/api/readiness 查看今日训练准备度
# http://localhost:8000/docs          FastAPI 自动文档
```

---

## 注意事项

1. **Garmin API 限流**：每次请求之间加 0.5s 间隔，同类数据使用缓存，每天完整刷新不超过 3 次
2. **garth 认证维护**：garth 会自动刷新 token，但建议每 30 天重新登录一次
3. **现有推送代码**：不要修改原有的训练计划推送逻辑，新模块独立添加
4. **API 端点兼容性**：Garmin Connect API 非官方公开，端点可能变化，建议加异常捕获并记录原始响应便于调试
