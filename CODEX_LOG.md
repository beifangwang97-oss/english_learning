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

### 15.6 严格联动（教材管理 -> 词库筛选/导入）
- 词库页（单词/短语）完成三标签严格联动：
  - 教材版本变更后，年级下拉仅展示该教材配置的年级。
  - 年级变更后，册数下拉仅展示该教材+年级配置的册数。
  - 不再直接展示全局“上册/下册/全册”。
- 批量导入弹窗完成同规则联动：
  - 每行文件的“年级/册数”选项根据该行教材版本动态收敛。
  - 修改教材/年级时自动纠正到合法组合，避免非法标签残留。
- 导入校验升级为“组合级”校验：
  - 除校验标签存在外，新增 `教材+年级+册数` 组合是否在教材管理中配置的校验。
  - 未配置组合直接拦截导入并提示先在教材管理中配置。

---

## 16. 2026-04-14 工作纪要（新增）

### 16.1 课文数据与数据库兼容
- 新增并落地课文主表/句子表能力：
  - Passage
  - PassageSentence
  - PassageRepository
  - PassageController
- 修复 `newline_after` 列历史库兼容问题：新增启动自修复 `PassageSchemaMigrationRunner`。
- 启动时自动执行：补列 -> 回填 0 -> 设默认值 -> 设 NOT NULL。

### 16.2 管理员端课文管理
- 新增管理员课文管理页面：`front/src/components/admin/PassageManagement.tsx`。
- 支持课文 JSONL 批量导入、单册删除、可视化编辑。
- 句子级字段支持展示与编辑（含段落与换行相关字段）。
- 教材版本/年级/册次与课文数据范围关联完成。

### 16.3 段落换行与句子交互
- 后端导入时支持识别并写入：单换行、双换行（段落换行）。
- 学生端渲染按 `newline_after` / `is_paragraph_end` 保持段落结构。

### 16.4 学生端课文阅读体验优化
- 阅读模块接入真实课文数据，按单元展示，仅显示当前单元课文。
- 支持单句音频、整篇音频顺序播放、本篇学完打点。
- 展示交互升级：
  - 单句译文：点击句侧“译”，在点击位置下方悬浮卡片显示（不打断正文）。
  - 整篇译文：左右对照双栏（左原文、右译文），段落结构一一对应。
  - 对照模式下动态放宽阅读容器，减少两侧空白。

### 16.5 稳定性与脚本排查
- 排查并修复重启后短时 Internal Server Error 相关问题。
- 对 `run_all.ps1` / `stop_all.bat` 做了联调与稳定性修正（端口/启动顺序/日志检查）。

### 16.6 本次主要变更文件
- 后端：
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/config/PassageSchemaMigrationRunner.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/controller/PassageController.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/model/Passage.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/model/PassageSentence.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/repository/PassageRepository.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/controller/LexiconController.java`
- 前端：
  - `front/src/components/admin/PassageManagement.tsx`
  - `front/src/pages/AdminDashboard.tsx`
  - `front/src/pages/StudentUnit.tsx`
  - `front/src/lib/lexicon.ts`
  - `front/src/lib/auth.ts`
- 脚本：
  - `run_all.ps1`
  - `stop_all.bat`

---

## 17. 2026-04-15 管理员端单元管理（新增）

### 17.1 单元目录唯一数据源
- 新增教材单元目录表对应实体：`TextbookUnit`
- 唯一键口径：`book_version + grade + semester + unit_code`
- 字段覆盖：
  - `unit_code`
  - `unit_title`
  - `unit_desc_short`
  - `sort_order`
  - `source_file`
  - `source_pages`
  - `active`
- 单元目录作为后续“单元”的唯一数据源，教师/学生侧树查询改由该表提供。

### 17.2 后端接口与规则
- 在 `LexiconController` 中新增单元管理接口：
  - `GET /api/lexicon/units`
  - `GET /api/lexicon/units/count`
  - `GET /api/lexicon/units/delete-preview`
  - `POST /api/lexicon/units`
  - `PUT /api/lexicon/units/{id}`
  - `DELETE /api/lexicon/units/{id}`
  - `DELETE /api/lexicon/units`
  - `POST /api/lexicon/units/import`
- `task-tree` 查询已切换为从 `textbook_units` 表读取单元树，不再从词库反推单元。
- 单元导入规则：
  - 仅接受模式四生成的单元 JSONL
  - 首行必须为 `record_type=meta`
  - `book_version/grade/semester` 必须与当前导入范围一致
  - 批量记录仅接收 `record_type=unit`
  - 同一文件内禁止重复单元
  - 当前前端导入采用“整册覆盖导入”

### 17.3 管理员端页面
- 新增页面：`front/src/components/admin/UnitManagement.tsx`
- 已接入管理员侧栏入口：`单元管理`
- 页面能力：
  - 按教材版本/年级/册次筛选
  - 单元列表查看
  - 单条新增、编辑、删除
  - JSONL 批量导入
  - 整册删除
- 交互风格与教材管理/课文管理保持一致，继续使用严格教材范围联动。

### 17.4 占用阻断与当前边界
- 删除单元、整册删除单元时，已阻断以下占用：
  - 单词词库
  - 短语词库
  - 课文
- 当前仍未接入 `test-service` 的单元任务占用联查，因此：
  - 单元任务占用明细尚未纳入删除阻断
  - 文案已在接口返回中明确标注为后续补充项
- 为避免误伤历史数据，当前若单元编号已被词库/课文引用，则后端禁止直接修改 `unit_code`。

### 17.5 本轮主要变更文件
- 后端：
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/model/TextbookUnit.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/repository/TextbookUnitRepository.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/controller/LexiconController.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/repository/LexiconEntryRepository.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/repository/PassageRepository.java`
- 前端：
  - `front/src/components/admin/UnitManagement.tsx`
  - `front/src/lib/lexicon.ts`
  - `front/src/pages/AdminDashboard.tsx`

### 17.6 学生端单元卡片改造
- 学生端单元列表页已切换为通过单元管理表读取卡片内容，不再仅依赖 `task-tree` 的 unit 名称拼装展示。
- 卡片左上角标签由“第 N 单元”改为直接显示数据库中的 `unit`，例如 `Unit 1`。
- `教材版本 + 年级 + 册数` 现在仅显示一行，且来源于单元管理表对应 scope。
- 卡片标题改为显示 `unit_title`。
- 卡片简介改为显示 `unit_desc_short`。
- 相关文件：
  - `front/src/pages/StudentDashboard.tsx`

### 17.7 学生端当前进度口径
- 先前学生端首页单元卡片中的 `progress` 为固定值 `0`，未接真实学习记录。
- 本轮已接入真实进度计算，当前口径为：
  - 单词进度：基于 `learning summary(word)` 与 `learning_group_progress(module=vocab)`
  - 短语进度：基于 `learning summary(phrase)` 与 `learning_group_progress(module=phrase)`
  - 课文进度：基于当前单元课文篇数与 `learning_group_progress(module=reading)`
- 卡片最终百分比口径：
  - `(单词已学 + 短语已学 + 课文已学) / (单词总数 + 短语总数 + 课文总数)`
- 当前进度仍基于 `unitId = bookVersion||grade||semester||unit` 这套主键口径。

### 17.8 停启脚本修正
- `run_all.ps1`
  - 启动前会先检查并清理受管端口：`8888/8080/8081/8082/8083/3000`
  - 各服务启动前会重置对应日志文件，避免旧日志干扰排查
  - 等待端口时增加“进程提前退出”检测，失败时会尽早返回并输出日志尾部，而不是长时间超时等待
  - 前端启动参数改为直接使用 `npm run dev`，避免重复传入 `--host/--port`
- `stop_all.bat`
  - 由 `taskkill /PID /F` 改为 `taskkill /PID /T /F`
  - 停服时会一起杀掉进程树，降低残留父子进程导致的假释放/假占用问题

### 17.9 本轮验证
- 前端：
  - `cmd /c npm run build` 通过
- 后端：
  - `mvn -q -DskipTests compile`（`backend/user-service`）通过

---

## 18. 2026-04-15 工具端音标数据与模式六（新增）

### 18.1 音标种子数据
- 新增音标种子文件：
  - `tool/word_data/phonetics_data/english_phonemes_seed.jsonl`
- 当前口径采用中国中小学英语教学常见版本：
  - `48` 个音标
  - `20` 个元音
  - `28` 个辅音
- 当前字段结构以模式六输入为准：
  - `id`
  - `type`
  - `phonetic`
  - `category`
  - `phoneme_audio`
  - `example_words`
- `phonetic` 统一要求使用双斜线包裹，如：`/i:/`、`/tʃ/`
- 当前阶段暂不生成音标本体单独配音，`phoneme_audio` 先保留空值，后续再补。

### 18.2 模式六（例词与单词录音）
- 新增独立工具入口：
  - `tool/mode6_phoneme_examples_audio.py`
  - `tool/run_mode6.bat`
- 模式六输入：
  - `tool/word_data/phonetics_data/english_phonemes_seed.jsonl`
- 模式六输出：
  - 默认在同目录输出工作文件：`*_mode6_working.jsonl`
  - 若工作文件已存在，则优先继续在该文件上续跑
- 模式六当前能力：
  - 已拆分为两个独立步骤：
    - 步骤一：补全例词
    - 步骤二：生成单词录音
    - 步骤三：生成音标录音
  - 对每个音标调用 LLM 生成 3 个常见、简单、适合中小学生的例词
  - 自动补齐 `example_words` 数组
  - 对每个例词调用 `edge_tts` 生成单词录音
  - 音频输出目录：
    - `tool/audio/phonetics/`
  - 音频命名规则：
    - `{id}_word_1.mp3`
    - `{id}_word_2.mp3`
    - `{id}_word_3.mp3`
  - `example_words` 中回填：
    - `word`
    - `phonetic`
    - `zh`
    - `word_audio`
- 执行方式已调整为“逐条同步写入”：
  - 每处理完 1 条音标，即刻写回 JSONL
  - 中途中断后，可直接基于工作文件续跑
- 当前已增加音标单独录音按钮：
  - 输出字段：`phoneme_audio`
  - 输出文件：`./audio/phonetics/{id}_phoneme.mp3`
  - 当前为实验性实现：通过“音标 -> 近似可读文本”映射交给 TTS 生成，先用于联调与页面接入
- 模式六侧栏已增加：
  - `直接覆盖源文件` 开关，默认开启
  - `录制音标音频时覆盖已有 phoneme_audio` 开关
- 模式六页面已增加试听区：
  - 可选择某一条音标记录
  - 可试听 `phoneme_audio`
  - 可试听 3 个例词对应的 `word_audio`

### 18.3 当前边界
- 模式六当前只处理“例词 + 单词录音”，不处理音标本体独立录音。
- LLM 例词生成已做基础合法性校验，但仍建议人工抽检少量结果，重点关注：
  - 例词是否足够常见
  - 例词音标是否准确
  - 目标音是否典型

### 18.4 本轮验证
- `tool/mode6_phoneme_examples_audio.py`
  - `py_compile` 通过

---

## 19. 2026-04-15 音标管理与学生端音标学习
### 19.1 管理员端音标管理
- 新增音标数据库实体与仓库
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/model/PhoneticSymbol.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/repository/PhoneticSymbolRepository.java`
- 在 `LexiconController` 中新增音标接口
  - `GET /api/lexicon/phonetics`
  - `POST /api/lexicon/phonetics`
  - `PUT /api/lexicon/phonetics/{phonemeUid}`
  - `DELETE /api/lexicon/phonetics/{phonemeUid}`
  - `DELETE /api/lexicon/phonetics/all`
  - `POST /api/lexicon/phonetics/import`
- 音标表作为后续统一音标数据源
- `example_words` 先按 JSON 文本落库，方便和现有 `jsonl` 工作流对齐
- 管理员端新增音标管理页面
  - `front/src/components/admin/PhoneticManagement.tsx`
- 后台导航接入音标管理
  - `front/src/pages/AdminDashboard.tsx`
- 管理能力已实现
  - 数据库导入 `jsonl`
  - 可视化查看
  - 新增 / 编辑 / 删除
  - 全部删除
  - 音标音频试听
  - 示例单词音频试听

### 19.2 管理员端音标管理优化
- 修复音标与例词试听失败
  - 后端音频解析新增 `tool/audio/phonetics/` 目录支持
- 优化管理页左右布局
  - 左侧列表改为固定高度
  - 左侧改为内部滚动
  - 适度加宽左侧列表，平衡左右区域比例

### 19.3 学生端音标学习第一版
- 学生端音标学习不做权限控制，所有学生可直接使用
- 学生端音标页由 mock 数据切换为数据库真实数据
  - `front/src/components/student/PhoneticsView.tsx`
- 第一版页面能力
  - 顶部学习页头图
  - 全部 / 元音 / 辅音筛选
  - 按 `20个元音`、`28个辅音` 分组展示
  - 点击音标查看详情
  - 音标试听
  - 三个例词展示
  - 每个例词支持单独试听

### 19.4 验证
- 后端编译通过
  - `mvn -q -DskipTests compile`
- 前端构建通过
  - `cmd /c npm run build`

---

## 20. 2026-04-15 词库 `source_tag` 规范化与 ID/音频迁移
### 20.1 旧版词库文件名与字段统一
- 新增规范化工具：
  - `tool/normalize_lexicon_source_tag.py`
- 处理范围：
  - `tool/word_data/未录音`
  - `tool/word_data/已录音`
- 处理规则：
  - 旧版单词表/短语表文件名统一补入 `source_tag=current_book`
  - 行内数据统一补入 `source_tag`
  - 字段顺序统一到新格式：
    - `semester`
    - `source_tag`
    - `id`
- 明确保留不处理：
  - `课文`
  - 已经是 `primary_school_review` 命名的新文件

### 20.2 词库 ID 与音频迁移脚本重构
- 新增安全版迁移工具：
  - `tool/migrate_lexicon_ids.py`
- 新版唯一 ID 规则统一为：
  - `word_clean + unit + grade + semester + book_version + source_tag`
- 迁移覆盖内容：
  - 未录音 `jsonl`：更新新版 `id`
  - 已录音 `jsonl`：更新新版 `id`
  - 已录音主音频路径：
    - `word_audio`
    - `phrase_audio`
  - 已录音例句路径：
    - `meanings[*].example_audio`
  - `tool/audio/` 下对应音频文件名同步迁移

### 20.3 迁移安全性增强
- 迁移前增加 dry-run 校验：
  - 重复 `id`
  - 音频目标冲突
  - 缺失音频源
- 将“未录音/已录音成对文件的相同词条 ID 相同”识别为预期信息，不再视为错误
- 修复了 `新人教版_九年级_上册` 中 `increase` 词条重复导致的 ID 冲突：
  - 合并为单个词条
  - 两个 `meanings`

### 20.4 迁移补救
- 因迁移中途出现部分旧音频已移动、`jsonl` 尚未完全写回的半迁移状态，新增临时补救工具：
  - `tool/repair_missing_migrate_audio.py`
- 使用 `mode2` 同源 TTS 方式补齐缺失目标音频后，完成最终迁移收口
- 最终迁移状态：
  - `warnings: 0`
  - 词库与音频命名统一到新版规则

---

## 21. 2026-04-16 管理端来源筛选与 `mode2` 稳定性增强
### 21.1 管理员端来源筛选改为动态显示
- 调整页面：
  - `front/src/components/admin/LexiconManagement.tsx`
- 旧逻辑：
  - 固定显示 `current_book / primary_school_review`
- 新逻辑：
  - 先确定 `教材版本 + 年级 + 册数`
  - 再根据当前已加载词条中真实存在的 `source_tag` 动态生成筛选项
- 新行为：
  - 如果当前册只有本册词条，则只显示“全部来源 + 当前册”
  - 如果当前册实际有复习数据，才显示“小学复习”
  - 单词页与短语页分别独立判断，避免“单词有复习、短语无复习”时出现空筛选项

### 21.2 `mode2` TTS 稳定性增强
- 调整文件：
  - `tool/mode2_jsonl_audio.py`
- 处理目标：
  - 缓解 `TTS 服务暂时不可用`
  - 缓解批量短词触发的 503 / 连接超时
- 当前改动：
  - 默认并发由 `4` 调整为 `2`
  - 增加更多“服务暂不可用”异常识别：
    - `503`
    - `Cannot connect`
    - `Connection timeout`
    - `Server disconnected`
    - `WSServerHandshakeError`
  - 提高退避等待时间
  - 增加请求错峰，降低瞬时并发冲击

### 21.3 `mode2` 并发交互改造
- 左侧 TTS 并发设置由滑块改为：
  - 输入框
  - “确定并发数”按钮
- 本次任务使用：
  - 用户确认后的并发值
- 页面增加提示：
  - 当前已确认并发数
  - 生成中锁定使用的并发值
  - 当前模式不做续跑，中断后下次重新检查已有音频与路径

### 21.4 `mode2` 已录音 JSONL 兜底修复
- 在 `mode2` 页面新增“已录音 JSONL 兜底修复”入口
- 支持上传已录音目录中的 `jsonl`
- 逐行执行：
  - 检查主音频路径是否存在且有效
  - 检查例句音频路径是否存在且有效
  - 如果路径缺失或失效，则按 `id + 命名规则` 扫描 `audio/` 或 `passage_audio/`
  - 找到已有音频则自动补路径
  - 路径和音频都不存在时，自动补生成
- 修复后输出：
  - 写回 `tool/word_data/已录音/同名文件`
  - 返回修复条数、补路径数量、补生成数量、成功/失败统计

### 21.5 验证
- `tool/mode2_jsonl_audio.py`
  - `py_compile` 通过
- 前端
  - `cmd /c npm run build` 通过

---

## 22. 2026-04-16 `source_tag` 联动改造（管理员端 / 教师端 / 学生端）
### 22.1 管理员端分组按来源隔离
- 调整页面：
  - `front/src/components/admin/LexiconManagement.tsx`
- 变更内容：
  - 单词库/短语库执行“分组”前，必须先在页面顶部选择具体来源，不能在“全部来源”下直接分组
  - 分组时仅重排当前 `source_tag` 下的词条，不再影响同单元下其他来源的组号
  - 分组弹窗增加当前来源提示，明确“本次分组只影响当前来源”

### 22.2 管理员端批量导入文件名解析修复
- 调整页面：
  - `front/src/components/admin/LexiconManagement.tsx`
- 问题背景：
  - 旧逻辑直接按 `_` 切分文件名，无法正确识别 `current_book` 与 `primary_school_review`
- 修复结果：
  - 批量导入现在可正确识别：
    - `..._current_book_单词表_...jsonl`
    - `..._current_book_短语表_...jsonl`
    - `..._primary_school_review_单词表_...jsonl`
    - `..._primary_school_review_短语表_...jsonl`
  - 仍然保持：
    - 单词页仅导入单词表
    - 短语页仅导入短语表
    - 课文表需在课文管理中导入

### 22.3 词库学习接口增加来源维度
- 调整后端：
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/controller/LexiconController.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/repository/LexiconEntryRepository.java`
- 调整前端类型/调用：
  - `front/src/lib/lexicon.ts`
- 变更内容：
  - `GET /api/lexicon/learning/summary` 新增可选 `sourceTag`
  - `GET /api/lexicon/learning/items` 新增可选 `sourceTag`
  - 学习汇总响应新增 `sourceGroups`
    - 结构为 `sourceTag -> groups -> total`
  - 当不传 `sourceTag` 时，后端会按来源分别返回分组汇总，供教师端/学生端构建多层选择

### 22.4 教师端发布单词测试增加来源层级
- 调整页面：
  - `front/src/components/teacher/TeacherWordTest.tsx`
- 调整共享类型：
  - `front/src/lib/auth.ts`
  - `backend/test-service/src/main/java/com/kineticscholar/testservice/dto/WordTestGroupScope.java`
  - `backend/test-service/src/main/java/com/kineticscholar/testservice/dto/WordTestContentItem.java`
- 新交互层级：
  - `单元 -> source_tag -> 组`
- 发布时：
  - scope 中写入 `sourceTag`
  - 取词时按 `sourceTag + groupNo` 精确拉取
  - content items 同步保留 `sourceTag`

### 22.5 教师端发布单词复习增加来源层级
- 调整页面：
  - `front/src/components/teacher/TeacherWordReview.tsx`
- 调整共享类型：
  - `front/src/lib/auth.ts`
  - `backend/test-service/src/main/java/com/kineticscholar/testservice/dto/WordReviewUnitScope.java`
  - `backend/test-service/src/main/java/com/kineticscholar/testservice/dto/WordReviewContentItem.java`
- 新交互层级：
  - `单元 -> source_tag`
- 发布时：
  - scope 中写入 `sourceTag`
  - 任务内容按所选来源汇总单词，不再混入其他来源

### 22.6 学生端单词闯关增加来源切换
- 调整页面：
  - `front/src/pages/StudentUnit.tsx`
  - `front/src/pages/StudentDashboard.tsx`
- 新行为：
  - 单词闯关支持在单元内按来源切换：
    - `current_book`
    - `primary_school_review`
  - 默认优先 `current_book`
  - 若该单元下不存在小学复习单词，则不显示“小学复习”标签
  - 短语闯关不显示来源标签，仍按默认来源直接学习

### 22.7 学生端来源切换与学习进度隔离修复
- 问题：
  - 初版实现中，单词闯关切换来源后可能出现“当前组暂无内容”、无法切回、不同账号/不同来源之间状态污染
  - 同时出现过 `vSession is not defined` 的前端报错
- 修复内容：
  - 清理学生端旧变量残留，移除 `vSession / pSession` 误引用
  - 将单词/短语闯关的：
    - 组缓存
    - 组加载状态
    - 组进度映射
    全部改为按 `sourceTag + groupNo` 双键隔离
  - 学习会话与分组进度保存时，前端使用 `unitId||sourceTag` 作为词汇/短语模块的运行态键，避免不同来源同组号串进度
  - 学生端首页单元进度统计同步按多个来源累计词汇/短语进度

### 22.8 本轮验证
- 前端：
  - `cmd /c npm run build` 通过
- 后端：
  - `backend/user-service` `mvn -q -DskipTests compile` 通过
  - `backend/test-service` `mvn -q -DskipTests compile` 通过
- 手工验证结论：
  - 管理员端同单元双来源分组互不影响
  - 批量导入可正确识别 `current_book / primary_school_review`
  - 教师端测试支持 `来源 -> 组`
  - 教师端复习支持 `来源`
  - 学生端单词闯关支持按来源切换，且无来源时不显示标签
  - 学生端短语闯关不显示来源标签

---

## 23. 2026-04-16 Passage Extraction / Audio / UI Sync

### 23.1 mode5 passage schema alignment
- normalized mode5 extraction output to shared passage JSONL format
- output keys now use:
  - `type: "passage"`
  - `passage_text`
- retained extraction metadata for later tracing:
  - `unit_no`
  - `is_starter`
  - `labels`
  - `display_label`
  - `task_kind`
  - `matched_labels`
  - `source_line`
  - `raw_scope_line`

### 23.2 mode5 extraction coverage / prompt refinement
- expanded scope parsing for multiple textbook patterns
- primary-school targets supported more clearly:
  - `Let's talk`
  - `Start to read`
  - `Read and write`
  - `Reading time`
- junior-high exercise ranges supported more clearly:
  - `2a and 2d`
  - `1b`
  - `3a`
- prompt design strengthened to focus on passage body only
- explicit exclusion of questions / exercises below the passage
- improved dialogue sentence splitting for `Speaker: ...` lines

### 23.3 mode5 realtime UI behavior
- changed progress updates from whole-job completion to per-target completion
- added live extracted-record panel backed by `mode5_live_records`
- added dedupe by record `id` to avoid repeated live entries
- fixed Streamlit live preview crash:
  - removed repeated read-only `text_area` widgets
  - replaced preview rendering with `st.code(...)`
- current behavior is container-level dynamic refresh, not full browser page reload

### 23.4 downstream compatibility
- verified admin passage import expects:
  - `unit`
  - `section`
  - `label`
  - `target_id`
  - `title`
  - `passage_text`
  - `source_pages`
  - `book_version`
  - `grade`
  - `semester`
  - `sentences`
- verified extra extraction metadata is ignored by import and does not block DB write
- updated `tool/mode2_jsonl_audio.py` to preserve extended passage metadata when generating recorded JSONL

### 23.5 frontend passage label clarity
- added shared formatter for passage labels
- display rule:
  - prefer `display_label`
  - fallback to humanized `label`
- examples:
  - `2a_and_2d -> 2a and 2d`
  - `start_to_read -> Start to Read`
- applied to:
  - student passage list / current reading header
  - admin passage table

### 23.6 validation
- `conda run -n english_book python -m py_compile tool/mode5_passage_extract.py`
- `conda run -n english_book python -m py_compile tool/mode5_passage_extract.py tool/mode2_jsonl_audio.py`
- `cmd /c npm run build` in `front/`
- checked latest generated passage JSONL files:
  - no broken JSON lines
  - no empty `passage_text`
  - no missing `sentences`
  - `type` normalized to `passage`

---

## 24. 2026-04-16 mode1 Unit Header Robustness

### 24.1 mode1 unit switching robustness
- updated `tool/mode1_pdf_extract_review.py`
- previous behavior relied too heavily on blue `Unit N` headers when deciding whether to switch unit
- new behavior keeps "blue header preferred" as the main rule, but adds tolerance for:
  - black `Unit + number`
  - slightly larger-than-body title-like font
- added a lightweight PDF text-layer helper to collect possible unit header hints per page / split-half and pass them into the LLM prompt as auxiliary evidence
- prompt now explicitly requires:
  - switch unit only when a clearly visible unit header exists
  - black title-like `Unit + number` can count as a valid header
  - do not switch by guessed continuity

### 24.2 empty-page safeguard
- if a page contains no real vocabulary entries, mode1 should return `[]`
- postprocess now also filters out rows that are actually `Unit` headers rather than real words / phrases

### 24.3 validation
- `python -m py_compile tool/mode1_pdf_extract_review.py`

### 24.4 current note
- during follow-up investigation, confirmed that `mode2` passage processing currently counts:
  - `跳过` = audio file already exists
  - `已处理过` = same passage uid already exists in current output jsonl
- also confirmed `mode5` and `mode2` passage id / uid seeds are not fully aligned yet; not changed in this round

---

## 25. 2026-04-16 Sync Exam Bank And Student Unit Practice

### 25.1 sync exam extraction pipeline
- added `tool/mode7_exam_extract.py`
- added `tool/run_mode7.bat`
- target:
  - extract sync exam papers into importable JSONL
  - keep source scope down to textbook version / grade / semester / unit
  - include answers and explanations when present
- current extraction scope excludes listening questions
- extracted target question families:
  - single choice
  - cloze
  - reading
  - grammar fill
  - seven choice
- output directory:
  - `tool/exam_data/未导入`

### 25.2 exam bank backend foundation
- added exam-bank models:
  - `ExamPaper`
  - `ExamMaterial`
  - `ExamQuestion`
  - `ExamQuestionOption`
- added related DTO / repository / controller / service support in `backend/test-service`
- implemented admin-facing capabilities:
  - import JSONL
  - list papers
  - count papers
  - paper detail
  - paper update
  - material CRUD
  - question CRUD
  - delete paper
  - delete by unit
  - delete by semester

### 25.3 overwrite and scope normalization
- import overwrite no longer depends on exact raw paper-type spelling
- normalized compatible paper types into one sync-test family, including:
  - `同步测试题`
  - `同步题`
  - `单元拔尖检测`
  - `单元测试题`
- normalized unit codes such as:
  - `Unit1`
  - `Unit 1`
  - `unit1`
- changed extraction output default `paper_type` to `同步测试题`
- cleaned old conflicting DB data under:
  - `人教版 / 八年级 / 下册`

### 25.4 id and material uid stability
- adjusted generated exam ids to be stable and path-independent
- `material_id` / `question_id` no longer depend on source file path
- verified duplicate conflict investigation around:
  - `uk_exam_material_uid`

### 25.5 admin exam management page
- added admin exam-bank entry in:
  - `front/src/pages/AdminDashboard.tsx`
- added visual exam-bank management page:
  - `front/src/components/admin/ExamManagement.tsx`
- added frontend API layer in:
  - `front/src/lib/auth.ts`
- current admin capabilities:
  - batch import JSONL
  - filter by textbook scope
  - preview paper
  - edit paper / material / question
  - delete current paper
  - delete current unit
  - delete current semester
- note:
  - page is still in the existing material-editor / question-editor structure
  - full “paper-like preview editor” was discussed but not fully landed in this round

### 25.6 student unit practice backend
- added student practice persistence models:
  - `ExamPracticeRecord`
  - `ExamWrongNotebookItem`
- added APIs:
  - submit unit practice result
  - load latest result for a paper
  - load student wrong-notebook items
- wrong answers now persist:
  - submitted answer
  - correct answer
  - analysis
  - source paper / textbook scope
  - wrong count

### 25.7 student unit practice frontend
- updated `front/src/pages/StudentUnit.tsx`
- removed placeholder `MOCK_QUIZ` usage for unit practice
- added real unit-practice flow:
  - load sync paper by current unit scope
  - load latest submission result
  - answer questions in place
  - submit answers
  - show correctness, correct answer, and per-question analysis
- current note:
  - student dashboard wrong-notebook page is still not switched to the real notebook API in this round

### 25.8 validation
- `mvn -q -DskipTests compile` in `backend/test-service`
- `cmd /c npm run build` in `front/`
- verified frontend build passes after `StudentUnit.tsx` unit-practice integration
