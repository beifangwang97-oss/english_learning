# CODEX 项目总览（唯一 Agent 文档）
更新时间：2026-04-13  
适用目录：`d:\zip`

本文件已合并原 `CODEX_LOG.md` 与 `DAILY_SYNC.md`。  
从现在开始，项目状态、规则、交接、每日收尾都只维护这一个文档。

---

## 1. 项目一句话
Kinetic Scholar（虎子英语）是一个 K12 英语学习平台，采用前后端分离 + Java 微服务架构，包含管理员端、教师端、学生端，以及教材提取/音频生成工具链。

---

## 2. 当前架构与端口

### 2.1 微服务
- `config-server`：`8888`
- `api-gateway`：`8080`
- `user-service`：`8081`
- `learning-content-service`：`8082`
- `test-service`：`8083`
- `front`（Vite）：`3000`

### 2.2 网关路由
- `/api/users/**` `/api/stores/**` `/api/lexicon/**` -> `user-service`
- `/api/learning/**` -> `learning-content-service`
- `/api/tests/**` -> `test-service`

---

## 3. 代码目录速览（Agent 首看）

- `backend/`：Spring Boot 微服务（业务主干）
- `front/`：React + TS 前端（管理员/教师/学生三端）
- `tool/`：Streamlit 工具，负责教材内容提取、结构化、音频生成
- `run_all.ps1` / `run_all.bat`：一键启动
- `stop_all.bat`：按端口一键停服
- `docker-compose.yml`：PostgreSQL + Redis（基础依赖）

---

## 4. 现状功能（按角色）

### 4.1 管理员端（`/admin/dashboard`）
- 账号管理（增删改查）
- 门店管理（编码、容量、教材/年级权限）
- 词库管理（单词/短语）
- 管理控制台

关键前端入口：
- `front/src/pages/AdminDashboard.tsx`
- `front/src/components/admin/*`

### 4.2 教师端（`/teacher/dashboard`）
- 控制台实时查看本门店学生在线状态
- 教学任务（单元任务下发）
- 单词测试发布/查看/删除
- 单词复习发布/查看/删除（新增链路）
- 本门店学生权限与账号管理
- 学情分析

关键前端入口：
- `front/src/pages/TeacherDashboard.tsx`
- `front/src/components/teacher/TeachingUnits.tsx`
- `front/src/components/teacher/TeacherWordTest.tsx`
- `front/src/components/teacher/TeacherWordReview.tsx`
- `front/src/components/teacher/PermissionsManagement.tsx`
- `front/src/components/teacher/LearningAnalytics.tsx`

### 4.3 学生端（`/student/dashboard`）
- 控制面板、打卡、单元列表
- 音标学习
- 单元学习（单词/短语四环节引擎 + 会话进度落库）
- 单词测试任务（待完成/已完成 + 提交）
- 单词复习任务（按日会话）
- 错题本入口（UI 有，深度联动可继续补）

关键前端入口：
- `front/src/pages/StudentDashboard.tsx`
- `front/src/pages/StudentUnit.tsx`
- `front/src/components/student/WordTestView.tsx`
- `front/src/components/student/WordReviewView.tsx`
- `front/src/components/student/PhoneticsView.tsx`

---

## 5. 认证与会话（当前已落地）

- 前端使用 `sessionStorage` 存储 token/user（标签页隔离）
- 登录后根路由按角色重定向到各自 dashboard
- 网关全局 `SessionValidationFilter` 对 `/api/**` 做会话校验（登录/注册白名单除外）
- `user-service` 会话机制：
  - 登录签发带 `sid` 的 JWT
  - 新登录会撤销同账号旧会话（严格单端在线）
  - 支持 `logout` 与按用户批量撤销会话
  - 账号停用/到期/删除会触发会话失效

关键后端文件：
- `backend/user-service/src/main/java/com/kineticscholar/userservice/controller/UserController.java`
- `backend/user-service/src/main/java/com/kineticscholar/userservice/service/impl/SessionAuthServiceImpl.java`
- `backend/api-gateway/src/main/java/com/kineticscholar/apigateway/config/SessionValidationFilter.java`

---

## 6. 业务规则（当前代码口径）

### 6.1 账号与门店
- 教师仅可操作“本门店”学生
- 学生/教师账号手机号与用户名一致（11 位手机号）
- 学生需有效教材版本、年级、到期日
- `active=false` 或到期后禁止登录

### 6.2 单词测试
- 支持发布到多学生，多 scope
- 存储并展示 `passScore`、`attemptCount`
- 成绩口径：以“最高分优先；同分取更短耗时”为 best
- 状态口径：`bestScore >= passScore` 才算 `completed`

### 6.3 单词复习（新增）
- 教师发布复习任务：每日配额 + 环节开关（拼写/汉译英）
- 学生按日生成复习会话
- 按词进度（reviewCount/correct/wrong/streak/mastered）持久化
- 当日完成后 `todayDone=true`，全词 mastered 后任务 completed

### 6.4 单元学习进度
- 学生单元内分组学习进度（session + group-progress）落库
- 支持恢复学习现场与分组完成时长统计

---

## 7. 词库与学习内容接口面

### 7.1 词库（`user-service`）
- 词库标签选项、任务树、导入/校对 JSONL、保存词条
- 学习摘要与分组拉取（供学生端学习引擎）
- 音频文件访问接口

关键文件：
- `backend/user-service/src/main/java/com/kineticscholar/userservice/controller/LexiconController.java`
- `front/src/lib/lexicon.ts`

### 7.2 学习内容（`learning-content-service`）
- Unit / Word / Phrase / Reading / Quiz CRUD
- 目前学生端单元学习主链路更依赖 lexicon 接口

关键文件：
- `backend/learning-content-service/src/main/java/com/kineticscholar/learningcontentservice/controller/LearningContentController.java`

---

## 8. 工具链（`tool/app.py`）当前能力

`tool/app.py` 是 Streamlit 工具，当前已包含多标签页流程：
- PDF 预处理（左右分栏裁切配置）
- 词汇提取（两阶段提取 + schema 校验 + 单条重试）
- JSONL 音频补全与状态管理
- JSONL 转 PDF 导出
- 单元结构提取（unit / unit_title / unit_desc_short）
- 课文提取（支持多 TXT 与多 PDF 自动匹配、实时增量写入）

关键目录：
- `tool/word_data/`（已录音/未录音）
- `tool/passage_audio/`
- `tool/structure_data/`（运行时生成）
- `tool/runs/`（运行记录）

---

## 9. 运行与联调

### 9.1 一键启动
- `run_all.bat` -> 调用 `run_all.ps1`
- 启动顺序：`config-server -> user-service -> learning-content-service -> test-service -> api-gateway -> front`
- 脚本会检查端口监听并输出日志目录 `runlogs/`

### 9.2 一键停服
- `stop_all.bat`：按端口 8888/8080/8081/8082/8083/3000 强停

### 9.3 基础依赖
- `docker-compose.yml`：`postgres:14`（映射 `5433`）+ `redis:7`（`6379`）

---

## 10. 当前工作区状态（按“现在”）

以下是本地仓库当前真实状态（包含未提交改动）：
- 已存在大量 `backend/test-service`、`front`、`tool` 改动与新增文件
- 单词复习相关 DTO / Model / Repository / 前端组件已处于在库状态（未完全提交）
- 文档层面：本次已将 `DAILY_SYNC.md` 合并入本文件，并删除 `DAILY_SYNC.md`

建议后续任何 agent 先执行：
1. `git -C d:\zip status --short` 了解脏工作区范围  
2. 再决定“仅改当前任务文件”还是“连带整理历史未提交改动”

---

## 11. 每日收尾（原 DAILY_SYNC 合并）

每天收尾必须做：
1. 更新本文件（记录当天改动、关键决策、风险和待办）
2. 执行：
   - `git -C d:\zip status`
   - `git -C d:\zip add -A`
   - `git -C d:\zip commit -m "feat/fix/docs: <当日摘要>"`
   - `git -C d:\zip push`

推送失败不可跳过：
- 先处理认证/网络/冲突，再结束当天工作

---

## 12. 统一协作规范（编码与中文主导）

### 12.1 文件编码（强制）
- 仓库内所有文本文件统一使用：`UTF-8（无 BOM）`
- 禁止混用 `GBK/ANSI/UTF-16` 等编码
- 新建文件默认 UTF-8，无特殊原因不改
- 如发现乱码，优先修复编码再继续功能开发

### 12.2 文案语言（强制）
- 面向业务用户（管理员/教师/学生）的 UI 文案以中文为主
- 错误提示、按钮、表头、弹窗、校验信息默认中文
- 接口字段名、协议字段、第三方固定术语保持英文，不做翻译
- 若页面出现英文占位或乱码，提交前必须修复

### 12.3 代码与注释语言建议
- 业务注释优先中文（必要时中英并列）
- 变量/函数/类名按现有项目风格保持英文技术命名
- 不引入无意义缩写，命名以可读为先

### 12.4 提交与文档一致性
- 每次功能改动后同步更新本文件对应章节
- 未更新文档不得标记“完成”
- 文档与代码冲突时，以“当前代码真实行为”为准并及时回写文档

---

## 13. 下次会话标准起手

```text
请先阅读 d:\zip\CODEX_LOG.md，并基于当前 git status 的真实工作区状态继续开发；
先确认服务端口与关键接口可用，再进入功能修改。
```
## 14. 迭代更新（2026-04-13 ~ 2026-04-14）

### 14.1 工具端结构与模式拆分
- 已将原 `tool/app.py` 的多模式能力拆分为独立入口文件：
  - `mode0_pdf_preprocess.py`
  - `mode1_pdf_extract_review.py`
  - `mode2_jsonl_audio.py`
  - `mode3_jsonl_to_pdf.py`
  - `mode4_unit_meta_extract.py`
  - `mode5_passage_extract.py`
- 每个模式可单独运行，便于并行开发与排障。

### 14.2 模式一（词汇提取）关键修复
- 修复“实时回传中音频试听串读/展示错位”的相关链路问题（生成侧与展示侧排查并修正）。
- 增加多 API 输入能力（动态增减输入框），支持同模型下多 key 并行分配。
- 提取进度中加入 API 序号展示，支持任务分配可视化。
- 修复批量提取时“展示教材名与实际写入文件错配”问题，确保任务-文件一一对应。
- 统一输出命名与标签来源：
  - 输出名按源文件 + 类型 + 时间戳。
  - `book_version / grade / semester` 从源 PDF 文件名自动分割。
- 增加开始/暂停控制：
  - 开始后按钮置灰，避免重复触发导致近时间戳重复文件。
  - 暂停后尽快停止后续处理并保留已产出内容。
- 降低与收敛重试策略（将关键 LLM 重试降至 1 次），缩短停机与中断等待时间。
- 修复 JSON 解析容错问题（针对逗号/引号等脏响应做兜底处理）。

### 14.3 模式四（单元信息提取）升级
- 侧边栏改为与模式一一致：多 API 动态输入 + 一键测试 + 同模型配置。
- 开始/暂停按钮行为与模式一统一（开始置灰、暂停可触发中止）。
- 支持批量 PDF，且“页码范围”按文件逐一配置。
- 三标签自动来源统一为源 PDF 文件名分割，不再人工输入。
- 输出目录调整为：`tool/word_data/unit_data/`。
- 输出格式精简为：
  - 首行 `record_type=meta`，仅出现一次：`book_version/grade/semester/source_pages`
  - 后续每行 `record_type=unit`：仅保留 `unit/unit_title/unit_desc_short`
- 修复 JSONL 换行写入问题（由字面量 `\\n` 改为真实换行 `\n`）。

### 14.4 模式五（课文提取）升级
- 侧边栏与模式一统一（多 API、测试、同模型）。
- 开始/暂停按钮行为统一（开始置灰、暂停可中止）。
- 三标签自动由源 PDF 文件名分割，并写入每条课文记录。
- 并发处理时确保“任务-输出文件”严格绑定，避免错写。
- 输出命名规则：
  - `{book_version}_{grade}_{semester}_课文_{时间戳}_{任务序号}.jsonl`
- 修复写文件换行与文本拼接换行问题（统一真实换行）。

### 14.5 编码与文案规范
- 文档与代码持续执行“UTF-8 + 中文主体”规范。
- 本轮修复了因批量替换引入的 API 调用误改（如 `st.error` 被错误替换）。

### 14.6 当前建议
- 继续以 `CODEX_LOG.md` 作为唯一交接文档。
- 每轮改动后先执行 `py_compile` 与关键流程小样本回归，再集中提交。

## 15. 迭代更新（2026-04-14 管理端词库/教材管理）

### 15.1 单词/短语词库管理增强
- 新增按教材范围删除与删除预览：
  - `GET /api/lexicon/items/delete-preview`
  - `DELETE /api/lexicon/items`
- 新增导入前数量检查：
  - `GET /api/lexicon/items/count`
- 词库导入改为批量 JSONL：
  - 支持多文件上传、逐文件校验、逐文件状态展示。
  - 从文件名自动识别 `bookVersion/grade/semester`。
  - `全一册` 与 `全册` 统一映射为 `全册`。
  - 单词页仅允许单词表，短语页仅允许短语表，课文表在该页拦截。
  - 不支持覆盖导入：若同标签已有数据，提示先删除再导入。
- 兼容旧后端：
  - `items/count` 返回 404 时，前端降级用 `items` 结果计算数量，避免 Not Found 阻塞导入。

### 15.2 教材管理（新）
- 新增“教材管理”页面与侧栏入口。
- 新增教材-年级-册数关系表：`textbook_scope_tags`（唯一键：教材+年级+册数）。
- 新增教材管理接口：
  - 查询结构：`GET /api/lexicon/tags/textbook-scopes`
  - 新增教材：`POST /api/lexicon/tags/textbook-scopes/textbooks`
  - 教材重命名：`PUT /api/lexicon/tags/textbook-scopes/textbooks/rename`
  - 新增/删除年级：`POST/DELETE /api/lexicon/tags/textbook-scopes/grades`
  - 新增/删除册数：`POST/DELETE /api/lexicon/tags/textbook-scopes/semesters`
  - 删除教材：`DELETE /api/lexicon/tags/textbook-scopes/textbooks`
- 默认结构规则更新：
  - 年级默认改为：三年级~九年级 + 高一/高二/高三。
  - 每个年级默认册数：上册/下册。
  - 全册需手动添加。

### 15.3 教材管理交互优化
- 教材支持折叠/展开，默认收起。
- 年级卡片布局压缩，减少中间留白。
- 册数支持：
  - 单项开关（上册/下册/全册）
  - 一键预设（常规上/下、仅全册、清空）
- 操作失败改为弹窗提示（同时保留页面错误区）。
- 册数切换改为本地即时更新，减少整页刷新与回到顶部。

### 15.4 稳定性修复
- 修复删除册数时报错：`No EntityManager with actual transaction available...`
  - 对教材管理删除接口增加事务。
- 修复“删了上/下册又自动恢复”的问题：
  - 仅在教材完全没有任何 scope 记录时才补默认 scope，不再覆盖管理员手动删改。

### 15.5 当前已知边界
- 标签删除占用阻断已覆盖：词库、账号、门店权限。
- “任务占用明细（精确到门店学生任务）”尚未接入 test-service 联查，后续补齐。
