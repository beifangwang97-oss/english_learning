# CODEX 项目总览（唯一 Agent 日志）

最后整理时间：2026-04-17  
工作目录：`D:\zip`

本文件用于沉淀项目结构、当前业务口径、运行方式、协作规范，以及关键迭代记录。  
后续所有会话默认继续在本文件末尾追加，不再分散到其他同步文档。

---

## 1. 项目一句话

Kinetic Scholar 是一个 K12 英语教学平台，覆盖管理员端、教师端、学生端，以及一套用于教材内容抽取、音频生成、结构化导入的工具链。  
技术栈以 React + TypeScript 前端、Spring Boot 微服务后端、Streamlit 工具端为主。

---

## 2. 当前架构与端口

### 2.1 微服务
- `config-server`：`8888`
- `api-gateway`：`8080`
- `user-service`：`8081`
- `learning-content-service`：`8082`
- `test-service`：`8083`
- `front`：Vite 开发端口 `3000`

### 2.2 网关路由
- `/api/users/**`、`/api/stores/**`、`/api/lexicon/**` -> `user-service`
- `/api/learning/**` -> `learning-content-service`
- `/api/tests/**` -> `test-service`

---

## 3. 代码目录速览

- `backend/`
  - Java Spring Boot 微服务
- `front/`
  - React + TypeScript 前端
- `tool/`
  - Streamlit 工具端
  - PDF 抽取、音频生成、JSONL 导出
- `run_all.ps1` / `run_all.bat`
  - 一键启动整套服务
- `stop_all.bat`
  - 一键停止常用端口服务
- `docker-compose.yml`
  - PostgreSQL + Redis 基础依赖

---

## 4. 当前功能概览

### 4.1 管理员端 `/admin/dashboard`
- 门店管理
- 教材树管理
- 单词 / 短语 / 课文 / 音标管理
- 同步试题库管理
- 教材范围导入与维护

### 4.2 教师端 `/teacher/dashboard`
- 教学任务发布
- 单词测试发布
- 单词复习发布
- 权限查看
- 学习数据分析

### 4.3 学生端 `/student/dashboard`
- 音标学习
- 单元学习
  - 单词闯关
  - 短语闯关
  - 课文阅读
  - 单元练习
- 单词测试
- 单词复习
- 错题本

---

## 5. 认证与会话

- 当前项目采用会话态登录，不再依赖单纯 JWT。
- 前端通过 `sessionStorage` 持久化 `token` 与 `user`。
- 网关 `SessionValidationFilter` 负责统一校验登录态。
- `user-service` 支持：
  - 登录
  - 登出
  - 当前用户查询
  - 在线人数统计

关键文件：
- `backend/user-service/src/main/java/com/kineticscholar/userservice/controller/UserController.java`
- `backend/user-service/src/main/java/com/kineticscholar/userservice/service/impl/SessionAuthServiceImpl.java`
- `backend/api-gateway/src/main/java/com/kineticscholar/apigateway/config/SessionValidationFilter.java`

---

## 6. 当前业务口径

### 6.1 账号与门店
- 教师权限由所属门店决定，不单独配置教师教材权限。
- 门店维护：
  - 教材版本权限
  - 年级权限
- 教师端实际可见内容必须与门店权限和管理员教材树共同决定。

### 6.2 单词测试
- 测试范围以教材树中的教材版本 / 年级 / 上下册为上层结构。
- 最小发布单位为“单元下的组号”。
- 题目内容来自词库中的单词数据。

### 6.3 单词复习
- 复习范围同样依赖教材树中的教材版本 / 年级 / 上下册。
- 最小发布单位为“单元下的来源册别”。
- 固定包含：
  - 单词卡片认识
  - 英译汉
- 可选包含：
  - 补全
  - 汉译英

### 6.4 单元学习
- 学生端单元学习不应依赖“单元结构是否导入完整”。
- 教材版本 / 年级 / 上下册来自教材树。
- 单元叶子由词库中的单词 `unit` 派生。
- 单元结构仅作为学生端卡片补充信息，不是唯一数据源。

---

## 7. 词库与学习内容接口面

### 7.1 词库 `user-service`
- 单词与短语词库查询
- 教材范围筛选
- `source_tag` 维度支持
- 音频鉴权播放

### 7.2 学习内容 `learning-content-service`
- Unit / Word / Phrase / Passage / Quiz CRUD
- 教材树维护
- 课文与教材范围管理

---

## 8. 工具链能力

工具端主入口：`tool/app.py`

当前主要能力：
- mode1：词汇抽取
- mode2：音频生成与已录音 JSONL 处理
- mode4：单元结构抽取
- mode5：课文抽取
- mode6：音标例词与录音
- mode7：同步试题抽取

工具目录：
- `tool/word_data/`
- `tool/passage_audio/`
- `tool/structure_data/`
- `tool/exam_data/`
- `tool/runs/`

---

## 9. 运行与联调

### 9.1 一键启动
- `run_all.bat`
- 实际调用 `run_all.ps1`
- 启动顺序：
  - `config-server`
  - `user-service`
  - `learning-content-service`
  - `test-service`
  - `api-gateway`
  - `front`

### 9.2 一键停服
- `stop_all.bat`
- 常清理端口：
  - `8888`
  - `8080`
  - `8081`
  - `8082`
  - `8083`
  - `3000`

### 9.3 基础依赖
- PostgreSQL：`5433`
- Redis：`6379`

---

## 10. 当前工作区状态

- 本仓库可能长期处于 dirty worktree。
- 未经明确要求，不回滚用户已有改动。
- 修改前优先理解上下文，不做大范围无关清理。
- 文件编辑统一使用 `apply_patch`。

---

## 11. 每日收尾要求

每轮工作结束前尽量完成：
1. `git -C D:\zip status --short`
2. 必要的构建或编译验证
3. 将本轮工作同步到 `CODEX_LOG.md`
4. 记录：
   - 做了什么
   - 为什么改
   - 改了哪些文件
   - 如何验证
   - 当前遗留问题

---

## 12. 协作规范

### 12.1 编码
- 默认使用 UTF-8。
- 避免把文件保存为 GBK / ANSI / UTF-16。

### 12.2 文案
- 日志、说明、界面文案以中文为主。
- 代码标识符保持英文。

### 12.3 注释
- 注释尽量简短、解释复杂逻辑，不写无意义注释。

### 12.4 文档
- 新工作统一补充到本文件。
- 不再新开分散式同步文档。

---

## 13. 下次会话标准起手

建议先做：
1. 阅读本日志最近两节。
2. `git -C D:\zip status --short`
3. 查看本轮用户提出的具体问题。
4. 先定位最小修复范围，再动手修改。

---

## 14. 2026-04-13 ~ 2026-04-14 工具链与抽取能力整理

### 14.1 工具端结构与模式拆分
- 梳理 `tool/app.py` 与多模式工具链职责。
- 明确 mode1 / mode4 / mode5 等提取流程边界。

### 14.2 mode1 词汇抽取
- 修复词汇提取准确率问题。
- 提升对页面分栏、标题、无效内容的过滤能力。

### 14.3 mode4 单元结构提取
- 升级单元结构抽取逻辑。
- 更稳定输出教材版本、年级、册别、单元等层级信息。

### 14.4 mode5 课文抽取
- 初步完善课文提取流程。
- 为后续 passage 管理和导入打基础。

### 14.5 本轮沉淀
- 统一工具链文案与编码约束。
- 明确后续日志统一写入本文件。

---

## 15. 2026-04-14 管理员端词库与教材管理增强

### 15.1 词库管理增强
- 管理员端单词 / 短语词库管理能力补强。
- 支持更稳定的筛选与导入联动。

### 15.2 教材管理新增
- 新增教材树管理页面与维护逻辑。
- 将教材结构提升为平台级统一数据源。

### 15.3 交互优化
- 管理员端教材管理交互细节优化。
- 提升筛选、编辑、切换体验。

### 15.4 稳定性修复
- 修复相关页面状态同步和表单稳定性问题。

### 15.5 当前边界
- 教材树维护与词库导入仍需持续联动校验。

### 15.6 严格联动
- 明确“教材管理 -> 词库筛选 / 导入”的联动关系。

---

## 16. 2026-04-14 课文数据与学生阅读体验优化

### 16.1 课文数据与数据库兼容
- 调整课文数据结构，适配数据库落库和读取。

### 16.2 管理员端课文管理
- 新增 / 修复管理员课文管理能力。

### 16.3 段落换行与句子交互
- 优化句子级展示与段落换行逻辑。

### 16.4 学生端阅读体验
- 提升学生端课文阅读页面展示效果。
- 支持更清晰的中英文阅读切换。

### 16.5 稳定性与脚本排查
- 排查工具端与前端联动中的异常点。

### 16.6 主要变更文件
- `front/src/pages/StudentUnit.tsx`
- 课文管理相关后台与工具端文件

---

## 17. 2026-04-15 管理员端单元管理与学生单元卡片改造

### 17.1 单元目录成为统一数据源
- 单元目录管理正式落地。
- 为学生端单元卡片提供统一来源。

### 17.2 后端接口与规则
- 完善单元管理相关接口。
- 统一单元唯一性与范围规则。

### 17.3 管理员端页面
- 增加单元管理页面能力。

### 17.4 当前边界
- 仍需和教材树、词库、学生端展示持续校准。

### 17.5 主要变更文件
- 管理员端单元管理相关前后端文件

### 17.6 学生端单元卡片
- 改造学生端单元卡片展示。

### 17.7 学生端当前进度口径
- 统一单元卡片进度展示逻辑。

### 17.8 停启脚本修正
- 修正部分启动 / 停止脚本行为。

### 17.9 验证
- 前端构建与页面联调通过。

---

## 18. 2026-04-15 工具端音标数据与 mode6

### 18.1 音标种子数据
- 整理音标基础数据。

### 18.2 mode6 例词与录音
- 增加音标例词与录音处理能力。

### 18.3 当前边界
- 音标例词、录音、展示链路仍在继续丰富。

### 18.4 验证
- 相关工具脚本已编译通过。

---

## 19. 2026-04-15 音标管理与学生端音标学习

### 19.1 管理员端音标管理
- 增强音标管理页面。

### 19.2 管理员端音标管理优化
- 改进交互与数据展示。

### 19.3 学生端音标学习第一版
- 学生端可进行音标学习。

### 19.4 验证
- 前端构建通过。

---

## 20. 2026-04-15 词库 `source_tag` 规范与 ID / 音频迁移

### 20.1 旧版文件名与字段统一
- 统一旧词库文件命名和字段结构。

### 20.2 ID 与音频迁移脚本重构
- 重构词条 ID 与音频迁移脚本。

### 20.3 迁移安全性增强
- 增加迁移过程保护与兜底。

### 20.4 迁移补救
- 针对历史遗留数据做补救处理。

---

## 21. 2026-04-16 管理端来源筛选与 mode2 稳定性增强

### 21.1 来源筛选改为动态显示
- 管理端来源筛选不再写死，改为动态展示。

### 21.2 mode2 TTS 稳定性增强
- 提升音频生成流程稳定性。

### 21.3 mode2 并发交互改造
- 优化并发处理与实时反馈。

### 21.4 已录音 JSONL 兜底修复
- 修正 mode2 对已有录音 JSONL 的识别与复用。

### 21.5 验证
- 工具脚本与前端构建通过。

---

## 22. 2026-04-16 `source_tag` 联动改造（管理员端 / 教师端 / 学生端）

### 22.1 管理员端按来源隔离分组
- `source_tag` 进入管理员端分组和筛选逻辑。

### 22.2 管理员端批量导入文件名解析修复
- 修复来源信息解析错误。

### 22.3 学习接口增加来源维度
- 词库学习相关接口支持 `sourceTag`。

### 22.4 教师端单词测试增加来源层级
- 教师发布单词测试时可区分来源。

### 22.5 教师端单词复习增加来源层级
- 教师发布单词复习时可区分来源。

### 22.6 学生端单词闯关支持来源切换
- 学生端可以在不同来源之间切换学习。

### 22.7 学习进度隔离修复
- 修正不同来源下的学习进度串联问题。

### 22.8 验证
- 前后端构建与联调通过。

---

## 23. 2026-04-16 Passage Extraction / Audio / UI Sync

### 23.1 mode5 passage schema alignment
- 统一课文抽取输出格式。
- 核心字段统一为：
  - `type: "passage"`
  - `passage_text`

### 23.2 mode5 extraction coverage / prompt refinement
- 强化多教材模式下的 passage 抽取覆盖率。
- 提高对标题、正文、题目区分的准确度。

### 23.3 mode5 realtime UI behavior
- 改成按目标逐步反馈，而不是整批结束后才刷新。
- 修复 Streamlit 实时预览崩溃。

### 23.4 downstream compatibility
- 验证抽取结果可被管理员端课文导入正常消费。

### 23.5 frontend passage label clarity
- 优化课文标签显示。

### 23.6 validation
- 工具编译与前端构建通过。

---

## 24. 2026-04-16 mode1 Unit Header Robustness

### 24.1 unit 切换鲁棒性
- `mode1_pdf_extract_review.py` 不再只依赖蓝色 `Unit N` 标题。
- 新增对黑色标题和稍大字号标题的容忍。

### 24.2 空页保护
- 无真实词条的页面返回空数组。
- 过滤被误识别为单词的 `Unit` 标题。

### 24.3 validation
- `python -m py_compile tool/mode1_pdf_extract_review.py`

### 24.4 current note
- mode2 对 passage uid 的稳定性仍有后续优化空间。

---

## 25. 2026-04-16 同步试题库与学生端单元练习打通

### 25.1 同步试题抽取流程
- 新增：
  - `tool/mode7_exam_extract.py`
  - `tool/run_mode7.bat`
- 支持将同步试题抽取为可导入 JSONL。
- 当前排除听力题。

### 25.2 后端试题库基础能力
- 新增模型：
  - `ExamPaper`
  - `ExamMaterial`
  - `ExamQuestion`
  - `ExamQuestionOption`
- 落地能力：
  - 导入 JSONL
  - 试卷列表 / 详情
  - 题目 / 材料 CRUD
  - 删除试卷 / 单元 / 学期范围

### 25.3 覆盖导入与范围规范化
- 纸型名称与单元编码做规范化。
- 降低历史命名不一致造成的重复导入问题。

### 25.4 ID 与 material uid 稳定性
- 生成规则不再依赖源文件路径。

### 25.5 管理员端试题库页面
- 新增：
  - `front/src/components/admin/ExamManagement.tsx`
- 支持导入、筛选、预览、编辑、删除。

### 25.6 学生端单元练习后端
- 新增学生练习记录与错题本持久化。

### 25.7 学生端单元练习前端
- `front/src/pages/StudentUnit.tsx`
- 去掉占位 `MOCK_QUIZ`
- 改为真实单元练习流：
  - 加载试卷
  - 答题
  - 提交
  - 查看正确答案与解析

### 25.8 验证
- `mvn -q -DskipTests compile` in `backend/test-service`
- `cmd /c npm run build` in `front/`

---

## 26. 2026-04-17 教师教材树、学生单元学习、单词测试与复习联动修复

### 26.1 问题背景
- 教师端发布教学任务时，教材树与管理员端教材树不一致。
- PEP 没有导入单元结构时，教师端无法正确展示教材范围。
- 学生端打开单元学习时，看不到已导入的单词和短语。
- 单词闯关、短语闯关、单词复习存在：
  - 英译汉选项不随机
  - 补全展示异常
  - 汉译英大小写校验不严格
  - 音频点击无反馈
- 单词测试与单词复习需要统一依赖教材树管理教材范围。

### 26.2 教师端教材树统一
- 主要文件：
  - `front/src/components/teacher/TeachingUnits.tsx`
  - `front/src/components/teacher/TeacherWordTest.tsx`
  - `front/src/components/teacher/TeacherWordReview.tsx`

- 统一规则：
  - 不再用门店 `gradePermissions` 再次裁剪年级。
  - 仅用门店 `textbookPermissions` 过滤教材版本。
  - 教材版本 / 年级 / 上下册全部直接读取管理员教材树 `getTextbookScopes()`。
  - 单元叶子仅从单词库 `word.unit` 派生。
  - 即便某册暂无单词，也保留版本 / 年级 / 册别层级。

### 26.3 单词测试与单词复习发布粒度下沉
- 单词测试：
  - 最小发布单位为“单元下的组号”。
  - 组号后显示该组数量。

- 单词复习：
  - 最小发布单位为“单元下的来源册别”。
  - 当前来源包括：
    - `current_book`
    - `primary_school_review`
  - 每个来源项显示单词数量。

### 26.4 教师端界面与筛选统一
- 教学任务界面风格向单词测试、单词复习对齐。
- 三个板块左侧学生选择区上方增加筛选：
  - 按学生年级筛选
  - 按教材版本筛选
- 教材版本支持折叠，便于快速展开收起。

### 26.5 学生端单元学习内容查询修正
- 主要文件：
  - `front/src/pages/StudentUnit.tsx`
  - `front/src/lib/lexicon.ts`

- 修正点：
  - 不再依赖 PEP 单元结构是否已导入。
  - 按教材范围直接读取已导入的单词与短语。
  - 对教材版本名称启用别名兜底，兼容：
    - PEP
    - 人教版
    - 新版人教版

### 26.6 学生端音频播放修复
- 点击单词发音或例句发音不再静默失败。
- 保留鉴权音频逻辑，同时补上错误透传。
- 当前行为：
  - 播放失败时会显示错误信息
  - 控制台会输出具体错误
  - 播放新音频前会先停止上一段音频

### 26.7 学生端单词闯关 / 短语闯关逻辑修正
- 文件：`front/src/pages/StudentUnit.tsx`

- 英译汉：
  - 四个选项
  - 一个正确答案 + 三个同组干扰项
  - 每次进入题目重新随机
  - 进入错误队列后再次出现时仍会重新随机

- 汉译英：
  - 改为严格大小写校验
  - 仍忽略首尾空格和多余空格

- 补全：
  - 非挖空字母保持可见
  - 只有挖空位可输入

### 26.8 学生端单词复习重构
- 文件：`front/src/components/student/WordReviewView.tsx`

- 重构方向：
  - 尽量对齐单元学习中的单词闯关逻辑
  - 错误反馈继续显示正确答案
  - 汉译英严格大小写校验
  - 英译汉进入题目时重新生成选项
  - 补全仅隐藏挖空位，其余字母保持可见
  - 分阶段展示题面，避免提前泄露答案

### 26.9 单词复习“补全环节消失”补丁
- 现象：
  - 教师端勾选补全，学生端今日复习却不显示补全阶段

- 排查结论：
  - 阶段列表原先只依赖 `session.enableSpelling`
  - 如果日会话返回值异常，前端会直接把补全阶段裁掉

- 修复：
  - 阶段生成增加兜底：
    - 优先读取 `session.enableSpelling / enableZhToEn`
    - 回退到 `activeAssignment.enableSpelling / enableZhToEn`

### 26.10 主要涉及文件
- 教师端：
  - `front/src/components/teacher/TeachingUnits.tsx`
  - `front/src/components/teacher/TeacherWordTest.tsx`
  - `front/src/components/teacher/TeacherWordReview.tsx`

- 学生端：
  - `front/src/pages/StudentUnit.tsx`
  - `front/src/components/student/WordReviewView.tsx`

- 公共前端：
  - `front/src/lib/lexicon.ts`
  - `front/src/lib/auth.ts`

- 后端排查重点：
  - `backend/test-service/src/main/java/com/kineticscholar/testservice/service/impl/TestServiceImpl.java`

### 26.11 本轮验证
- `cmd /c npm run build` in `front/`

确认通过：
- 教师端教材树改为依赖管理员教材树
- 单词测试 / 单词复习发布树已切到统一规则
- 学生端英译汉选项支持重新随机
- 汉译英已严格大小写校验
- 单词复习补全恢复为“非挖空字母可见”

### 26.12 当前遗留
- 单词复习补全环节消失的问题，前端已加兜底。
- 后续如仍偶发，需要继续深查后端日会话返回值为什么会不稳定。

---

## 27. 2026-04-17 日志文档清理

### 27.1 清理目标
- 清除历史日志中的乱码干扰和重复噪音。
- 保留项目主线信息与关键迭代记录。
- 将文档统一为中文主体、清晰分节、可持续追加的格式。

### 27.2 本次处理方式
- 重写 `CODEX_LOG.md` 主体结构。
- 保留核心章节：
  - 项目概览
  - 架构与运行
  - 业务口径
  - 协作规范
  - 关键迭代摘要
- 对历史内容不再逐字抢救乱码，而是按已确认事实重组摘要。

### 27.3 后续维护约定
- 新增工作继续按“日期 -> 背景 -> 改动 -> 文件 -> 验证 -> 遗留”格式追加。
- 若后续出现新的大范围历史整理需求，再单独开一次“日志归档轮”处理。

---

## 28. 2026-04-17 学生端展示细节与教师端单词测试口径修正

### 28.1 学生端汉译英与补全展示补充
- 文件：
  - `front/src/pages/StudentUnit.tsx`
  - `front/src/components/student/WordReviewView.tsx`

- 本轮补充：
  - 单词闯关汉译英增加：
    - 音标
    - 单词发音按钮
  - 短语闯关汉译英增加：
    - 短语发音按钮
  - 单词复习汉译英继续保留：
    - 音标
    - 单词发音按钮
  - 单词闯关、短语闯关、单词复习的补全 / 默写环节去掉音标提示，避免提示过多。

### 28.2 补全环节统一为大小写强校验
- 文件：
  - `front/src/pages/StudentUnit.tsx`
  - `front/src/components/student/WordReviewView.tsx`

- 修正点：
  - 单词闯关补全改为严格区分大小写。
  - 短语闯关补全改为严格区分大小写。
  - 单词复习补全改为严格区分大小写。
- 现在学生端这几处补全与汉译英口径一致：
  - 忽略首尾空格与多余空格
  - 严格区分英文大小写

### 28.3 单词测试默写环节去掉音标
- 文件：`front/src/components/student/WordTestView.tsx`

- 修正点：
  - 学生端单词测试默写卡片不再显示音标。
  - 避免在测试题面直接暴露拼写提示。

### 28.4 教师端单词测试 `testType` 修正
- 文件：`front/src/components/teacher/TeacherWordTest.tsx`

- 问题：
  - 教师端单词测试按钮文案曾误改成“选择”。
  - 同时前端内部提交值也被错误写成了“选择”。
  - 后端实际只接受：
    - `默写`
    - `听写`

- 修复：
  - 按钮文案恢复为“听写”。
  - 前端 `testType` 类型与状态值改回：
    - `默写`
    - `听写`
  - 与后端校验口径重新对齐，避免触发：
    - `testType must be 默写 or 听写`

### 28.5 本轮验证
- 已执行：
  - `cmd /c npm run build` in `front/`

- 已确认：
  - 前端构建通过。
  - 教师端单词测试发布时 `testType` 已恢复为合法值。
  - 学生端补全环节已统一为大小写强校验。
  - 学生端单词测试默写不再显示音标。

---

## 29. 2026-04-21 工具链整理与批处理能力补强

### 29.1 `mode2_jsonl_audio.py` 音频生成链路重构
- 文件：
  - `tool/mode2_jsonl_audio.py`

- 本轮调整：
  - 音频与 JSONL 输出目录统一到新结构：
    - `tool/data/...`
    - `tool/audio/...`
  - 增加与 `mode3` 一致的输出策略：
    - `原文件写回`
    - `同目录新建副本`
  - 副本命名规则统一为 `_mode2.jsonl`，并支持自动避让：
    - `_mode2_2.jsonl`
    - `_mode2_3.jsonl`
  - 新增本地目录自动扫描入口，支持直接从新 `data` 目录批量选择：
    - 单词 JSONL
    - 短语 JSONL
    - 课文 JSONL
  - 修复本地扫描与上传预览相关报错：
    - `rel_path` 未定义
    - `load_items_from_uploaded` 未定义
  - 删除旧目录兼容逻辑，不再继续兼容旧 `passage_audio` / 旧课文音频路径。

- 本轮确认：
  - 现在模式二只面向新的 `data` / `audio` 目录结构运行。
  - 覆盖写回不会改文件名。
  - 副本写回不会发生重名覆盖。

### 29.2 `mode3_word_syllable_fill.py` 改造成真实批处理任务
- 文件：
  - `tool/mode3_word_syllable_fill.py`

- 本轮调整：
  - 废弃本地规则化补全思路，改为以 API 为核心的单词补全模式。
  - 继续保留并写回三个核心字段：
    - `syllable_text`
    - `syllable_pronunciation`
    - `memory_tip`
  - 新增专有名词标签判断，便于后续词库管理：
    - `person`
    - `place`
    - `country_region`
    - `organization`
    - `other`
    - 非专有名词保持空值
  - 对 syllable 结果增加更严格校验：
    - 拦截把尾辅音或辅音簇拆成独立音节的结果
    - 对“应该补全但首次被清空”的词增加二次补请求
  - 前端任务区改成更接近 `mode1` 的批处理样式：
    - 任务队列
    - 多 API 分配
    - `提取进度（按教材）`
    - `实时回传（按教材分组，逐条追加）`
    - 每个教材下可查看 `结果明细` 与 `调试日志`
  - 前端输出策略与模式二对齐：
    - 支持原文件写回
    - 支持同目录副本输出

- 本轮质量评估：
  - 八年级上册结果明显优于小学低年级，已达到“中等偏上、可继续优化后使用”状态。
  - 小学三年级上、下册覆盖率仍偏低，拆分风格还偏机械，暂不建议直接作为最终成品。
  - 八年级上册统计：
    - `TOTAL 446`
    - `FILLED 241`
    - `RATE 0.5404`
  - 三年级上册统计：
    - `TOTAL 107`
    - `FILLED 22`
    - `RATE 0.2056`
  - 三年级下册统计：
    - `TOTAL 113`
    - `FILLED 28`
    - `RATE 0.2478`

### 29.3 新增 `mode8_phrase_excel_merge.py` 用于短语补录
- 文件：
  - `tool/mode8_phrase_excel_merge.py`
  - `tool/run_mode8.bat`

- 目标：
  - 把“待处理短语”目录中的 Excel 短语内容补入现有短语 JSONL。
  - 与 `mode1` 提取结果协同，而不是重新发明短语格式。

- 本轮设计与落地：
  - 新建独立模式八，不塞回 `mode1`。
  - 扫描来源：
    - `待处理短语/版本/年级册数.xlsx`
  - 匹配目标：
    - `data/版本/短语/年级_册数*.jsonl`
  - 去重逻辑只看短语英文本体，兼容：
    - 大小写差异
    - 多余空格
  - 已存在则不写入，不存在才补入。
  - 保持与现有短语结构一致：
    - `phonetic=""`
    - `pos=""`
  - API 仅补充标准例句字段：
    - `example`
    - `example_zh`
  - 支持多 API 并行、批量处理、动态写回、任务栏和实时回传。

### 29.4 额外结论与边界说明
- 本轮没有继续推进 `mode5`。
- 本轮未迁移旧目录素材，而是转向新目录结构下重新生成。
- 本轮未继续扩展 `mode3` 高频问题词清单，先以质量评估结论收口。
- 本轮所有修改集中在独立模式文件，不再围绕 `app.py` 进行改动。

### 29.5 本轮验证
- 已执行：
  - `python -m py_compile tool/mode2_jsonl_audio.py`
  - `python -m py_compile tool/mode3_word_syllable_fill.py`
  - `python -m py_compile tool/mode8_phrase_excel_merge.py`

- 已确认：
  - 模式二、模式三、模式八当前脚本均可通过语法编译检查。
  - 模式二与模式三的前端交互逻辑已向 `mode1` 的任务式体验靠拢。

---

## 30. 2026-04-21 mode2 / mode8 follow-up

### 30.1 mode8 fixes
- Added missing `openpyxl` dependency into `tool/requirements.txt`.
- Restored `qwen/qwen-2.5-vl-72b-instruct` in `tool/mode8_phrase_excel_merge.py`.
- Synced the qwen price label with mode1 (`OpenRouterʵʱ价`).

### 30.2 mode8 checks
- Reviewed `七年级_上册_current_mode8.jsonl`.
- Confirmed original rows were preserved and mode8 expanded phrase rows successfully.
- Verified phrase examples stay in `meanings[].example` / `example_zh`.

### 30.3 mode3 checks
- Reviewed mode3 outputs for:
  - PEP小学三年级上册
  - PEP小学三年级下册
  - 人教版初中八年级上册
- Conclusion: lower fill rate in grade 3 is mostly expected because many words are short/simple; some multi-syllable words were still skipped due to conservative model + validation behavior.

### 30.4 mode2 phrase TTS normalization
- Kept JSON structure unchanged.
- Added runtime-only phrase text normalization before sending phrase `word` to TTS.
- Current normalization rules:
  - `sb.` -> `somebody`
  - `sth.` -> `something`
  - `sp` -> `someplace`
  - `sb's` -> `somebody's`
  - `one's` -> `someone's`
  - `/` -> `or`
  - default `...` / `(...)` -> `,`
  - special case: `How about ...?` / `What about ...?` -> drop ellipsis and keep `?`
- Applied this to normal audio generation, recorded-jsonl repair, and damaged-audio regeneration paths in `tool/mode2_jsonl_audio.py`.

---

## 31. 2026-04-22 mode5 课文提取链路重构与全量质检

### 31.1 mode5 目录识别与输出路径调整
- 文件：
  - 	ool/mode5_passage_extract.py

- 本轮调整：
  - mode5 不再使用旧目录和旧识别规则。
  - 教材 PDF 改为从：
    - 	ool/待处理教材/版本目录/*.pdf
  - 课文提取范围 TXT 改为从：
    - 	ool/课文提取范围/版本目录/*.txt
  - 匹配规则改为：
    - 以父目录识别教材版本
    - 以文件名识别 年级 + 册数
    - 使用 教材版本 + 年级 + 册数 共同校验，避免仅靠文件名冲突
  - mode5 输出路径统一改到：
    - 	ool/data/教材版本/课文/年级_册数.jsonl

- 前端入口调整：
  - 保留本地目录批量选择入口。
  - 保留手动上传 PDF，但收进小型 expander，不单独占主要入口。
  - 自动识别的 TXT 不再自动写回到输入框，仅显示匹配结果。

### 31.2 mode5 提取精度增强
- 文件：
  - 	ool/mode5_passage_extract.py

- 本轮增强：
  - 强化课文提取 prompt 与 focus hint。
  - 针对 Read and write / Reading time 增加更明确的完整性要求。
  - 增加提取后正文清洗：
    - 去除明显练习指令行
    - 规整多余换行
  - 增加句子拆分、翻译、结果校验的安全包装：
    - _post_process_passage_text
    - _split_passage_sentences_safe
    - _translate_sentences_to_zh_safe
    - _validate_sentence_items_safe
  - 对可疑短结果增加重试：
    - strict_completion
  - 增加记录去重键，避免同页内容重复写入。

### 31.3 mode5 并发模型与前端刷新逻辑调整
- 文件：
  - 	ool/mode5_passage_extract.py

- 本轮调整：
  - 原先 mode5 是“所有 PDF 的所有 task 打平成总任务池并发”。
  - 改为与用户要求一致：
    - 一个 PDF 对应一个 worker
    - 一个 worker 固定绑定一个 API
    - 同一 PDF 内部 task 串行执行
  - 任务表格保留为一行一个 PDF，列为：
    - 教材
    - PDF
    - API分配
    - 状态
    - 目标数
    - 已完成
    - 输出文件
  - 统一 mode5 live table 键名，修复此前因键名错乱导致的：
    - KeyError
    - API 分配显示异常
    - 已完成 数量不更新
  - 去掉 mode5 启动时的专用 st.rerun()。
  - 运行态只保留单块占位区动态更新，不再在页面底部重复渲染整套“提取进度 / Extracted Content / 输出文件”，降低页面回顶和视觉跳动。

### 31.4 旧版 PEP 小学六年级专用模板
- 文件：
  - 	ool/mode5_passage_extract.py

- 背景：
  - 旧人教版（PEP）小学 六年级上、下册的课文版式与新版差异明显：
    - 跨页开篇主题页
    - Let's talk
    - Story time
  - 不能继续沿用普通 section 规则粗提。

- 本轮新增模板判断，仅对：
  - 旧人教版（PEP）小学
  - 六年级
  生效

- 新增三类 task kind：
  - old_pep_opener_spread
    - 用于 page7-8 / 17-18 / 27-28 ... 这类跨页开篇
    - 目标是提取核心句块 / 气泡，不强行拼成长文
  - old_pep_dialogue_only
    - 用于 Let's talk
    - 只提 Let's talk 对话块
    - 忽略 Let's try、题目与练习区
  - old_pep_story_panels
    - 用于 Story time
    - 按分镜顺序提取，而不是按 OCR 顺序乱拼

- 同步改动：
  - 旧版六年级范围 TXT 改为专用解析：
    - 支持 unit 1 page7-8
    - 支持 unit 1 page9 Let's talk
    - 支持 unit 1 page16 Story time
  - prompt 中加入 	emplate_name，并增加旧版六年级专用硬规则。

### 31.5 课文结果人工前质检
- 本轮检查过的主要输出：
  - 	ool/data/人教版（PEP）小学/课文/*.jsonl
  - 	ool/data/人教版初中/课文/*.jsonl
  - 	ool/data/旧人教版（PEP）小学/课文/六年级_上册.jsonl
  - 	ool/data/旧人教版（PEP）小学/课文/六年级_下册.jsonl

- 结论：
  - sentences[].zh 早期曾出现两类问题：
    - 被写成 {'text': '...'} 风格字符串
    - 局部记录 zh 为空
  - 已在 mode5 中增加翻译结果规范化，兼容：
    - dict 返回
    - JSON 字符串返回
    - Python dict 字符串返回
  - 旧版六年级中有一条记录曾被错误写成 ?，后已直接修复。

### 31.6 已直接修补的课文 JSONL 异常
- 本轮直接修补了以下记录的 sentences[].zh 缺失问题：
  - 	ool/data/旧人教版（PEP）小学/课文/六年级_下册.jsonl
    - Unit 2 Section OLD Let's talk
  - 	ool/data/人教版初中/课文/七年级_上册.jsonl
    - Unit 5 Section B 1b
    - Unit 6 Section A 2a and 2d
  - 	ool/data/人教版初中/课文/七年级_下册.jsonl
    - Unit 8 Section B 1b
  - 	ool/data/人教版（PEP）小学/课文/三年级_下册.jsonl
    - Unit 2 Section B Read and write

- 额外修补：
  - 	ool/data/人教版初中/课文/七年级_上册.jsonl
    - Unit 6 Section A 2a and 2d
    - 重做 sentences 拆分，避免把整段采访压成 1 个句子

- 最终复扫结果：
  - 当前所有已生成 data/*/课文/*.jsonl 中：
    - 无空 passage_text
    - 无 zh=""
    - 无 zh="????" 类异常

### 31.7 mode2 当前确认到的副本命名现状
- 文件：
  - 	ool/mode2_jsonl_audio.py

- 本轮确认：
  - mode2 当前副本写入命名仅基于：
    - 教材版本 + 年级 + 册数 + 内容类型
  - 不包含 source_tag
  - 因此不同 source_tag 的初中单词在副本模式下会出现：
    - _mode2.jsonl
    - _mode2_2.jsonl
    - _mode2_3.jsonl
  - 当前先不修改，待用户本轮音频任务结束后再把副本命名纳入 source_tag

### 31.8 本轮验证
- 已执行：
  - python -m py_compile tool/mode5_passage_extract.py
- 已完成人工/脚本检查：
  - 旧版六年级专用模板输出检查
  - 人教版小学 / 初中课文 JSONL 抽样质量检查
  - 全量 data/*/课文/*.jsonl 异常扫描

### 31.9 mode4 / mode2 后续优化记录
- mode4 教材目录与目录提取优化
  - 优化 PDF 选择方式，改为更接近 mode1 / mode3 的上传与本地多选流程
  - 支持自动读取待处理教材目录下 PDF，并在前端可点击多选后逐一填写目录页码
  - 补齐 mode1 / mode3 风格的任务队列表格、多 API 批量处理、侧边栏模型配置
  - 修复目录型 PDF 文件名兼容问题，支持 `人教版（PEP）小学/三年级_上册.pdf` 这类路径形式
  - 增强前端动态展示，提取过程中可实时看到 mode4 的提取结果与错误信息
  - 新增开关，可在本次批量提取时强制 `unit_desc_short` 置空

- mode4 单元规则兼容扩展
  - 保留原有目录提取规则，不破坏已有可提取类型
  - 新增兼容人教版（PEP）小学目录样式
  - 以三年级上册第 5 页类型为例，支持仅提取“单元号 + 单元标题”
  - 为保持输出结构一致，其余缺失标签统一置空
  - 单元输出目录统一为 `data/教材版本/单元/年级+册数.jsonl`

- 小学单元数据清洗
  - 已清洗现有小学教材单元 JSONL，将 `unit_desc_short` 统一置空
  - 前端增加对应控制开关，便于后续批量提取继续沿用该策略

- mode2 续跑与输出命名优化
  - 副本写入模式下，若目标已存在 `_mode2*.jsonl`，下次会优先续跑最近副本，不再盲目新建 `_mode2_2`
  - 输出文件命名增加 `source_tag` 后缀（若存在），用于区分来源并避免冲突
  - `source_tag` 兼容可选：没有该字段时仍按 `年级_册别.jsonl` 正常输出
  - 相关逻辑集中在 `tool/mode2_jsonl_audio.py`

- mode2 批量生成检查结论
  - 已核查单词、短语、课文句子三类音频生成逻辑、写回字段与输出目录
  - 当前支持一次性混合上传多份 word / phrase / passage JSONL 批量生成
  - 副本写入下具备较稳定的中断续跑能力
  - 输出路径仍受 `book_version + content_type + grade + semester + source_tag` 共同影响

- mode2 前端性能优化
  - 新增 `Enable live updates` 开关
  - 关闭后，批量处理期间不再高频刷新前端状态文本、任务表格和逐文件明细
  - 该优化主要用于减轻大批量生成时的 Streamlit 重渲染压力
  - 不影响实际音频生成、JSONL 写盘、续跑和副本写入逻辑

- 本次校验
  - `conda run -n english_book python -m py_compile tool/mode2_jsonl_audio.py`

### 32. 管理员端课文导入兼容与六年级导入报错修复
- 课文管理导入逻辑改造
  - 将管理员端课文导入改为与单元/单词一致的流程：
    - 先选择目标教材版本
    - 上传 `年级_册次.jsonl`
    - 从文件名解析年级与册次，不再从文件名解析教材版本
  - 导入前增加教材范围校验：
    - 校验目标教材版本下是否已配置对应年级、册次
    - 仍保留已存在数据时的阻断提示
  - 课文 JSONL 预检查兼容 UTF-8 BOM
  - 导入弹窗去掉手动逐行改教材版本/年级/册次，改为只展示解析结果

- 课文字段入库与回显补全
  - 后端课文导入、编辑、查询链路补齐以下字段：
    - `unit_no`
    - `is_starter`
    - `labels`
    - `display_label`
    - `task_kind`
    - `matched_labels`
    - `source_line`
    - `raw_scope_line`
  - `labels` 与 `matched_labels` 采用 JSON 文本方式落库并在接口返回时还原为数组
  - 课文仍沿当前策略保留 `_source_file -> source_file` 的映射

- 数据库兼容迁移
  - 扩展 `passages` 表自动迁移，启动时自动补齐：
    - `unit_no`
    - `is_starter`
    - `labels_text`
    - `display_label`
    - `task_kind`
    - `matched_labels_text`
    - `source_line`
    - `raw_scope_line`
  - 保留并继续执行 `passage_sentences.newline_after` 的兼容迁移

- 六年级课文导入 500 排查结论
  - 通过 `runlogs/user-service.log` 定位到导入失败根因不是 JSONL 格式错误，而是数据库字段长度不足
  - PostgreSQL 实际报错：
    - `value too long for type character varying(20)`
  - 命中字段：
    - `passages.label`
  - 触发样例：
    - `old_pep_opener_spread`
  - 修复：
    - 将 `Passage.label` 长度从 `20` 扩到 `100`
    - 在 `PassageSchemaMigrationRunner` 中增加
      - `ALTER TABLE passages ALTER COLUMN label TYPE varchar(100)`
  - 结论：
    - 人教版小学六年级课文这批数据本身格式可导，重启 `user-service` 触发迁移后即可重新导入

- 本次涉及文件
  - `front/src/components/admin/PassageManagement.tsx`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/controller/PassageController.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/model/Passage.java`
  - `backend/user-service/src/main/java/com/kineticscholar/userservice/config/PassageSchemaMigrationRunner.java`

- 验证
  - `cmd /c npm run build` 通过
  - `mvn -q -DskipTests compile` 通过

### 33. 2026-04-23 学生端单元学习分层展示
- 背景
  - 学生端“单元学习”页原先将当前范围内所有单元卡片混排展示
  - 虽然卡片底部已有“已解锁 / 未解锁”状态，但学生不容易快速定位当前可学习单元

- 本轮改动
  - 页面：`front/src/pages/StudentDashboard.tsx`
  - 将单元列表按 `locked` 状态拆分为两组：
    - `已解锁单元`
    - `待解锁单元`
  - 两组采用上下分区展示，并分别显示数量
  - 保留原有卡片样式、进度条、点击行为与单元顺序
  - 抽出公共 `renderUnitGrid` 渲染函数，避免同一套卡片 JSX 重复维护

- 展示规则
  - `已解锁单元` 区仅展示 `locked === false` 的卡片
  - `待解锁单元` 区仅展示 `locked === true` 的卡片
  - 若某一组为空，则隐藏该分区
  - 若整体无单元，继续沿用原有空状态提示

- 设计文档
  - `docs/superpowers/specs/2026-04-23-student-unit-layering-design.md`

- 验证
  - `cmd /c npm run build` 通过

### 34. 2026-04-23 学生端真实打卡与月历展示
- 背景
  - 学生端控制面板中的“连续打卡 / 今日打卡 / 日历高亮”原先仅为前端占位效果
  - 刷新后状态丢失，且没有数据库记录

- 本轮后端改动
  - 服务：`backend/user-service`
  - 新增实体：
    - `StudentCheckInRecord`
    - `StudentCheckInCalendarView`
  - 新增仓库：
    - `StudentCheckInRecordRepository`
  - 新增服务：
    - `StudentCheckInService`
    - `StudentCheckInServiceImpl`
  - 新增迁移：
    - `StudentCheckInSchemaMigrationRunner`
  - 新增接口：
    - `GET /api/users/students/check-in-calendar?year=&month=`
    - `POST /api/users/students/check-in`

- 数据规则
  - 打卡日期按 `Asia/Shanghai`（北京时间）自然日计算
  - 每个学生同一天只允许一条记录
  - 数据库通过唯一索引 `uk_student_checkin_user_date` 兜底
  - 连续打卡定义为“从今天向前连续存在打卡记录的天数”
  - 若今天未打卡，则连续天数为 `0`

- 前端改动
  - 页面：`front/src/pages/StudentDashboard.tsx`
  - 新增 `studentCheckInApi`
  - 控制面板中的打卡区改为真实数据驱动：
    - 页面进入时加载当前月打卡数据
    - 点击“今日打卡”后写入后端并实时刷新
    - 按钮根据真实状态切换为 `今日打卡 / 今日已打卡 / 打卡中...`
  - 原先简单的 `1..30` 占位格子改为真实月历布局
  - 本月已打卡日期按返回的 `checkedInDates` 高亮展示

- 稳定性补充
  - `StudentCheckInServiceImpl` 对并发重复打卡加入 `DataIntegrityViolationException` 兜底
  - 若重复点击导致另一请求先写入成功，当前请求会直接回读月历数据，不报错

- 设计文档
  - `docs/superpowers/specs/2026-04-23-student-checkin-calendar-design.md`

- 验证
  - `mvn -q -DskipTests compile` 通过
  - `cmd /c npm run build` 通过

### 35. 2026-04-23 学生端控制面板待办卡片与任务卡片风格统一
- 背景
  - 学生端控制面板统计区下方存在较明显空白
  - 单元学习卡片风格较完整，但单词测试 / 单词复习任务卡片风格相对简化，页面视觉不统一

- 本轮控制面板改动
  - 页面：`front/src/pages/StudentDashboard.tsx`
  - 在控制面板统计卡片下方新增 `待完成任务` 区块
  - 最多展示 3 张入口卡片，每类任务最多 1 张：
    - 已解锁待学习单元
    - 待完成单词测试
    - 待完成单词复习
  - 取数规则：
    - 单元：取第一个已解锁单元卡片
    - 测试：取第一个 `status !== completed` 的测试任务
    - 复习：取第一个 `status !== completed` 的复习任务
  - 点击行为：
    - 单元卡片：进入对应单元页面
    - 测试卡片：切换到 `word-tests`
    - 复习卡片：切换到 `word-reviews`
  - 若三类都无待办，则显示 `当前没有待完成任务`

- 本轮任务卡片统一
  - 页面：
    - `front/src/components/student/WordTestView.tsx`
    - `front/src/components/student/WordReviewView.tsx`
  - 将任务列表卡片外壳统一为接近单元学习卡片的视觉骨架：
    - 顶部短标签
    - 右上状态图标
    - 中部标题 / 摘要
    - 进度条区域
    - 底部状态文案 + 操作按钮
  - 保留原有业务信息，不删字段：
    - 单词测试保留标题、题量、合格分、累计完成、最高分、最佳用时、操作按钮
    - 单词复习保留标题、每日数量、掌握进度、模式说明、今日完成态/再次复习按钮

- 设计文档
  - `docs/superpowers/specs/2026-04-23-student-dashboard-task-cards-design.md`

- 验证
  - `cmd /c npm run build` 通过
### 36. 2026-04-23 student dashboard stats carousel and proper noun carousel
- scope
  - implement real student learning stats in `backend/test-service`
  - add dashboard proper-noun carousel and stats carousel in `front/src/pages/StudentDashboard.tsx`
- backend
  - added `student_learning_stats` table entity and repository
  - added `StudentLearningStatsService` rebuild/read/increment logic
  - added `GET /api/tests/student-learning-stats?userId=`
  - wired learning-group completion into stats updates
  - wired word-review daily session submission into stats updates
  - rebuild logic reads existing `learning_group_progress` and `word_review_daily_sessions`, so old data is not lost on first access
- frontend
  - added `studentLearningStatsApi.get(...)`
  - dashboard top area now includes a proper-noun carousel sourced from current grade lexicon
  - filter uses `proper_noun_type in [place, country_region]`
  - random picks up to 10 words, one-at-a-time rotation
  - selected word set is fixed in `sessionStorage` for the same login session
  - hover pauses the proper-noun carousel and the stats carousel
  - stats carousel rotates between `总完成` and `今日完成`
  - stats items include `单词 / 短语 / 课文 / 单词复习`
- verify
  - `mvn -q -DskipTests compile`
  - `cmd /c npm run build`

---

## 17. 2026-04-23 ~ 2026-04-24 学生端控制面板与闯关逻辑修复记录

### 17.1 学生端单元学习页改版
- 将学生端单元学习界面拆分为“已解锁单元”和“待解锁单元”上下两层展示。
- 增加中文小标题与数量统计，帮助学生更快定位当前可学习内容。
- 控制面板下方增加待完成任务卡片入口，包含单元学习、单词测试、单词复习三类任务。
- 将单词测试、单词复习卡片风格统一到单元学习卡片样式体系。

### 17.2 学生端打卡日历与学习统计
- 实现学生打卡真实入库，打卡日期存储到数据库，并在控制面板以日历形式展示。
- 后端新增学生学习统计能力，支持累计完成与今日完成两类数据。
- 新增 `StudentLearningStats` 相关实体、服务、接口，并接入单元学习完成、单词复习完成等统计更新。
- 控制面板新增学习统计卡，展示单词、短语、课文、单词复习四类统计。

### 17.3 学生端专有名词轮播
- 在控制面板右侧新增专有名词轮播卡。
- 数据来源为学生当前年级词库中 `proper_noun_type` 为 `place`、`country_region` 的词条。
- 采用前端 `sessionStorage` 固定同一会话内展示集合，避免同一登录会话频繁变化。
- 支持自动轮播、鼠标悬浮暂停、移出后继续轮播。

### 17.4 控制面板布局调整
- 将“打卡日历”放在左侧，“专有名词轮播 + 学习统计”放在右侧上下堆叠。
- 调整右侧两块卡片高度比例，使专有名词卡更矮、学习统计卡更高。
- 统一右侧两块卡片宽度，要求整体高度与左侧日历卡视觉对齐。
- 对控制面板相关文案与样式进行了多轮微调。

### 17.5 学生端白屏排查与修复
- 排查学生端白屏问题，确认前端构建可通过，问题为运行时渲染异常。
- 修复 `StudentDashboard.tsx` 中专有名词轮播小圆点 `aria-label` 的异常表达式，该问题会在渲染时触发报错，导致页面闪现后白屏。
- 为控制面板待完成任务与单词测试页增加空值保护，避免接口数据不完整时因 `.items.length` 等访问导致页面崩溃。

### 17.6 单词闯关 / 短语闯关逻辑修复
- 重点修复 `front/src/pages/StudentUnit.tsx` 中单词闯关与短语闯关共用引擎逻辑。
- 修复熔断队列污染问题：英译汉、补全、汉译英各环节切换时重建当前组基础队列，保证一个环节的错误不会影响下一个环节。
- 修复一组四个环节完成后跳转下一组时偶发“当前组无内容”的问题：切换下一组前先确保下一组内容已加载，再更新队列。
- 单词补全与汉译英环节增加自动聚焦：进入页面后默认聚焦到第一个待填空位或汉译英输入框，无需手动点击。

### 17.7 单词闯关内容增强
- 在单词闯关第一个“卡片认识”环节增加 mode3 新增记忆辅助字段展示。
- 当前已接入字段：
  - `syllable_text`
  - `syllable_pronunciation`
  - `memory_tip`
- 仅当对应字段有内容时展示，避免无效占位。

### 17.8 本次涉及的关键文件
- `front/src/pages/StudentDashboard.tsx`
- `front/src/pages/StudentUnit.tsx`
- `front/src/components/student/WordTestView.tsx`
- `backend/test-service/src/main/java/com/kineticscholar/testservice/model/StudentLearningStats.java`
- `backend/test-service/src/main/java/com/kineticscholar/testservice/service/StudentLearningStatsService.java`
- `backend/test-service/src/main/java/com/kineticscholar/testservice/service/impl/StudentLearningStatsServiceImpl.java`
- `backend/test-service/src/main/java/com/kineticscholar/testservice/controller/LearningProgressController.java`
- `backend/test-service/src/main/java/com/kineticscholar/testservice/controller/TestController.java`
- `backend/test-service/src/main/java/com/kineticscholar/testservice/service/impl/TestServiceImpl.java`

### 17.9 验证情况
- 前端多次执行 `npm run build`，构建通过。
- 本轮记录包含学生端控制面板、白屏修复、打卡统计、专有名词轮播、单词/短语闯关逻辑修复等连续工作内容。
### 37. 2026-04-24 mode7 sync question extractor continuation
- scope
  - continue `tool/mode7_exam_extract.py`
  - focus on reading extraction quality, multi-key API enhancement, and simplified result display
  - review regenerated JSONL under `D:\zip\tool\exam_data\人教版初中`

- completed
  - repaired the restored `mode7` script so it can compile and run again
  - added qwen model option to mode7 model config
  - kept one shared `base_url + model` config for all API keys
  - added multi-key parsing support from primary key + extra key list
  - implemented parallel enhancement scheduling by API-key count
  - each key handles one task at a time and then continues with the next pending task after completion
  - simplified mode7 result UI to summary-only view
  - removed grouped live preview / detailed result preview logic from the render path
  - changed result tracking from file-name-only matching to source-path-based matching to avoid same-name overwrite
  - fixed one real parsing bug where question splitting treated numeric fragments inside options such as `180-2000.` as a new question number
  - rebuilt output filename / input-output default directory / source-meta parsing logic so local reruns no longer fail on corrupted filenames
  - verified syntax with `python -m py_compile tool/mode7_exam_extract.py`

- quality check before API enhancement
  - reran local no-API extraction in the `english_book` environment
  - rule-only bad reading questions were reduced to mainly structure / route / picture questions
  - representative remaining rule-only failures at that stage:
    - `Unit2`: Q65, Q71
    - `Unit3`: Q66, Q70
    - `Unit4`: Q68
    - `Unit5`: Q67, Q72
    - `Unit6`: Q71
    - `Unit7`: Q61
    - `Unit8`: Q61, Q67
  - this confirmed that ordinary text-choice reading questions were mostly handled by rules, and the hard remainder was mainly visual / structural questions

- quality check after user API run
  - checked current files in `D:\zip\tool\exam_data\人教版初中`
  - all 8 current JSONL files now have:
    - no reading questions with missing or fewer-than-4 options
    - no empty answers
    - no empty analyses
  - representative API-reconstructed questions now look usable:
    - `Unit2` Q71 route question
    - `Unit3` Q66 graph/picture question
    - `Unit4` Q68 valley picture question
    - `Unit5` Q67 picture meaning question
  - these reconstructed questions are marked with `remarks = reconstructed_from_context`

- current mode7 status
  - mode7 is now in a much better usable-output state
  - rule extraction handles normal text questions better than before
  - API enhancement can fill hard reading questions so the final JSONL is structurally complete

- mode7 remaining problems
  - some structure / picture / route questions are not faithful extraction from original visual options; they are semantic reconstruction based on passage + answer
  - a few structure-question rows appear to be reconstructed but are not consistently tagged with `reconstructed_from_context`
  - therefore current outputs are strong in usability, but not yet guaranteed to be strictly source-faithful for all visual/diagram-style reading items
  - `reading_qa` questions 73-75 are still skipped as unsupported in the current normalized output flow
  - some UI / CLI labels in `tool/mode7_exam_extract.py` were normalized to plain English during repair to avoid encoding breakage; if needed later, they can be re-localized carefully

- suggested improvements
  - add a dedicated marker such as `option_source: extracted | reconstructed`
  - ensure every AI-rebuilt structure / route / picture question is consistently tagged
  - tighten the enhancement prompt for structure questions so model output stays closer to likely original option forms
  - optionally add a stricter mode that refuses reconstruction when the source visual choices are absent, leaving such questions flagged for manual review instead
  - decide whether `reading_qa` 73-75 should remain unsupported or be added as a separate normalized question type

- files mainly touched
  - `tool/mode7_exam_extract.py`

- verification
  - `python -m py_compile tool/mode7_exam_extract.py`
  - local batch quality scan against `D:\zip\tool\exam_data\人教版初中`
## 27. 2026-04-24 题库管理重构第一阶段

### 27.1 设计文档落地
- 新增题库管理重构规格文档：
  - `docs/superpowers/specs/2026-04-24-question-bank-management-design.md`
- 明确采用“题目中心”方案：
  - `question_bank_import_batches`
  - `question_bank_groups`
  - `question_bank_items`
  - `question_bank_options`

### 27.2 test-service 新题库骨架
- 新增题库实体：
  - `QuestionBankImportBatch`
  - `QuestionBankGroup`
  - `QuestionBankItem`
  - `QuestionBankOption`
- 新增题库仓库：
  - `QuestionBankImportBatchRepository`
  - `QuestionBankGroupRepository`
  - `QuestionBankItemRepository`
  - `QuestionBankOptionRepository`
- 新增题库 DTO / Service / Controller：
  - `QuestionBankImportResult`
  - `QuestionBankImportBatchView`
  - `QuestionBankQuestionSummaryView`
  - `QuestionBankQuestionDetailView`
  - `QuestionBankQuestionUpdateRequest`
  - `QuestionBankOptionPayload`
  - `QuestionBankOptionView`
  - `QuestionBankService`
  - `QuestionBankServiceImpl`
  - `QuestionBankController`

### 27.3 已实现能力
- 支持 JSONL 导入题库
- 支持导入批次记录查询
- 支持按教材范围/题型/状态/关键词查询题目
- 支持单题详情读取
- 支持单题编辑：
  - 题干
  - 共享题干
  - 材料
  - 选项
  - 答案
  - 解析
  - 难度
  - 标签
  - 状态
  - 备注
- 支持单题删除，并在题组清空时自动清理空题组

### 27.4 前端管理员端切换
- `front/src/lib/auth.ts`
  - 新增 `questionBankApi`
  - 新增题库相关类型定义
- `front/src/components/admin/ExamManagement.tsx`
  - 重写为“题库管理”页面
  - 支持 JSONL 导入
  - 支持批次查看
  - 支持题目筛选
  - 支持单题详情编辑
- `front/src/pages/AdminDashboard.tsx`
  - 将“同步题库”入口改为“题库管理”
  - 文案统一改为题库语义

### 27.5 本轮验证
- `mvn -q -DskipTests compile` in `backend/test-service`
- `cmd /c npm run build` in `front/`

### 27.6 当前遗留
- 旧 `exam-papers` 相关后端接口与旧试卷模型代码仍在仓库中，尚未彻底清理
- 学生端 `StudentUnit.tsx` 仍保留旧 quiz 依赖，避免本轮直接切断学生端运行路径
- 下一阶段应继续：
  - 清理旧同步卷管理接口和无用 DTO / model / repository
  - 决定学生端 quiz 的迁移/下线策略
  - 为教师端后续组卷设计题库消费接口
### 27.7 2026-04-24 implementation cleanup
- removed the old student-side unit quiz entry from `front/src/pages/StudentUnit.tsx`
- removed the legacy `examApi` client and related exam-paper types from `front/src/lib/auth.ts`
- removed externally exposed legacy sync-paper routes from `backend/test-service/src/main/java/com/kineticscholar/testservice/controller/TestController.java`
  - `/api/tests/exam-papers/**`
  - `/api/tests/student-exam-practices/**`
- verified again:
  - `cmd /c npm run build` in `front/`
  - `mvn -q -DskipTests compile` in `backend/test-service`

## 28. 2026-04-24 question bank + teacher paper + student delivery continuation

### 28.1 admin-side question bank management landed
- replaced the old sync-paper oriented flow with question-bank management
- designed the new import/storage model around JSONL upload into normalized question records instead of paper snapshots
- added backend question-bank models / repositories / services / controllers for:
  - import batches
  - question groups
  - question items
  - options
- added admin-side question-bank import and browsing UI, with support for the current JSONL structure under `exam_data/人教版初中`
- aligned teacher paper generation to read from the new question bank instead of the old sync-paper path

### 28.2 teacher-side paper management and generation landed
- added teacher exam paper management UI and backend APIs
- teacher can generate papers by section config from the question bank
- section matching is now based on canonical backend question types:
  - `single_choice`
  - `multiple_choice`
  - `cloze`
  - `reading`
  - `seven_choice`
- teacher paper generation was adjusted to use managed textbook scope data rather than hardcoded textbook assumptions
- added teacher-side paper preview / item replacement / item deletion / paper persistence flow
- added paper linkage into unit-assignment publishing so a teaching task can carry a teacher paper to students

### 28.3 student-side teacher paper delivery flow implemented
- new student flow no longer uses the legacy `exam_papers` practice path
- student unit test is now driven by `unit_assignments.paperId -> teacher_exam_papers`
- added backend entities and persistence for:
  - `StudentTeacherExamSubmission`
  - `StudentTeacherExamWrongNotebookItem`
- added APIs for:
  - loading the assigned teacher paper
  - submitting student answers
  - reading teacher-paper wrong notebook groups
- frontend now evaluates correctness immediately after submit and shows:
  - right / wrong per question
  - correct answer
  - analysis
- backend still validates submitted results against the teacher paper snapshot before persistence
- wrong questions are automatically written into the wrong notebook with:
  - material / shared stem
  - student submitted answer
  - correct answer
  - analysis
  - source-based grouping info

### 28.4 student UX refinements completed in this session
- restored student access to teacher-published unit tests
- added `StudentTeacherPaper.tsx` as the student unit-test page
- added grouped-question material pinning so reading / cloze / seven-choice material can stay fixed on the left while the student scrolls questions
- fixed student-side test page rendering and replaced broken garbled result strings with stable UI text
- mapped teacher paper section `questionType` codes to readable Chinese labels in the student test page
- added direct teacher-paper entry from:
  - student dashboard pending-task card
  - student unit page header button
- student dashboard wrong-notebook view now reads real teacher-paper wrong notebook data instead of placeholder content

### 28.5 runtime / build status during this conversation
- investigated `run_all.bat` startup regression and confirmed service startup issues were related to current workspace changes rather than original baseline assumptions
- after the latest student-side fixes, both builds passed:
  - `cmd /c npm run build` in `front/`
  - `mvn -pl test-service -am compile` in `backend/`

### 28.6 files most relevant to this conversation
- backend
  - `backend/test-service/src/main/java/com/kineticscholar/testservice/service/impl/TestServiceImpl.java`
  - `backend/test-service/src/main/java/com/kineticscholar/testservice/controller/TestController.java`
  - `backend/test-service/src/main/java/com/kineticscholar/testservice/service/impl/TeacherExamPaperServiceImpl.java`
  - `backend/test-service/src/main/java/com/kineticscholar/testservice/service/impl/QuestionBankServiceImpl.java`
  - `backend/test-service/src/main/java/com/kineticscholar/testservice/model/StudentTeacherExamSubmission.java`
  - `backend/test-service/src/main/java/com/kineticscholar/testservice/model/StudentTeacherExamWrongNotebookItem.java`
- frontend
  - `front/src/components/admin/ExamManagement.tsx`
  - `front/src/components/teacher/TeacherExamPaperManagement.tsx`
  - `front/src/pages/StudentTeacherPaper.tsx`
  - `front/src/pages/StudentDashboard.tsx`
  - `front/src/pages/StudentUnit.tsx`
  - `front/src/lib/auth.ts`
