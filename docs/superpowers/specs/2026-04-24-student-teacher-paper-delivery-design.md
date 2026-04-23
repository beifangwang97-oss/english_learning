# Student Teacher Paper Delivery Design

## Goal

Connect student-side unit tests directly to teacher-generated papers.

Teachers publish a unit assignment with a linked `teacher_exam_papers` record. Students should then be able to:

- see the linked test entry from the assigned unit
- open the teacher paper in a dedicated student test page
- answer questions in the browser
- pin material/shared stems for grouped reading-style questions
- submit once and immediately see right/wrong state, correct answers, and analysis
- have wrong questions written to a new wrong-notebook flow grouped by source

This design does not extend the legacy `exam_papers` student practice flow.

## Decision

Use teacher-paper snapshots as the single source of truth for student unit tests.

- Delivery model:
  publish `paperId` and `paperTitle` through `unit_assignments`, then load the linked teacher paper detail for the student
- Judging model:
  front end performs immediate judging from the delivered teacher paper snapshot
- Persistence model:
  back end stores the student submission, per-item answers, and wrong-notebook rows, and performs only light consistency checks against the teacher paper snapshot

This keeps the user experience fast while preserving a stable record in the database.

## Scope

### In scope

- restore student-side unit test entry for published teacher papers
- add a student teacher-paper test page
- support grouped material-based questions
- support pinning material/shared stem on the left while questions scroll on the right
- immediate result rendering after submit
- store submission results in new teacher-paper student records
- store wrong questions with material/shared stem and submitted answer
- show wrong notebook grouped by source

### Out of scope

- reusing old `exam_papers` practice APIs for teacher papers
- teacher grading workflow
- multiple attempts policy beyond the default single submit path
- analytics dashboards for teacher-paper results

## Data Model

### Existing source records

- `unit_assignments`
  already contains `paperId` and `paperTitle`
- `teacher_exam_papers`
- `teacher_exam_sections`
- `teacher_exam_section_items`
  `snapshot_json` is the stable delivery payload for each section item

### New records

#### `student_teacher_exam_submissions`

One submission per student attempt.

Suggested fields:

- `id`
- `assignment_id`
- `paper_id`
- `user_id`
- `paper_title`
- `book_version`
- `grade`
- `semester`
- `unit_code`
- `score`
- `correct_count`
- `total_count`
- `duration_seconds`
- `submitted_at`
- `answers_json`
- `result_json`
- `created_at`
- `updated_at`

#### `student_teacher_exam_wrong_notebook_items`

One row per stable question source per student, merged by source question identity.

Suggested fields:

- `id`
- `user_id`
- `assignment_id`
- `paper_id`
- `paper_title`
- `book_version`
- `grade`
- `semester`
- `unit_code`
- `section_id`
- `section_title`
- `section_question_type`
- `section_item_id`
- `question_id`
- `question_uid`
- `question_no`
- `question_type`
- `source_file`
- `source_label`
- `shared_stem`
- `material`
- `stem`
- `options_json`
- `submitted_answer_json`
- `correct_answer_json`
- `analysis`
- `wrong_count`
- `last_wrong_at`
- `created_at`
- `updated_at`

`source_file` is the initial notebook grouping key. If the question bank later gets a first-class `source_tag`, grouping can switch to that field without changing the student UI contract.

## API Design

### Student teacher paper delivery

#### `GET /api/tests/student-teacher-papers/unit-assignment/{assignmentId}`

Returns:

- assignment metadata
- linked teacher paper detail
- latest submission summary if present

Used for opening the student test page from a unit assignment.

### Student submit

#### `POST /api/tests/student-teacher-papers/unit-assignment/{assignmentId}/submit`

Request contains front-end judged payload:

- `userId`
- `durationSeconds`
- `answers`
- `score`
- `correctCount`
- `totalCount`
- `resultItems`

Each result item should include:

- `sectionId`
- `sectionItemId`
- `itemType`
- `questionId`
- `questionUid`
- `questionNo`
- `questionType`
- `submittedAnswer`
- `correctAnswer`
- `correct`
- `sourceFile`
- `sharedStem`
- `material`

Server behavior:

- load linked teacher paper from assignment
- verify assignment belongs to the target student
- perform light consistency checks on `paperId`, `sectionItemId`, `questionId`, and expected answers from the teacher paper snapshot
- persist submission
- upsert wrong-notebook rows for incorrect answers
- return stored result payload

### Student wrong notebook

#### `GET /api/tests/student-teacher-papers/wrong-notebook/{userId}`

Returns wrong items grouped by source:

- source group label
- list of wrong items
- latest submitted answer
- attached shared stem/material if present

## Frontend Design

### Dashboard and unit entry

Student dashboard currently uses `unit_assignments` only to unlock units. It must also surface linked teacher papers.

Changes:

- build an assignment map by unit key
- if a unit assignment has `paperId`, show a visible `单元测试` action
- clicking the action opens a dedicated teacher-paper test route

### Student teacher-paper page

New page suggestion:

- `front/src/pages/StudentTeacherPaper.tsx`

Layout:

- top area:
  paper title, scope, submit button, elapsed time
- center:
  exam sections rendered from teacher paper detail
- grouped item mode:
  add a `置顶材料` toggle
  when active, left column shows shared stem/material and right column scrolls questions
- result mode:
  lock inputs
  show right/wrong state, correct answer, and analysis inline

### Input model

- single choice:
  one selected option
- multiple choice:
  ordered or normalized array
- grouped sections:
  answer each child question independently

### Submit behavior

On submit:

1. front end computes correctness from paper snapshot
2. front end builds result payload
3. result mode appears immediately after server success
4. inline answer/analysis visibility is always on after submit

## Judging Rules

Use normalized comparison by question type.

- `single_choice`
  compare normalized scalar value
- `multiple_choice`
  compare normalized sorted arrays
- `cloze`
  compare normalized scalar or array exactly as stored in snapshot answer
- `reading`
  compare child question by child question
- `seven_choice`
  compare normalized scalar or ordered answers based on stored answer shape

Back end does not own the main scoring UX. It only validates that the submitted result matches the delivered paper snapshot shape and expected answers.

## Wrong Notebook Behavior

### Insert rules

For each incorrect question:

- create or update one wrong-notebook row keyed by student + stable question identity
- store latest submitted answer
- increment `wrong_count`
- update `last_wrong_at`
- preserve material/shared stem in the row

### Grouping

Student notebook UI groups by source.

Initial grouping key:

- `source_file` if present
- fallback label `未分类来源`

### Display

Each wrong item shows:

- section title and question type
- material/shared stem if present
- stem and options
- student submitted answer
- correct answer
- analysis

## Error Handling

- if assignment has no linked `paperId`, the student test entry is hidden
- if linked paper no longer exists, the student sees a friendly unavailable state
- if submission payload and teacher paper snapshot mismatch, server rejects with a clear error
- if a student already submitted and resubmission is not allowed, server returns the stored result

## Testing

### Backend

- assignment with linked teacher paper can be loaded by student
- submission persistence works for single and grouped questions
- wrong notebook upserts rather than duplicating identical question sources
- grouped questions save material/shared stem correctly
- light validation rejects tampered answers or foreign section items

### Frontend

- unit card shows test action only when `paperId` exists
- student can open the teacher-paper page
- grouped question material pin layout works on desktop and mobile
- submit renders inline right/wrong result state
- wrong notebook page can read new grouped payload

## Migration Notes

- keep old `exam_practice_records` and `exam_wrong_notebook_items` untouched
- add new teacher-paper student tables instead of overloading old exam tables
- student unit test UI should prefer teacher-paper flow when `paperId` is present on the assignment
