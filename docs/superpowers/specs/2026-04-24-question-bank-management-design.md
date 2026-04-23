# 题库管理重构设计

## 背景

当前管理员端的“同步题库”能力本质上仍然围绕“同步卷/试卷”组织，底层采用 `ExamPaper -> ExamMaterial -> ExamQuestion -> ExamQuestionOption` 模型。这种设计适合按单元导入整张同步卷，但不适合长期演进为可扩充的大规模题库。

现有 `tool/exam_data/人教版初中/*.jsonl` 数据结构已经具备明显的“题目中心”特征：每一行代表一道题，包含题目唯一标识、题组标识、题型、题干、选项、答案、解析、教材范围、来源文件等信息。后续系统目标也已明确：

- 管理员端只负责题库管理，不负责组卷
- 教师端后续再基于题库做组卷
- 旧同步卷能力和旧接口可以整体删除，直接切换为新题库体系

因此，本次设计采用“题目中心”的题库模型，完全替换旧同步卷管理能力。

## 目标

- 支持上传当前 `jsonl` 类型题目数据
- 将题目按“题”存储到数据库，而不是按“卷”存储
- 支持海量题目导入、检索、筛选、编辑、维护
- 支持共享材料/共享题干的题组结构
- 支持后续教师端组卷，但本期不实现组卷
- 删除旧同步卷管理相关接口和管理员端能力

## 非目标

- 本期不实现教师端组卷
- 本期不兼容旧 `exam-papers` 接口
- 本期不保留旧试卷模型作为过渡层
- 本期不为题库建立复杂标签体系或全文检索引擎

## 现有 JSONL 结构判断

基于样例读取，当前题目行包含以下主要字段：

- `question_uid`
- `group_uid`
- `source_type`
- `source_file`
- `parser_version`
- `question_type`
- `question_no`
- `book_version`
- `grade`
- `semester`
- `unit`
- `exam_scene`
- `knowledge_tags`
- `difficulty`
- `shared_stem`
- `material`
- `stem`
- `options`
- `answer`
- `analysis`
- `status`
- `created_at`
- `remarks`

从这些字段可以得出以下结论：

- 每行就是一题，适合直接作为题库导入单位
- `group_uid` 表示共享材料或共享题干的一组题
- `shared_stem` 和 `material` 是题组级信息
- `options` 应拆分为子表
- `answer` 未来题型可能扩展，不适合仅存一个简单字符串
- `question_type` 不止单选，后续必须保持扩展性
- 原始数据存在编码和脏内容风险，导入时必须进行校验与错误收集

## 总体方案

系统从“试卷中心”切换为“题库中心”，以题目为一级实体，题组为辅助实体，导入批次为追踪实体。整体采用如下模型：

- `question_bank_import_batches`
- `question_bank_groups`
- `question_bank_items`
- `question_bank_options`

其中：

- `question_bank_import_batches` 记录一次 JSONL 导入任务
- `question_bank_groups` 承接 `group_uid` 和共享材料
- `question_bank_items` 作为题库主表
- `question_bank_options` 存储客观题选项

管理员端只操作题库，不再出现“按单元管理卷子”的概念。

## 数据库设计

### 1. question_bank_import_batches

用途：记录一次导入任务，便于幂等导入、回溯来源、查看错误统计。

建议字段：

- `id` bigint pk
- `batch_code` varchar(64) not null unique
- `source_type` varchar(32) not null
- `source_file` varchar(255) null
- `parser_version` varchar(64) null
- `book_version` varchar(100) not null
- `grade` varchar(50) not null
- `semester` varchar(50) not null
- `unit_code` varchar(120) null
- `import_status` varchar(20) not null
- `overwrite_mode` varchar(20) not null
- `total_count` int not null default 0
- `success_count` int not null default 0
- `failed_count` int not null default 0
- `created_by` bigint null
- `created_at` timestamp not null
- `updated_at` timestamp not null

建议索引：

- `uk_question_bank_import_batch_code(batch_code)`
- `idx_question_bank_import_scope(book_version, grade, semester, unit_code)`
- `idx_question_bank_import_status(import_status)`

### 2. question_bank_groups

用途：将共享题干、阅读材料、完形材料等内容聚合到题组层。

建议字段：

- `id` bigint pk
- `group_uid` varchar(64) not null
- `batch_id` bigint not null
- `shared_stem` text null
- `material` text null
- `question_type` varchar(32) null
- `book_version` varchar(100) not null
- `grade` varchar(50) not null
- `semester` varchar(50) not null
- `unit_code` varchar(120) null
- `exam_scene` varchar(64) null
- `status` varchar(20) not null
- `created_at` timestamp not null
- `updated_at` timestamp not null

建议约束和索引：

- `uk_question_bank_group_batch_uid(batch_id, group_uid)`
- `idx_question_bank_group_scope(book_version, grade, semester, unit_code)`
- `idx_question_bank_group_batch(batch_id)`

说明：

- 不要求 `group_uid` 全局唯一，避免不同来源文件冲突
- `material` 和 `shared_stem` 只在题组表存一份

### 3. question_bank_items

用途：题库主表，每道题一行。

建议字段：

- `id` bigint pk
- `question_uid` varchar(64) not null unique
- `batch_id` bigint not null
- `group_id` bigint null
- `question_type` varchar(32) not null
- `question_no` int null
- `stem` text null
- `answer_json` text not null
- `analysis` text null
- `difficulty` varchar(20) null
- `knowledge_tags_json` text null
- `source_type` varchar(32) not null
- `source_file` varchar(255) null
- `parser_version` varchar(64) null
- `book_version` varchar(100) not null
- `grade` varchar(50) not null
- `semester` varchar(50) not null
- `unit_code` varchar(120) null
- `exam_scene` varchar(64) null
- `status` varchar(20) not null
- `remarks` text null
- `content_hash` varchar(64) null
- `created_by` bigint null
- `created_at` timestamp not null
- `updated_at` timestamp not null

建议索引：

- `uk_question_bank_item_uid(question_uid)`
- `idx_question_bank_item_scope(book_version, grade, semester, unit_code)`
- `idx_question_bank_item_type(question_type)`
- `idx_question_bank_item_status(status)`
- `idx_question_bank_item_group(group_id)`
- `idx_question_bank_item_batch(batch_id)`

说明：

- `book_version / grade / semester / unit_code` 在题目表冗余保留，便于直接筛题
- `answer_json` 使用 JSON 字符串存储，适配未来更多题型
- `content_hash` 用于后续查重或辅助重复检测，本期不是核心逻辑

### 4. question_bank_options

用途：客观题选项表。

建议字段：

- `id` bigint pk
- `question_id` bigint not null
- `option_key` varchar(16) not null
- `option_text` text not null
- `sort_order` int not null default 0

建议约束和索引：

- `uk_question_bank_option(question_id, option_key)`
- `idx_question_bank_option_question(question_id)`

## JSONL 导入设计

### 导入单位

每一行 JSONL 表示一道题，导入时逐行解析。

### 字段映射

#### 进入 question_bank_items

- `question_uid -> question_uid`
- `question_type -> question_type`
- `question_no -> question_no`
- `stem -> stem`
- `answer -> answer_json`
- `analysis -> analysis`
- `difficulty -> difficulty`
- `knowledge_tags -> knowledge_tags_json`
- `source_type -> source_type`
- `source_file -> source_file`
- `parser_version -> parser_version`
- `book_version -> book_version`
- `grade -> grade`
- `semester -> semester`
- `unit -> unit_code`
- `exam_scene -> exam_scene`
- `status -> status`
- `remarks -> remarks`

#### 进入 question_bank_groups

- `group_uid -> group_uid`
- `shared_stem -> shared_stem`
- `material -> material`
- `question_type -> question_type`
- `book_version -> book_version`
- `grade -> grade`
- `semester -> semester`
- `unit -> unit_code`
- `exam_scene -> exam_scene`

#### 进入 question_bank_options

- `options[*].key -> option_key`
- `options[*].text -> option_text`
- 数组顺序 -> `sort_order`

#### 进入 question_bank_import_batches

- 当前上传文件名
- 批次导入范围
- 来源类型
- 解析版本
- 成功/失败统计

### 题组归并规则

- 同一批导入内按 `group_uid` 聚合
- 如果 `group_uid` 为空，则题目不挂组
- `shared_stem` 与 `material` 任一存在时，优先写入题组表
- 同组内如果材料文本冲突，以首条有效数据为准并记入错误列表

### 幂等规则

采用 `question_uid` 作为题目唯一业务键，支持两种导入模式：

- `skip_existing`
- `overwrite_existing`

本项目管理员端默认采用 `overwrite_existing`，便于多次修正后重传。

### 行级校验规则

必填校验：

- `question_uid` 非空
- `question_type` 非空
- `book_version` 非空
- `grade` 非空
- `semester` 非空
- `stem/shared_stem/material` 至少一项非空

客观题校验：

- `options` 必须存在且非空
- `answer` 必须能转成合法 JSON

扩展校验：

- `question_type` 必须属于受支持集合
- `status` 若为空则默认 `active`
- `difficulty` 允许为空

错误处理策略：

- 单行失败不回滚整批
- 批次继续执行
- 记录失败行号、`question_uid`、失败原因

### 导入结果返回结构

- `batchId`
- `batchCode`
- `totalCount`
- `successCount`
- `failedCount`
- `createdCount`
- `updatedCount`
- `skippedCount`
- `errors`

其中 `errors` 仅返回前若干条摘要，完整错误明细可后续扩展为单独的批次错误表。

## 接口设计

旧 `/api/tests/exam-papers/**` 接口整体废弃，替换为新题库接口。

### 1. 导入相关

#### POST `/api/tests/question-bank/import`

用途：上传 JSONL 并导入题库。

请求参数：

- `file`
- `overwriteMode`
- `bookVersion`
- `grade`
- `semester`
- `unitCode`
- `sourceType`

响应：

- 导入结果对象

#### GET `/api/tests/question-bank/import-batches`

用途：分页查看导入批次。

支持筛选：

- `bookVersion`
- `grade`
- `semester`
- `unitCode`
- `status`
- `page`
- `size`

#### GET `/api/tests/question-bank/import-batches/{batchId}`

用途：查看某批次详情和错误摘要。

### 2. 题目查询

#### GET `/api/tests/question-bank/questions`

用途：题库分页查询。

支持筛选：

- `bookVersion`
- `grade`
- `semester`
- `unitCode`
- `questionType`
- `examScene`
- `status`
- `keyword`
- `sourceType`
- `batchId`
- `page`
- `size`

响应列表建议包含：

- 题目 id
- `questionUid`
- `questionType`
- 题干摘要
- `bookVersion`
- `grade`
- `semester`
- `unitCode`
- `examScene`
- `groupId`
- `status`
- `sourceFile`
- `updatedAt`

### 3. 单题详情与编辑

#### GET `/api/tests/question-bank/questions/{id}`

返回：

- 题目完整信息
- 题组选读信息
- 选项列表

#### PUT `/api/tests/question-bank/questions/{id}`

支持编辑字段：

- `stem`
- `analysis`
- `answerJson`
- `difficulty`
- `knowledgeTags`
- `status`
- `remarks`
- `bookVersion`
- `grade`
- `semester`
- `unitCode`
- `examScene`
- `options`
- `sharedStem`
- `material`

说明：

- 编辑 `sharedStem/material` 时，实际更新题组
- 前端需提示“将同步影响同组题目”

#### PATCH `/api/tests/question-bank/questions/{id}/status`

用途：快速改状态。

#### DELETE `/api/tests/question-bank/questions/{id}`

用途：删除单题。

行为：

- 删除题目
- 同步删除选项
- 若题组下已无题，可删除空题组

### 4. 批量操作

#### POST `/api/tests/question-bank/questions/batch-status`

用途：批量改状态。

#### POST `/api/tests/question-bank/questions/batch-delete`

用途：批量删除。

#### POST `/api/tests/question-bank/questions/batch-update-meta`

用途：批量改教材范围、难度、标签、状态等元数据。

### 5. 题组查看

#### GET `/api/tests/question-bank/groups/{groupId}`

用途：查看共享材料及组内题目。

## 管理员端页面设计

管理员端入口名称从“同步题库”改为“题库管理”。

### 页面结构

#### 1. 导入区

功能：

- 上传一个或多个 JSONL
- 设置覆盖模式
- 显示导入结果
- 显示失败摘要

#### 2. 筛选区

筛选项：

- 教材版本
- 年级
- 学期
- 单元
- 题型
- 状态
- 来源
- 关键词

#### 3. 列表区

展示列建议：

- 题型
- 题干摘要
- 教材范围
- 单元
- 题组标识
- 状态
- 来源文件
- 更新时间

#### 4. 详情编辑区

编辑分区：

- 基础信息
- 题目内容
- 选项
- 答案
- 解析
- 标签与难度
- 来源信息
- 题组信息

### 交互原则

- 列表页以“题”为中心，不再以“卷”为中心
- 详情页清晰区分题目字段和题组字段
- 编辑题组字段时给出影响提示
- 批量操作仅针对题目元数据，不对正文做批量编辑

## 后端实现分层

建议在 `test-service` 中新增如下模块：

- `QuestionBankController`
- `QuestionBankService`
- `QuestionBankImportService`
- `QuestionBankQueryService`

Repository：

- `QuestionBankImportBatchRepository`
- `QuestionBankGroupRepository`
- `QuestionBankItemRepository`
- `QuestionBankOptionRepository`

DTO：

- 导入请求/响应 DTO
- 题目查询 DTO
- 单题详情 DTO
- 单题更新 DTO
- 批量操作 DTO

## 删除与清理范围

以下旧能力应整体删除：

- 旧 `exam_papers`
- 旧 `exam_materials`
- 旧 `exam_questions`
- 旧 `exam_question_options`
- 旧管理员端“同步题库”页面逻辑
- 旧 `/api/tests/exam-papers/**` 管理接口
- 旧 DTO / service / repository / model 中仅为同步卷服务的部分

本次删除意味着旧学生端若仍依赖旧同步卷接口，将无法继续使用该能力。该影响已在方案确认阶段接受。

## 实施顺序

### 阶段 1：数据层

- 新建题库四张核心表
- 新建实体、Repository、基础 DTO
- 删除旧同步卷表的代码引用

### 阶段 2：导入链路

- 实现 JSONL 上传导入
- 批次记录
- 行级校验
- 错误收集
- 幂等覆盖

### 阶段 3：题库查询与编辑

- 题目分页查询
- 单题详情
- 单题编辑
- 批量状态更新
- 批量删除

### 阶段 4：管理员端切换

- 将入口改为“题库管理”
- 接入新导入接口
- 接入新列表和编辑接口
- 删除旧同步卷管理界面

### 阶段 5：清理旧能力

- 删除旧 controller / service / dto / model
- 清理无用前端 API
- 更新相关文案与日志

## 风险与约束

### 1. 原始 JSONL 存在脏数据

样例已经显示出编码干扰和内容污染风险，导入器必须保证：

- 逐行校验
- 允许部分成功
- 返回错误摘要

### 2. answer 结构必须保持扩展性

不能按“单选字母”固化设计，必须保留为 JSON。

### 3. knowledge_tags 暂不复杂化

先采用 JSON 存储，后续如需统一标签体系再拆表。

### 4. 题组字段编辑会影响同组题

该行为必须在前端和接口语义上明确。

## 未来扩展

本设计为教师端组卷预留了天然基础：

- 可按教材范围筛题
- 可按题型筛题
- 可按题组查看材料题
- 可按状态筛选可用题

后续教师端可在此基础上新增：

- 题单
- 组卷草稿
- 正式试卷
- 题目复用和复制策略

本期不实现这些能力。

## 最终结论

本次重构应以“题目中心”替换“试卷中心”，彻底删除旧同步卷管理能力。管理员端只负责题库的导入、检索、编辑和维护；教师端组卷作为后续独立功能建设。该方案最符合当前 JSONL 数据形态，也最符合未来大规模题库的长期演进方向。
