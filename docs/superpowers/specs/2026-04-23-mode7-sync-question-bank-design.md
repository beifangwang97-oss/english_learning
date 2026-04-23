# Mode7 Sync Question Bank Design

Date: 2026-04-23

## Goal

Redesign `tool/mode7_exam_extract.py` from a paper-oriented extractor into a standardized sync question bank builder for junior-high objective questions.

The first implementation target is limited to:

- junior-high textbooks only
- `exam_scene = "同步测试"` only
- one JSONL row per question
- question types limited to:
  - `single_choice`
  - `cloze`
  - `reading`
  - `seven选五`

The first version should prioritize stable structural extraction over smart pedagogical labeling.

## Why Change

The current Mode7 and exam backend model are centered on full papers with `paper/material/question` hierarchy. That is workable for paper preview, but it is not an ideal long-term base for:

- large searchable question banks
- filtering by textbook scope
- future regrouping and recomposition
- later knowledge-tag and topic expansion

The new design introduces a stable question-bank standard layer first. Database import and admin management can evolve on top of that layer.

## Scope

### In Scope

- scan raw source files under `tool/待处理试卷`
- extract question content from junior-high sync test papers
- normalize extracted content into a question-bank JSONL format
- keep one question per line
- assign stable textbook scope fields
- support shared material sets through `group_uid`
- output validation results for missing or suspicious fields

### Out of Scope For V1

- subjective questions
- auto-generated knowledge or ability labels
- automatic difficulty estimation
- paper-centric database redesign
- final admin import UI redesign
- final serving/query API redesign

## Question Types

Question types are explicit and independent. `reading` and `seven选五` are not merged.

- `single_choice`
- `cloze`
- `reading`
- `seven选五`

## JSONL Standard

Each JSONL line represents exactly one question.

### Required Fields

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
- `material`
- `stem`
- `options`
- `answer`
- `analysis`
- `status`
- `created_at`
- `remarks`

### Field Definitions

#### Identity and provenance

- `question_uid`
  - globally unique per question
  - deterministic when possible, based on source scope plus question identity
- `group_uid`
  - groups questions that share the same material
  - for standalone single-choice questions, `group_uid` may still exist as a single-question group
- `source_type`
  - fixed to `sync_test` in V1
- `source_file`
  - original raw file name
- `parser_version`
  - fixed string such as `mode7_v2`

#### Structural fields

- `question_type`
  - one of the four enums defined above
- `question_no`
  - original question number in the source paper

#### Textbook scope

- `book_version`
- `grade`
- `semester`
- `unit`

`unit_label` is intentionally removed in V1.

#### Exam metadata

- `exam_scene`
  - fixed to `同步测试` in V1
- `knowledge_tags`
  - always `[]` in V1
  - retained only as a future extension field
- `difficulty`
  - always `null` in V1

#### Question content

- `material`
  - shared passage, cloze text, or seven-choice dialogue/article
  - empty string for standalone `single_choice`
- `stem`
  - the actual question prompt
- `options`
  - array of option objects
  - each item shape:
    - `key`
    - `text`
- `answer`
  - object instead of plain string for future expansion
  - V1 shape:
    - `type`
    - `value`
- `analysis`
  - extracted analysis text

#### Workflow and maintenance

- `status`
  - default `draft`
- `created_at`
  - ISO timestamp of export
- `remarks`
  - free text for warnings or extraction notes

### Example Row

```json
{
  "question_uid": "Q_SYNC_人教版初中_七年级_上册_Unit1_READING_001",
  "group_uid": "G_SYNC_人教版初中_七年级_上册_Unit1_READING_001",
  "source_type": "sync_test",
  "source_file": "人教版初中_七年级上册_Unit1_同步测试.doc",
  "parser_version": "mode7_v2",
  "question_type": "reading",
  "question_no": 1,
  "book_version": "人教版初中",
  "grade": "七年级",
  "semester": "上册",
  "unit": "Unit 1",
  "exam_scene": "同步测试",
  "knowledge_tags": [],
  "difficulty": null,
  "material": "阅读材料全文",
  "stem": "What is Jenny's last name?",
  "options": [
    { "key": "A", "text": "Green" },
    { "key": "B", "text": "Brown" },
    { "key": "C", "text": "Smith" },
    { "key": "D", "text": "Miller" }
  ],
  "answer": {
    "type": "single",
    "value": "C"
  },
  "analysis": "根据文中第二句可知……",
  "status": "draft",
  "created_at": "2026-04-23T16:00:00",
  "remarks": ""
}
```

## Grouping Rules

### Single Choice

- `question_type = "single_choice"`
- `material = ""`
- one question per row
- each question can have its own `group_uid` or a single-question group

### Cloze

- `question_type = "cloze"`
- questions sharing the same passage use the same `group_uid`
- each blank/question still becomes its own JSONL row
- shared article text is copied into `material` for each row

### Reading

- `question_type = "reading"`
- all sub-questions under the same article share the same `group_uid`
- article text is copied into `material` for each row

### Seven Choice

- `question_type = "seven选五"`
- all questions under the same article/dialogue share the same `group_uid`
- article/dialogue text is copied into `material` for each row

## Database Direction

V1 implementation does not need to finish database migration, but the JSONL format should align with the following target structure.

### `question_bank_item`

Stores one row per question.

Recommended fields:

- `id`
- `question_uid`
- `group_uid`
- `material_id` nullable
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
- `knowledge_tags_json`
- `difficulty`
- `stem`
- `options_json`
- `answer_json`
- `analysis`
- `status`
- `remarks`
- `created_at`
- `updated_at`

### `question_bank_material`

Stores one row per shared material group.

Recommended fields:

- `id`
- `group_uid`
- `question_type`
- `book_version`
- `grade`
- `semester`
- `unit`
- `source_file`
- `material_text`
- `created_at`
- `updated_at`

### `question_bank_import_batch`

Tracks one Mode7 processing run.

Recommended fields:

- `id`
- `batch_uid`
- `source_dir`
- `output_dir`
- `file_count`
- `question_count`
- `warning_count`
- `error_count`
- `created_at`
- `summary_json`

Tag dictionary tables are intentionally postponed until `knowledge_tags` begins to carry real values.

## Mode7 Responsibilities

Mode7 V2 should be split conceptually into four stages.

### 1. Scan

- discover raw test files from `tool/待处理试卷`
- identify supported junior-high sync test files
- derive scope metadata from filename or directory structure

### 2. Extract

- parse question sections by type
- extract material, stem, options, answer, and analysis
- preserve source order and question numbering

### 3. Normalize

- map extracted rows into the standard JSONL shape
- generate `question_uid`
- generate `group_uid`
- fill default values for:
  - `exam_scene = "同步测试"`
  - `knowledge_tags = []`
  - `difficulty = null`
  - `status = "draft"`

### 4. Validate and Export

- write normalized JSONL
- generate validation report
- report:
  - missing answer
  - missing analysis
  - missing textbook scope
  - duplicate `question_uid`
  - unsupported or ambiguous question types
  - per-type counts

## Implementation Notes For Current Code

The current `tool/mode7_exam_extract.py` already contains useful extraction logic for junior-high sync papers, but it is constrained by the current full-paper model.

The refactor should preserve extraction knowledge where possible, while changing the normalization target from:

- paper-first rows

to:

- question-bank rows

The biggest implementation shift is not the parser itself, but the output model and validation layer.

## Decisions Locked For V1

- junior-high only
- objective questions only
- `reading` and `seven选五` are separate `question_type` values
- one JSONL row per question
- no `unit_label`
- no `ability_tags`
- `knowledge_tags = []`
- `difficulty = null`
- `exam_scene = "同步测试"`
- do not solve smart pedagogical tagging in V1

## Risks

- source paper formats may vary across publishers or date batches
- seven-choice and reading boundaries may not always be parsed from simple markers
- deterministic `question_uid` generation must stay stable across reruns
- material deduplication should happen in database import, not in raw JSONL generation

## Recommended Next Step

Implement Mode7 V2 in two safe passes:

1. refactor output and validation around the new JSONL standard while reusing existing extraction logic
2. only after that, update downstream import/database code to consume the new standard
