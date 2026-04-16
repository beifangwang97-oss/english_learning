package com.kineticscholar.testservice.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kineticscholar.testservice.dto.ExamDeleteResult;
import com.kineticscholar.testservice.dto.ExamImportResult;
import com.kineticscholar.testservice.dto.ExamMaterialUpsertRequest;
import com.kineticscholar.testservice.dto.ExamMaterialView;
import com.kineticscholar.testservice.dto.ExamPaperDetailView;
import com.kineticscholar.testservice.dto.ExamPaperSummaryView;
import com.kineticscholar.testservice.dto.ExamPaperUpdateRequest;
import com.kineticscholar.testservice.dto.ExamQuestionOptionPayload;
import com.kineticscholar.testservice.dto.ExamQuestionOptionView;
import com.kineticscholar.testservice.dto.ExamQuestionUpsertRequest;
import com.kineticscholar.testservice.dto.ExamQuestionView;
import com.kineticscholar.testservice.dto.PublishWordTestRequest;
import com.kineticscholar.testservice.dto.PublishWordReviewRequest;
import com.kineticscholar.testservice.dto.StudentExamPracticeAnswerRequest;
import com.kineticscholar.testservice.dto.StudentExamPracticeQuestionResultView;
import com.kineticscholar.testservice.dto.StudentExamPracticeResultView;
import com.kineticscholar.testservice.dto.StudentExamPracticeSubmitRequest;
import com.kineticscholar.testservice.dto.StudentExamWrongNotebookItemView;
import com.kineticscholar.testservice.dto.StudentWordReviewAssignmentView;
import com.kineticscholar.testservice.dto.StudentWordTestAssignmentView;
import com.kineticscholar.testservice.dto.SubmitWordReviewSessionRequest;
import com.kineticscholar.testservice.dto.SubmitWordReviewWordResult;
import com.kineticscholar.testservice.dto.WordReviewAssignmentView;
import com.kineticscholar.testservice.dto.WordReviewContentItem;
import com.kineticscholar.testservice.dto.WordReviewDailySessionView;
import com.kineticscholar.testservice.dto.WordReviewSessionItem;
import com.kineticscholar.testservice.dto.WordReviewUnitScope;
import com.kineticscholar.testservice.dto.WordTestContentItem;
import com.kineticscholar.testservice.dto.WordTestAssignmentView;
import com.kineticscholar.testservice.model.ExamMaterial;
import com.kineticscholar.testservice.model.ExamPaper;
import com.kineticscholar.testservice.model.ExamPracticeRecord;
import com.kineticscholar.testservice.model.ExamQuestion;
import com.kineticscholar.testservice.model.ExamQuestionOption;
import com.kineticscholar.testservice.model.ExamWrongNotebookItem;
import com.kineticscholar.testservice.model.WordTest;
import com.kineticscholar.testservice.model.WordReviewTask;
import com.kineticscholar.testservice.model.WordReviewAssignment;
import com.kineticscholar.testservice.model.WordReviewDailySession;
import com.kineticscholar.testservice.model.WordReviewWordProgress;
import com.kineticscholar.testservice.model.TestAssignment;
import com.kineticscholar.testservice.model.TestAnswer;
import com.kineticscholar.testservice.model.UnitAssignment;
import com.kineticscholar.testservice.dto.UnitTaskItem;
import com.kineticscholar.testservice.repository.ExamMaterialRepository;
import com.kineticscholar.testservice.repository.ExamPaperRepository;
import com.kineticscholar.testservice.repository.ExamPracticeRecordRepository;
import com.kineticscholar.testservice.repository.ExamQuestionOptionRepository;
import com.kineticscholar.testservice.repository.ExamQuestionRepository;
import com.kineticscholar.testservice.repository.ExamWrongNotebookItemRepository;
import com.kineticscholar.testservice.repository.WordTestRepository;
import com.kineticscholar.testservice.repository.WordReviewTaskRepository;
import com.kineticscholar.testservice.repository.WordReviewAssignmentRepository;
import com.kineticscholar.testservice.repository.WordReviewDailySessionRepository;
import com.kineticscholar.testservice.repository.WordReviewWordProgressRepository;
import com.kineticscholar.testservice.repository.TestAssignmentRepository;
import com.kineticscholar.testservice.repository.TestAnswerRepository;
import com.kineticscholar.testservice.repository.UnitAssignmentRepository;
import com.kineticscholar.testservice.service.TestService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ThreadLocalRandom;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class TestServiceImpl implements TestService {
    private static final String TYPE_DICTATION = "\u542c\u5199";
    private static final String TYPE_TRANSLATION = "\u9ed8\u5199";
    private static final int DEFAULT_PASS_SCORE = 60;
    private static final int DEFAULT_DAILY_QUOTA = 20;
    private static final ZoneId REVIEW_ZONE = ZoneId.of("Asia/Shanghai");

    @Autowired
    private WordTestRepository wordTestRepository;

    @Autowired
    private TestAssignmentRepository testAssignmentRepository;

    @Autowired
    private TestAnswerRepository testAnswerRepository;

    @Autowired
    private UnitAssignmentRepository unitAssignmentRepository;

    @Autowired
    private WordReviewTaskRepository wordReviewTaskRepository;

    @Autowired
    private WordReviewAssignmentRepository wordReviewAssignmentRepository;

    @Autowired
    private WordReviewWordProgressRepository wordReviewWordProgressRepository;

    @Autowired
    private WordReviewDailySessionRepository wordReviewDailySessionRepository;

    @Autowired
    private ExamPaperRepository examPaperRepository;

    @Autowired
    private ExamMaterialRepository examMaterialRepository;

    @Autowired
    private ExamQuestionRepository examQuestionRepository;

    @Autowired
    private ExamQuestionOptionRepository examQuestionOptionRepository;

    @Autowired
    private ExamPracticeRecordRepository examPracticeRecordRepository;

    @Autowired
    private ExamWrongNotebookItemRepository examWrongNotebookItemRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // WordTest methods
    @Override
    public WordTest createWordTest(WordTest wordTest) {
        return wordTestRepository.save(wordTest);
    }

    @Override
    public List<WordTest> getAllWordTests() {
        return wordTestRepository.findAll();
    }

    @Override
    public List<WordTest> getWordTestsByCreator(Long creatorId) {
        return wordTestRepository.findByCreatedBy(creatorId);
    }

    @Override
    public List<WordTest> getWordTestsByUnitId(String unitId) {
        return wordTestRepository.findByUnitId(unitId);
    }

    @Override
    public Optional<WordTest> getWordTestById(String id) {
        return wordTestRepository.findById(id);
    }

    @Override
    public WordTest updateWordTest(String id, WordTest wordTest) {
        Optional<WordTest> existingWordTest = wordTestRepository.findById(id);
        if (existingWordTest.isPresent()) {
            WordTest updatedWordTest = existingWordTest.get();
            if (wordTest.getTitle() != null) {
                updatedWordTest.setTitle(wordTest.getTitle());
            }
            if (wordTest.getType() != null) {
                updatedWordTest.setType(wordTest.getType());
            }
            if (wordTest.getUnitId() != null) {
                updatedWordTest.setUnitId(wordTest.getUnitId());
            }
            return wordTestRepository.save(updatedWordTest);
        }
        throw new RuntimeException("WordTest not found");
    }

    @Override
    public void deleteWordTest(String id) {
        wordTestRepository.deleteById(id);
    }

    // TestAssignment methods
    @Override
    public TestAssignment createTestAssignment(TestAssignment testAssignment) {
        return testAssignmentRepository.save(testAssignment);
    }

    @Override
    public List<TestAssignment> getTestAssignmentsByTestId(String testId) {
        return testAssignmentRepository.findByTestId(testId);
    }

    @Override
    public List<TestAssignment> getTestAssignmentsByUserId(Long userId) {
        return testAssignmentRepository.findByUserId(userId);
    }

    @Override
    public List<TestAssignment> getPendingTestAssignmentsByUserId(Long userId) {
        return testAssignmentRepository.findByUserIdAndStatus(userId, "pending");
    }

    @Override
    public Optional<TestAssignment> getTestAssignmentById(Long id) {
        return testAssignmentRepository.findById(id);
    }

    @Override
    public TestAssignment updateTestAssignment(Long id, TestAssignment testAssignment) {
        Optional<TestAssignment> existingTestAssignment = testAssignmentRepository.findById(id);
        if (existingTestAssignment.isPresent()) {
            TestAssignment updatedTestAssignment = existingTestAssignment.get();
            if (testAssignment.getStatus() != null) {
                updatedTestAssignment.setStatus(testAssignment.getStatus());
            }
            if (testAssignment.getScore() != null) {
                updatedTestAssignment.setScore(testAssignment.getScore());
            }
            if (testAssignment.getDuration() != null) {
                updatedTestAssignment.setDuration(testAssignment.getDuration());
            }
            if (testAssignment.getCompletedAt() != null) {
                updatedTestAssignment.setCompletedAt(testAssignment.getCompletedAt());
            }
            return testAssignmentRepository.save(updatedTestAssignment);
        }
        throw new RuntimeException("TestAssignment not found");
    }

    @Override
    public void deleteTestAssignment(Long id) {
        testAssignmentRepository.deleteById(id);
    }

    // TestAnswer methods
    @Override
    public TestAnswer createTestAnswer(TestAnswer testAnswer) {
        return testAnswerRepository.save(testAnswer);
    }

    @Override
    public List<TestAnswer> getTestAnswersByAssignmentId(Long assignmentId) {
        return testAnswerRepository.findByAssignmentId(assignmentId);
    }

    @Override
    public void deleteTestAnswersByAssignmentId(Long assignmentId) {
        List<TestAnswer> answers = testAnswerRepository.findByAssignmentId(assignmentId);
        testAnswerRepository.deleteAll(answers);
    }

    // Business logic methods
    @Override
    public void assignTestToStudents(String testId, List<Long> studentIds) {
        for (Long studentId : studentIds) {
            TestAssignment assignment = new TestAssignment();
            assignment.setTestId(testId);
            assignment.setUserId(studentId);
            assignment.setStatus("pending");
            testAssignmentRepository.save(assignment);
        }
    }

    @Override
    public void submitTest(Long assignmentId, List<TestAnswer> answers, Integer score, Integer duration, Integer correctCount, Integer totalCount) {
        Optional<TestAssignment> existingAssignment = testAssignmentRepository.findById(assignmentId);
        if (existingAssignment.isPresent()) {
            TestAssignment assignment = existingAssignment.get();
            WordTest test = wordTestRepository.findById(assignment.getTestId())
                    .orElseThrow(() -> new RuntimeException("WordTest not found"));
            int passScore = extractPassScoreFromContentJson(test.getContentJson());

            int incomingScore = score == null ? 0 : score;
            int incomingDuration = duration == null ? 0 : duration;
            Integer currentBestScore = assignment.getScore();
            Integer currentBestDuration = assignment.getDuration();

            boolean better = currentBestScore == null
                    || incomingScore > currentBestScore
                    || (incomingScore == currentBestScore && isDurationBetter(incomingDuration, currentBestDuration));

            if (better) {
                assignment.setScore(incomingScore);
                assignment.setCorrectCount(correctCount);
                assignment.setTotalCount(totalCount);
                assignment.setDuration(incomingDuration);
                assignment.setCompletedAt(LocalDateTime.now());
            }

            int nextAttemptCount = effectiveAttemptCount(assignment) + 1;
            assignment.setAttemptCount(nextAttemptCount);
            int bestScore = Optional.ofNullable(assignment.getScore()).orElse(0);
            assignment.setStatus(bestScore >= passScore ? "completed" : "pending");
            testAssignmentRepository.save(assignment);

            deleteTestAnswersByAssignmentId(assignmentId);
            for (TestAnswer answer : answers) {
                answer.setAssignmentId(assignmentId);
                testAnswerRepository.save(answer);
            }
        } else {
            throw new RuntimeException("TestAssignment not found");
        }
    }

    @Override
    public List<UnitAssignment> getUnitAssignmentsByUserId(Long userId) {
        return unitAssignmentRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Override
    public List<UnitAssignment> getUnitAssignmentsByUserIds(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) return List.of();
        return unitAssignmentRepository.findByUserIdInOrderByCreatedAtDesc(userIds);
    }

    @Override
    public void assignUnitTasks(Long assignedBy, List<Long> studentIds, List<UnitTaskItem> units) {
        List<UnitAssignment> toSave = new ArrayList<>();
        for (Long studentId : studentIds) {
            for (UnitTaskItem unit : units) {
                String textbookVersion = safe(unit.getTextbookVersion());
                String grade = safe(unit.getGrade());
                String semester = safe(unit.getSemester());
                String unitName = safe(unit.getUnitName());
                if (textbookVersion.isEmpty() || grade.isEmpty() || semester.isEmpty() || unitName.isEmpty()) {
                    continue;
                }

                Optional<UnitAssignment> existing = unitAssignmentRepository
                        .findByUserIdAndTextbookVersionAndGradeAndSemesterAndUnitName(
                                studentId, textbookVersion, grade, semester, unitName
                        );

                UnitAssignment assignment = existing.orElseGet(UnitAssignment::new);
                assignment.setUserId(studentId);
                assignment.setAssignedBy(assignedBy);
                assignment.setTextbookVersion(textbookVersion);
                assignment.setGrade(grade);
                assignment.setSemester(semester);
                assignment.setUnitName(unitName);
                assignment.setStatus("assigned");
                toSave.add(assignment);
            }
        }
        if (!toSave.isEmpty()) {
            unitAssignmentRepository.saveAll(toSave);
        }
    }

    @Override
    public void deleteUnitAssignment(Long assignmentId) {
        unitAssignmentRepository.deleteById(assignmentId);
    }

    @Override
    public void deleteUnitAssignments(List<Long> assignmentIds) {
        if (assignmentIds == null || assignmentIds.isEmpty()) return;
        unitAssignmentRepository.deleteAllById(assignmentIds);
    }

    private String safe(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    @Override
    public WordTest publishWordTest(PublishWordTestRequest request) {
        if (request == null) throw new RuntimeException("request is required");
        if (request.getCreatedBy() == null) throw new RuntimeException("createdBy is required");
        if (request.getStudentIds() == null || request.getStudentIds().isEmpty()) {
            throw new RuntimeException("studentIds is required");
        }
        if (request.getScopes() == null || request.getScopes().isEmpty()) {
            throw new RuntimeException("scopes is required");
        }
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new RuntimeException("items is required");
        }

        String testType = safe(request.getTestType());
        if (!TYPE_TRANSLATION.equals(testType) && !TYPE_DICTATION.equals(testType)) {
            throw new RuntimeException("testType must be \u9ed8\u5199 or \u542c\u5199");
        }
        int passScore = normalizePassScore(request.getPassScore());

        WordTest wordTest = new WordTest();
        wordTest.setId(UUID.randomUUID().toString().replace("-", ""));
        wordTest.setCreatedBy(request.getCreatedBy());
        wordTest.setStoreCode(safe(request.getStoreCode()));
        wordTest.setStatus("published");
        wordTest.setType(testType);
        wordTest.setUnitId("MULTI");
        wordTest.setTitle(resolveWordTestTitle(request.getTitle()));

        try {
            Map<String, Object> content = new LinkedHashMap<>();
            content.put("testType", testType);
            content.put("passScore", passScore);
            content.put("scopes", request.getScopes());
            content.put("items", request.getItems());
            wordTest.setContentJson(objectMapper.writeValueAsString(content));
        } catch (Exception e) {
            throw new RuntimeException("failed to serialize test content");
        }

        WordTest saved = wordTestRepository.save(wordTest);

        List<TestAssignment> assignments = new ArrayList<>();
        for (Long studentId : request.getStudentIds()) {
            if (studentId == null) continue;
            TestAssignment assignment = new TestAssignment();
            assignment.setTestId(saved.getId());
            assignment.setUserId(studentId);
            assignment.setStatus("pending");
            assignment.setAttemptCount(0);
            assignments.add(assignment);
        }
        if (!assignments.isEmpty()) {
            testAssignmentRepository.saveAll(assignments);
        }

        return saved;
    }

    @Override
    public List<WordTestAssignmentView> getTeacherWordTestAssignments(Long teacherId, String storeCode) {
        if (teacherId == null) return List.of();
        List<WordTest> tests = wordTestRepository.findByCreatedByAndStoreCodeOrderByCreatedAtDesc(teacherId, safe(storeCode));
        if (tests.isEmpty()) return List.of();

        Map<String, WordTest> testMap = tests.stream().collect(Collectors.toMap(WordTest::getId, t -> t, (a, b) -> a, LinkedHashMap::new));
        List<TestAssignment> assignments = testAssignmentRepository.findByTestIdIn(new ArrayList<>(testMap.keySet()));

        List<WordTestAssignmentView> rows = new ArrayList<>();
        for (TestAssignment assignment : assignments) {
            WordTest test = testMap.get(assignment.getTestId());
            if (test == null) continue;
            WordTestAssignmentView row = new WordTestAssignmentView();
            row.setAssignmentId(assignment.getId());
            row.setTestId(test.getId());
            row.setUserId(assignment.getUserId());
            row.setTitle(test.getTitle());
            row.setTestType(test.getType());
            int passScore = extractPassScoreFromContentJson(test.getContentJson());
            int bestScore = Optional.ofNullable(assignment.getScore()).orElse(0);
            row.setStatus(bestScore >= passScore ? "completed" : "pending");
            row.setPassScore(extractPassScoreFromContentJson(test.getContentJson()));
            row.setAttemptCount(effectiveAttemptCount(assignment));
            row.setScore(assignment.getScore());
            row.setCorrectCount(assignment.getCorrectCount());
            row.setTotalCount(assignment.getTotalCount());
            row.setDuration(assignment.getDuration());
            row.setStoreCode(test.getStoreCode());
            row.setCreatedAt(test.getCreatedAt());
            rows.add(row);
        }
        rows.sort((a, b) -> Optional.ofNullable(b.getCreatedAt()).orElse(LocalDateTime.MIN).compareTo(Optional.ofNullable(a.getCreatedAt()).orElse(LocalDateTime.MIN)));
        return rows;
    }

    @Override
    public List<StudentWordTestAssignmentView> getStudentWordTests(Long userId) {
        if (userId == null) return List.of();
        List<TestAssignment> assignments = testAssignmentRepository.findByUserId(userId);
        if (assignments.isEmpty()) return List.of();

        Map<String, WordTest> testMap = wordTestRepository.findAllById(
                assignments.stream().map(TestAssignment::getTestId).distinct().toList()
        ).stream().collect(Collectors.toMap(WordTest::getId, t -> t));

        List<StudentWordTestAssignmentView> rows = new ArrayList<>();
        for (TestAssignment assignment : assignments) {
            WordTest test = testMap.get(assignment.getTestId());
            if (test == null) continue;

            StudentWordTestAssignmentView row = new StudentWordTestAssignmentView();
            row.setAssignmentId(assignment.getId());
            row.setTestId(test.getId());
            row.setTitle(test.getTitle());
            row.setTestType(test.getType());
            int passScore = extractPassScoreFromContentJson(test.getContentJson());
            int bestScore = Optional.ofNullable(assignment.getScore()).orElse(0);
            row.setStatus(bestScore >= passScore ? "completed" : "pending");
            row.setPassScore(extractPassScoreFromContentJson(test.getContentJson()));
            row.setAttemptCount(effectiveAttemptCount(assignment));
            row.setScore(assignment.getScore());
            row.setCorrectCount(assignment.getCorrectCount());
            row.setTotalCount(assignment.getTotalCount());
            row.setDuration(assignment.getDuration());
            row.setCreatedAt(test.getCreatedAt());
            row.setCompletedAt(assignment.getCompletedAt());
            row.setItems(extractItemsFromContentJson(test.getContentJson()));
            rows.add(row);
        }
        rows.sort((a, b) -> Optional.ofNullable(b.getCreatedAt()).orElse(LocalDateTime.MIN).compareTo(Optional.ofNullable(a.getCreatedAt()).orElse(LocalDateTime.MIN)));
        return rows;
    }

    @Override
    public void deleteWordTestAssignment(Long assignmentId) {
        if (assignmentId == null) return;
        Optional<TestAssignment> found = testAssignmentRepository.findById(assignmentId);
        if (found.isEmpty()) return;
        String testId = found.get().getTestId();
        testAssignmentRepository.deleteById(assignmentId);
        cleanupOrphanWordTest(testId);
    }

    @Override
    public void deleteWordTestAssignments(List<Long> assignmentIds) {
        if (assignmentIds == null || assignmentIds.isEmpty()) return;
        List<TestAssignment> toDelete = testAssignmentRepository.findByIdIn(assignmentIds);
        if (toDelete.isEmpty()) return;
        Map<String, Boolean> impacted = new HashMap<>();
        toDelete.forEach(a -> impacted.put(a.getTestId(), Boolean.TRUE));
        testAssignmentRepository.deleteAllById(assignmentIds);
        impacted.keySet().forEach(this::cleanupOrphanWordTest);
    }

    @Override
    public void publishWordReview(PublishWordReviewRequest request) {
        if (request == null) throw new RuntimeException("request is required");
        if (request.getCreatedBy() == null) throw new RuntimeException("createdBy is required");
        if (request.getStudentIds() == null || request.getStudentIds().isEmpty()) {
            throw new RuntimeException("studentIds is required");
        }
        if (request.getScopes() == null || request.getScopes().isEmpty()) {
            throw new RuntimeException("scopes is required");
        }
        if (request.getItems() == null || request.getItems().isEmpty()) {
            throw new RuntimeException("items is required");
        }

        int dailyQuota = normalizeDailyQuota(request.getDailyQuota());
        boolean enableSpelling = Boolean.TRUE.equals(request.getEnableSpelling());
        boolean enableZhToEn = Boolean.TRUE.equals(request.getEnableZhToEn());

        WordReviewTask task = new WordReviewTask();
        task.setId(UUID.randomUUID().toString().replace("-", ""));
        task.setCreatedBy(request.getCreatedBy());
        task.setStoreCode(safe(request.getStoreCode()));
        task.setStatus("published");
        task.setTitle(resolveWordReviewTitle(request.getTitle(), request.getScopes()));

        try {
            Map<String, Object> content = new LinkedHashMap<>();
            content.put("dailyQuota", dailyQuota);
            content.put("enableSpelling", enableSpelling);
            content.put("enableZhToEn", enableZhToEn);
            content.put("scopes", request.getScopes());
            content.put("items", request.getItems());
            task.setContentJson(objectMapper.writeValueAsString(content));
        } catch (Exception e) {
            throw new RuntimeException("failed to serialize review content");
        }
        WordReviewTask savedTask = wordReviewTaskRepository.save(task);

        List<WordReviewContentItem> contentItems = extractReviewItems(task.getContentJson());
        int totalWords = contentItems.size();

        for (Long studentId : request.getStudentIds()) {
            if (studentId == null) continue;
            WordReviewAssignment assignment = new WordReviewAssignment();
            assignment.setTaskId(savedTask.getId());
            assignment.setUserId(studentId);
            assignment.setStatus("pending");
            assignment.setTotalWordCount(totalWords);
            assignment.setMasteredWordCount(0);
            WordReviewAssignment savedAssignment = wordReviewAssignmentRepository.save(assignment);

            List<WordReviewWordProgress> progresses = new ArrayList<>();
            for (WordReviewContentItem item : contentItems) {
                if (item == null || item.getEntryId() == null || item.getEntryId().isBlank()) continue;
                WordReviewWordProgress progress = new WordReviewWordProgress();
                progress.setAssignmentId(savedAssignment.getId());
                progress.setEntryId(item.getEntryId());
                progress.setWord(safe(item.getWord()));
                progress.setPhonetic(safe(item.getPhonetic()));
                progress.setMeaning(safe(item.getMeaning()));
                progress.setWordAudio(safe(item.getWordAudio()));
                progress.setSentence(safe(item.getSentence()));
                progress.setSentenceCn(safe(item.getSentenceCn()));
                progress.setSentenceAudio(safe(item.getSentenceAudio()));
                progress.setMastered(false);
                progress.setReviewCount(0);
                progress.setCorrectCount(0);
                progress.setWrongCount(0);
                progress.setCurrentStreak(0);
                progresses.add(progress);
            }
            if (!progresses.isEmpty()) {
                wordReviewWordProgressRepository.saveAll(progresses);
            }
        }
    }

    @Override
    public List<WordReviewAssignmentView> getTeacherWordReviewAssignments(Long teacherId, String storeCode) {
        if (teacherId == null) return List.of();
        List<WordReviewTask> tasks = wordReviewTaskRepository
                .findByCreatedByAndStoreCodeOrderByCreatedAtDesc(teacherId, safe(storeCode));
        if (tasks.isEmpty()) return List.of();

        Map<String, WordReviewTask> taskMap = tasks.stream()
                .collect(Collectors.toMap(WordReviewTask::getId, t -> t, (a, b) -> a, LinkedHashMap::new));
        List<WordReviewAssignment> assignments = wordReviewAssignmentRepository.findByTaskIdIn(new ArrayList<>(taskMap.keySet()));

        List<WordReviewAssignmentView> rows = new ArrayList<>();
        for (WordReviewAssignment assignment : assignments) {
            WordReviewTask task = taskMap.get(assignment.getTaskId());
            if (task == null) continue;
            WordReviewAssignmentView row = new WordReviewAssignmentView();
            row.setAssignmentId(assignment.getId());
            row.setTaskId(task.getId());
            row.setUserId(assignment.getUserId());
            row.setTitle(task.getTitle());
            row.setStatus(assignment.getStatus());
            row.setDailyQuota(extractDailyQuota(task.getContentJson()));
            row.setEnableSpelling(extractEnableSpelling(task.getContentJson()));
            row.setEnableZhToEn(extractEnableZhToEn(task.getContentJson()));
            row.setTotalWordCount(assignment.getTotalWordCount());
            row.setMasteredWordCount(assignment.getMasteredWordCount());
            row.setLastReviewDate(assignment.getLastReviewDate());
            row.setStoreCode(task.getStoreCode());
            row.setCreatedAt(task.getCreatedAt());
            rows.add(row);
        }
        rows.sort((a, b) -> Optional.ofNullable(b.getCreatedAt()).orElse(LocalDateTime.MIN)
                .compareTo(Optional.ofNullable(a.getCreatedAt()).orElse(LocalDateTime.MIN)));
        return rows;
    }

    @Override
    public List<StudentWordReviewAssignmentView> getStudentWordReviews(Long userId) {
        if (userId == null) return List.of();
        List<WordReviewAssignment> assignments = wordReviewAssignmentRepository.findByUserIdOrderByCreatedAtDesc(userId);
        if (assignments.isEmpty()) return List.of();
        Map<String, WordReviewTask> taskMap = wordReviewTaskRepository.findAllById(
                assignments.stream().map(WordReviewAssignment::getTaskId).distinct().toList()
        ).stream().collect(Collectors.toMap(WordReviewTask::getId, t -> t));

        List<StudentWordReviewAssignmentView> rows = new ArrayList<>();
        for (WordReviewAssignment assignment : assignments) {
            WordReviewTask task = taskMap.get(assignment.getTaskId());
            if (task == null) continue;
            StudentWordReviewAssignmentView row = new StudentWordReviewAssignmentView();
            row.setAssignmentId(assignment.getId());
            row.setTaskId(task.getId());
            row.setTitle(task.getTitle());
            row.setStatus(assignment.getStatus());
            row.setDailyQuota(extractDailyQuota(task.getContentJson()));
            row.setEnableSpelling(extractEnableSpelling(task.getContentJson()));
            row.setEnableZhToEn(extractEnableZhToEn(task.getContentJson()));
            row.setTotalWordCount(assignment.getTotalWordCount());
            row.setMasteredWordCount(assignment.getMasteredWordCount());
            row.setLastReviewDate(assignment.getLastReviewDate());
            row.setTodayDone(assignment.getLastReviewDate() != null && assignment.getLastReviewDate().isEqual(LocalDate.now(REVIEW_ZONE)));
            row.setCreatedAt(task.getCreatedAt());
            row.setCompletedAt(assignment.getCompletedAt());
            rows.add(row);
        }
        rows.sort((a, b) -> Optional.ofNullable(b.getCreatedAt()).orElse(LocalDateTime.MIN)
                .compareTo(Optional.ofNullable(a.getCreatedAt()).orElse(LocalDateTime.MIN)));
        return rows;
    }

    @Override
    public WordReviewDailySessionView startWordReviewDailySession(Long assignmentId) {
        WordReviewAssignment assignment = wordReviewAssignmentRepository.findById(assignmentId)
                .orElseThrow(() -> new RuntimeException("Word review assignment not found"));
        WordReviewTask task = wordReviewTaskRepository.findById(assignment.getTaskId())
                .orElseThrow(() -> new RuntimeException("Word review task not found"));

        LocalDate today = LocalDate.now(REVIEW_ZONE);
        Optional<WordReviewDailySession> existingOpt = wordReviewDailySessionRepository
                .findByAssignmentIdAndReviewDate(assignmentId, today);
        if (existingOpt.isPresent()) {
            return buildDailySessionView(existingOpt.get(), assignment, task);
        }

        List<WordReviewWordProgress> progresses = wordReviewWordProgressRepository.findByAssignmentId(assignmentId);
        List<WordReviewWordProgress> pending = progresses.stream()
                .filter(p -> !Boolean.TRUE.equals(p.getMastered()))
                .toList();

        int dailyQuota = extractDailyQuota(task.getContentJson());
        int limit = Math.min(Math.max(0, dailyQuota), pending.size());
        boolean firstReview = assignment.getLastReviewDate() == null
                && Optional.ofNullable(assignment.getMasteredWordCount()).orElse(0) <= 0;
        List<WordReviewWordProgress> selected;
        if (firstReview) {
            List<WordReviewWordProgress> shuffled = new ArrayList<>(pending);
            Collections.shuffle(shuffled);
            selected = shuffled.stream().limit(limit).toList();
        } else {
            Map<String, Double> randomTieBreaker = new HashMap<>();
            pending.forEach(p -> randomTieBreaker.put(p.getEntryId(), ThreadLocalRandom.current().nextDouble()));
            selected = pending.stream()
                    .sorted((a, b) -> {
                        int s = Double.compare(reviewPriorityScore(b, today), reviewPriorityScore(a, today));
                        if (s != 0) return s;
                        return Double.compare(
                                randomTieBreaker.getOrDefault(a.getEntryId(), 0.0),
                                randomTieBreaker.getOrDefault(b.getEntryId(), 0.0)
                        );
                    })
                    .limit(limit)
                    .toList();
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("dailyQuota", dailyQuota);
        payload.put("enableSpelling", extractEnableSpelling(task.getContentJson()));
        payload.put("enableZhToEn", extractEnableZhToEn(task.getContentJson()));
        payload.put("items", selected.stream().map(this::toSessionItem).toList());

        WordReviewDailySession session = new WordReviewDailySession();
        session.setAssignmentId(assignmentId);
        session.setReviewDate(today);
        session.setQuota(dailyQuota);
        session.setSelectedCount(selected.size());
        session.setFinishedCount(0);
        session.setStatus("in_progress");
        try {
            session.setPayloadJson(objectMapper.writeValueAsString(payload));
        } catch (Exception e) {
            throw new RuntimeException("failed to build daily session payload");
        }
        WordReviewDailySession saved = wordReviewDailySessionRepository.save(session);
        return buildDailySessionView(saved, assignment, task);
    }

    @Override
    public void submitWordReviewDailySession(Long sessionId, SubmitWordReviewSessionRequest request) {
        WordReviewDailySession session = wordReviewDailySessionRepository.findById(sessionId)
                .orElseThrow(() -> new RuntimeException("Word review daily session not found"));
        if ("done".equals(session.getStatus())) return;

        WordReviewAssignment assignment = wordReviewAssignmentRepository.findById(session.getAssignmentId())
                .orElseThrow(() -> new RuntimeException("Word review assignment not found"));
        WordReviewTask task = wordReviewTaskRepository.findById(assignment.getTaskId())
                .orElseThrow(() -> new RuntimeException("Word review task not found"));

        boolean enableSpelling = extractEnableSpelling(task.getContentJson());
        boolean enableZhToEn = extractEnableZhToEn(task.getContentJson());
        List<SubmitWordReviewWordResult> results = request == null || request.getResults() == null
                ? List.of() : request.getResults();
        Set<String> selectedIds = extractSessionItems(session.getPayloadJson()).stream()
                .map(WordReviewSessionItem::getEntryId)
                .collect(Collectors.toSet());

        LocalDateTime now = LocalDateTime.now();
        for (SubmitWordReviewWordResult result : results) {
            if (result == null || result.getEntryId() == null || !selectedIds.contains(result.getEntryId())) continue;
            WordReviewWordProgress progress = wordReviewWordProgressRepository
                    .findByAssignmentIdAndEntryId(assignment.getId(), result.getEntryId())
                    .orElse(null);
            if (progress == null) continue;

            boolean stage1 = Boolean.TRUE.equals(result.getCardDone());
            boolean stage2 = Boolean.TRUE.equals(result.getEnToZhCorrect());
            boolean stage3 = !enableSpelling || Boolean.TRUE.equals(result.getSpellingCorrect());
            boolean stage4 = !enableZhToEn || Boolean.TRUE.equals(result.getZhToEnCorrect());
            boolean wordPassed = stage1 && stage2 && stage3 && stage4;

            progress.setReviewCount(Optional.ofNullable(progress.getReviewCount()).orElse(0) + 1);
            progress.setLastReviewedAt(now);
            if (wordPassed) {
                progress.setCorrectCount(Optional.ofNullable(progress.getCorrectCount()).orElse(0) + 1);
                progress.setCurrentStreak(Optional.ofNullable(progress.getCurrentStreak()).orElse(0) + 1);
                progress.setLastCorrectAt(now);
                if (!Boolean.TRUE.equals(progress.getMastered())) {
                    progress.setMastered(true);
                    progress.setMasteredAt(now);
                }
            } else {
                progress.setWrongCount(Optional.ofNullable(progress.getWrongCount()).orElse(0) + 1);
                progress.setCurrentStreak(0);
            }
            wordReviewWordProgressRepository.save(progress);
        }

        long masteredCount = wordReviewWordProgressRepository.countByAssignmentIdAndMasteredTrue(assignment.getId());
        assignment.setMasteredWordCount((int) masteredCount);
        assignment.setLastReviewDate(LocalDate.now(REVIEW_ZONE));
        if (masteredCount >= Optional.ofNullable(assignment.getTotalWordCount()).orElse(0)) {
            assignment.setStatus("completed");
            if (assignment.getCompletedAt() == null) {
                assignment.setCompletedAt(now);
            }
        } else {
            assignment.setStatus("pending");
        }
        wordReviewAssignmentRepository.save(assignment);

        session.setFinishedCount(session.getSelectedCount());
        session.setStatus("done");
        session.setFinishedAt(now);
        wordReviewDailySessionRepository.save(session);
    }

    @Override
    public void deleteWordReviewAssignment(Long assignmentId) {
        if (assignmentId == null) return;
        Optional<WordReviewAssignment> found = wordReviewAssignmentRepository.findById(assignmentId);
        if (found.isEmpty()) return;
        String taskId = found.get().getTaskId();

        wordReviewDailySessionRepository.deleteAll(wordReviewDailySessionRepository.findByAssignmentId(assignmentId));
        wordReviewWordProgressRepository.deleteAll(wordReviewWordProgressRepository.findByAssignmentId(assignmentId));
        wordReviewAssignmentRepository.deleteById(assignmentId);
        cleanupOrphanWordReviewTask(taskId);
    }

    @Override
    public void deleteWordReviewAssignments(List<Long> assignmentIds) {
        if (assignmentIds == null || assignmentIds.isEmpty()) return;
        List<WordReviewAssignment> toDelete = wordReviewAssignmentRepository.findByIdIn(assignmentIds);
        if (toDelete.isEmpty()) return;

        Set<String> taskIds = toDelete.stream().map(WordReviewAssignment::getTaskId).collect(Collectors.toSet());
        for (WordReviewAssignment assignment : toDelete) {
            wordReviewDailySessionRepository.deleteAll(wordReviewDailySessionRepository.findByAssignmentId(assignment.getId()));
            wordReviewWordProgressRepository.deleteAll(wordReviewWordProgressRepository.findByAssignmentId(assignment.getId()));
        }
        wordReviewAssignmentRepository.deleteAllById(assignmentIds);
        taskIds.forEach(this::cleanupOrphanWordReviewTask);
    }

    @Override
    @Transactional
    public ExamImportResult importExamPaperJsonl(
            MultipartFile file,
            String bookVersion,
            String grade,
            String semester,
            String unitCode,
            boolean overwrite,
            Long createdBy
    ) {
        String bv = safe(bookVersion);
        String g = safe(grade);
        String s = safe(semester);
        String unit = normalizeExamUnitCode(unitCode);
        if (bv.isEmpty() || g.isEmpty() || s.isEmpty() || unit.isEmpty()) {
            throw new RuntimeException("bookVersion、grade、semester、unitCode 均不能为空");
        }

        ParsedExamJsonl parsed = parseExamJsonl(file, bv, g, s, unit);
        String sourceType = safe(rawString(parsed.meta(), "source_type"));
        String paperType = normalizeExamPaperType(rawString(parsed.meta(), "paper_type"), sourceType);
        if (paperType.isEmpty()) {
            throw new RuntimeException("JSONL 缺少 paper_type");
        }
        if (sourceType.isEmpty()) {
            throw new RuntimeException("JSONL 缺少 source_type");
        }

        List<ExamPaper> existingPapers = examPaperRepository.findByBookVersionAndGradeAndSemesterOrderByUnitCodeAsc(bv, g, s).stream()
                .filter(paper -> unit.equals(safe(paper.getUnitCode())))
                .filter(paper -> isSameExamPaperType(paperType, safe(paper.getPaperType())))
                .toList();
        boolean overwritten = !existingPapers.isEmpty();
        if (overwritten && !overwrite) {
            throw new RuntimeException("当前教材范围下已存在试卷，请开启 overwrite 后重试");
        }
        if (overwritten) {
            for (ExamPaper existing : existingPapers) {
                deleteExamPaperCascade(existing.getId());
            }
        }

        ExamPaper paper = new ExamPaper();
        paper.setPaperCode(buildExamPaperCode(sourceType, paperType, bv, g, s, unit));
        paper.setPaperName(resolveExamPaperName(parsed.meta(), unit, paperType));
        paper.setPaperType(paperType);
        paper.setSourceType(sourceType);
        paper.setBookVersion(bv);
        paper.setGrade(g);
        paper.setSemester(s);
        paper.setUnitCode(unit);
        paper.setSourceFile(safe(rawString(parsed.meta(), "source_file")));
        paper.setQuestionCount(parsed.questions().size());
        paper.setStatus("active");
        paper.setCreatedBy(createdBy);
        ExamPaper savedPaper = examPaperRepository.save(paper);

        Map<String, Long> materialIdMap = new LinkedHashMap<>();
        int materialSort = 1;
        for (Map<String, Object> raw : parsed.materials()) {
            ExamMaterial material = new ExamMaterial();
            String materialUid = safe(raw.get("material_id"));
            if (materialUid.isEmpty()) {
                materialUid = buildStableId("material", savedPaper.getPaperCode(), materialSort);
            }
            material.setMaterialUid(materialUid);
            material.setPaperId(savedPaper.getId());
            material.setMaterialLabel(safe(raw.get("material_label")));
            material.setQuestionType(safe(raw.get("question_type")));
            material.setTitle(safe(raw.get("title")));
            material.setContent(safe(raw.get("material_text")));
            material.setAnalysis(safe(raw.get("material_explanation")));
            material.setSortOrder(materialSort++);
            ExamMaterial savedMaterial = examMaterialRepository.save(material);
            materialIdMap.put(savedMaterial.getMaterialUid(), savedMaterial.getId());
        }

        for (Map<String, Object> raw : parsed.questions()) {
            Integer questionNo = parseRequiredInt(raw.get("question_no"), "question_no");
            ExamQuestion question = new ExamQuestion();
            String questionUid = safe(raw.get("question_id"));
            if (questionUid.isEmpty()) {
                questionUid = buildStableId("question", savedPaper.getPaperCode(), questionNo);
            }
            question.setQuestionUid(questionUid);
            question.setPaperId(savedPaper.getId());

            String materialUid = safe(raw.get("material_id"));
            if (!materialUid.isEmpty()) {
                Long materialId = materialIdMap.get(materialUid);
                if (materialId == null) {
                    throw new RuntimeException("题目 " + questionNo + " 关联的材料不存在: " + materialUid);
                }
                question.setMaterialId(materialId);
            }

            question.setQuestionNo(questionNo);
            question.setQuestionType(safe(raw.get("question_type")));
            question.setStem(safe(raw.get("stem")));
            question.setAnswerText(safe(raw.get("answer")));
            question.setAnalysis(safe(raw.get("explanation")));
            question.setScore(BigDecimal.ONE);
            question.setDifficulty(safe(raw.get("difficulty")));
            question.setStatus("active");
            question.setSortOrder(questionNo);
            ExamQuestion savedQuestion = examQuestionRepository.save(question);

            List<Map<String, Object>> options = parseOptionRows(raw.get("options"));
            for (int i = 0; i < options.size(); i++) {
                Map<String, Object> optionRow = options.get(i);
                ExamQuestionOption option = new ExamQuestionOption();
                option.setQuestionId(savedQuestion.getId());
                option.setOptionKey(safe(optionRow.get("key")));
                option.setOptionText(safe(optionRow.get("text")));
                option.setSortOrder(i + 1);
                examQuestionOptionRepository.save(option);
            }
        }

        ExamImportResult result = new ExamImportResult();
        result.setPaperId(savedPaper.getId());
        result.setPaperCode(savedPaper.getPaperCode());
        result.setPaperName(savedPaper.getPaperName());
        result.setPaperType(savedPaper.getPaperType());
        result.setSourceType(savedPaper.getSourceType());
        result.setBookVersion(savedPaper.getBookVersion());
        result.setGrade(savedPaper.getGrade());
        result.setSemester(savedPaper.getSemester());
        result.setUnitCode(savedPaper.getUnitCode());
        result.setMaterialCount(parsed.materials().size());
        result.setQuestionCount(parsed.questions().size());
        result.setOverwritten(overwritten);
        return result;
    }

    @Override
    public List<ExamPaperSummaryView> getExamPapers(String bookVersion, String grade, String semester, String unitCode, String paperType) {
        String bv = safe(bookVersion);
        String g = safe(grade);
        String s = safe(semester);
        String unit = safe(unitCode);
        String type = normalizeExamPaperType(paperType, "");
        return examPaperRepository.findByBookVersionAndGradeAndSemesterOrderByUnitCodeAsc(bv, g, s).stream()
                .filter(paper -> unit.isEmpty() || unit.equals(safe(paper.getUnitCode())))
                .filter(paper -> type.isEmpty() || isSameExamPaperType(type, safe(paper.getPaperType())))
                .sorted(Comparator.comparing(ExamPaper::getUpdatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::toExamPaperSummary)
                .toList();
    }

    @Override
    public long countExamPapers(String bookVersion, String grade, String semester, String unitCode, String paperType) {
        String unit = safe(unitCode);
        String type = normalizeExamPaperType(paperType, "");
        if (unit.isEmpty() && type.isEmpty()) {
            return examPaperRepository.countByBookVersionAndGradeAndSemester(
                    safe(bookVersion), safe(grade), safe(semester)
            );
        }
        return getExamPapers(bookVersion, grade, semester, unitCode, paperType).size();
    }

    @Override
    public Optional<ExamPaperDetailView> getExamPaperDetail(Long paperId) {
        if (paperId == null) return Optional.empty();
        return examPaperRepository.findById(paperId).map(this::buildExamPaperDetail);
    }

    @Override
    @Transactional
    public ExamPaperDetailView updateExamPaper(Long paperId, ExamPaperUpdateRequest request) {
        ExamPaper paper = requireExamPaper(paperId);
        if (request != null) {
            String paperName = safe(request.getPaperName());
            if (!paperName.isEmpty()) {
                paper.setPaperName(paperName);
            }
            String status = safe(request.getStatus());
            if (!status.isEmpty()) {
                paper.setStatus(status);
            }
            if (request.getSourceFile() != null) {
                paper.setSourceFile(safe(request.getSourceFile()));
            }
        }
        ExamPaper saved = examPaperRepository.save(paper);
        return buildExamPaperDetail(saved);
    }

    @Override
    @Transactional
    public ExamMaterialView createExamMaterial(Long paperId, ExamMaterialUpsertRequest request) {
        ExamPaper paper = requireExamPaper(paperId);
        ExamMaterial material = new ExamMaterial();
        material.setPaperId(paper.getId());
        applyMaterialRequest(material, request, paper);
        return toExamMaterialView(examMaterialRepository.save(material));
    }

    @Override
    @Transactional
    public ExamMaterialView updateExamMaterial(Long paperId, Long materialId, ExamMaterialUpsertRequest request) {
        requireExamPaper(paperId);
        ExamMaterial material = requireExamMaterial(paperId, materialId);
        applyMaterialRequest(material, request, null);
        return toExamMaterialView(examMaterialRepository.save(material));
    }

    @Override
    @Transactional
    public void deleteExamMaterial(Long paperId, Long materialId) {
        requireExamPaper(paperId);
        ExamMaterial material = requireExamMaterial(paperId, materialId);
        List<ExamQuestion> linkedQuestions = examQuestionRepository.findByMaterialIdOrderByQuestionNoAsc(material.getId());
        if (!linkedQuestions.isEmpty()) {
            throw new RuntimeException("该材料下仍有关联题目，请先删除或改绑题目");
        }
        examMaterialRepository.delete(material);
    }

    @Override
    @Transactional
    public ExamQuestionView createExamQuestion(Long paperId, ExamQuestionUpsertRequest request) {
        ExamPaper paper = requireExamPaper(paperId);
        ExamQuestion question = new ExamQuestion();
        question.setPaperId(paper.getId());
        applyQuestionRequest(question, request, paper);
        ExamQuestion saved = examQuestionRepository.save(question);
        replaceQuestionOptions(saved.getId(), request == null ? List.of() : request.getOptions());
        refreshPaperQuestionCount(paper.getId());
        return toExamQuestionView(saved, loadMaterialMap(paper.getId()));
    }

    @Override
    @Transactional
    public ExamQuestionView updateExamQuestion(Long paperId, Long questionId, ExamQuestionUpsertRequest request) {
        ExamPaper paper = requireExamPaper(paperId);
        ExamQuestion question = requireExamQuestion(paperId, questionId);
        applyQuestionRequest(question, request, paper);
        ExamQuestion saved = examQuestionRepository.save(question);
        replaceQuestionOptions(saved.getId(), request == null ? List.of() : request.getOptions());
        refreshPaperQuestionCount(paper.getId());
        return toExamQuestionView(saved, loadMaterialMap(paper.getId()));
    }

    @Override
    @Transactional
    public void deleteExamQuestion(Long paperId, Long questionId) {
        requireExamPaper(paperId);
        ExamQuestion question = requireExamQuestion(paperId, questionId);
        examQuestionOptionRepository.deleteByQuestionId(question.getId());
        examQuestionRepository.delete(question);
        refreshPaperQuestionCount(paperId);
    }

    @Override
    @Transactional
    public ExamDeleteResult deleteExamPaper(Long paperId) {
        requireExamPaper(paperId);
        DeleteStats stats = deleteExamPaperCascade(paperId);
        return toDeleteResult("试卷已删除", stats);
    }

    @Override
    @Transactional
    public ExamDeleteResult deleteExamPapersByUnit(String bookVersion, String grade, String semester, String unitCode, String paperType) {
        String bv = safe(bookVersion);
        String g = safe(grade);
        String s = safe(semester);
        String unit = safe(unitCode);
        String type = safe(paperType);
        if (bv.isEmpty() || g.isEmpty() || s.isEmpty() || unit.isEmpty()) {
            throw new RuntimeException("按单元删除时，bookVersion、grade、semester、unitCode 均不能为空");
        }
        List<ExamPaper> matched = examPaperRepository.findByBookVersionAndGradeAndSemesterOrderByUnitCodeAsc(bv, g, s).stream()
                .filter(paper -> unit.equals(safe(paper.getUnitCode())))
                .filter(paper -> type.isEmpty() || isSameExamPaperType(type, safe(paper.getPaperType())))
                .toList();
        DeleteStats total = new DeleteStats();
        for (ExamPaper paper : matched) {
            total.merge(deleteExamPaperCascade(paper.getId()));
        }
        return toDeleteResult("单元题库已删除", total);
    }

    @Override
    @Transactional
    public ExamDeleteResult deleteExamPapersBySemester(String bookVersion, String grade, String semester, String paperType) {
        String bv = safe(bookVersion);
        String g = safe(grade);
        String s = safe(semester);
        String type = normalizeExamPaperType(paperType, "");
        if (bv.isEmpty() || g.isEmpty() || s.isEmpty()) {
            throw new RuntimeException("按整册删除时，bookVersion、grade、semester 均不能为空");
        }
        List<ExamPaper> matched = examPaperRepository.findByBookVersionAndGradeAndSemesterOrderByUnitCodeAsc(bv, g, s).stream()
                .filter(paper -> type.isEmpty() || isSameExamPaperType(type, safe(paper.getPaperType())))
                .toList();
        DeleteStats total = new DeleteStats();
        for (ExamPaper paper : matched) {
            total.merge(deleteExamPaperCascade(paper.getId()));
        }
        return toDeleteResult("整册题库已删除", total);
    }

    @Override
    public Optional<StudentExamPracticeResultView> getLatestStudentExamPractice(Long paperId, Long userId) {
        if (paperId == null || userId == null) {
            return Optional.empty();
        }
        return examPracticeRecordRepository.findTopByUserIdAndPaperIdOrderBySubmittedAtDescIdDesc(userId, paperId)
                .map(this::toStudentExamPracticeResultView);
    }

    @Override
    @Transactional
    public StudentExamPracticeResultView submitStudentExamPractice(Long paperId, StudentExamPracticeSubmitRequest request) {
        if (paperId == null) {
            throw new RuntimeException("paperId 涓嶈兘涓虹┖");
        }
        if (request == null || request.getUserId() == null) {
            throw new RuntimeException("userId 涓嶈兘涓虹┖");
        }

        ExamPaper paper = requireExamPaper(paperId);
        Map<Long, ExamMaterial> materialMap = loadMaterialMap(paperId);
        List<ExamQuestion> questions = examQuestionRepository.findByPaperIdOrderByQuestionNoAsc(paperId);
        if (questions.isEmpty()) {
            throw new RuntimeException("褰撳墠璇曞嵎娌℃湁棰樼洰");
        }

        Map<Long, StudentExamPracticeAnswerRequest> submittedMap = new HashMap<>();
        if (request.getAnswers() != null) {
            for (StudentExamPracticeAnswerRequest row : request.getAnswers()) {
                if (row == null || row.getQuestionId() == null) {
                    continue;
                }
                submittedMap.put(row.getQuestionId(), row);
            }
        }

        List<StudentExamPracticeQuestionResultView> answerResults = new ArrayList<>();
        int correctCount = 0;
        for (ExamQuestion question : questions) {
            String submittedAnswer = normalizeStudentAnswer(submittedMap.get(question.getId()) == null ? "" : submittedMap.get(question.getId()).getAnswerText());
            String correctAnswer = safe(question.getAnswerText());
            boolean correct = isStudentAnswerCorrect(submittedAnswer, correctAnswer);
            if (correct) {
                correctCount += 1;
            } else {
                upsertWrongNotebookItem(request.getUserId(), paper, question, materialMap.get(question.getMaterialId()), submittedAnswer);
            }

            StudentExamPracticeQuestionResultView row = new StudentExamPracticeQuestionResultView();
            row.setQuestionId(question.getId());
            row.setQuestionNo(question.getQuestionNo());
            row.setSubmittedAnswer(submittedAnswer);
            row.setCorrectAnswer(correctAnswer);
            row.setCorrect(correct);
            answerResults.add(row);
        }

        int totalCount = questions.size();
        int score = totalCount == 0 ? 0 : (int) Math.round((correctCount * 100.0d) / totalCount);

        ExamPracticeRecord record = new ExamPracticeRecord();
        record.setUserId(request.getUserId());
        record.setPaperId(paper.getId());
        record.setPaperCode(paper.getPaperCode());
        record.setPaperName(paper.getPaperName());
        record.setBookVersion(paper.getBookVersion());
        record.setGrade(paper.getGrade());
        record.setSemester(paper.getSemester());
        record.setUnitCode(paper.getUnitCode());
        record.setScore(score);
        record.setCorrectCount(correctCount);
        record.setTotalCount(totalCount);
        record.setDurationSeconds(request.getDurationSeconds());
        record.setSubmittedAt(LocalDateTime.now());
        record.setAnswersJson(writeJson(answerResults));

        return toStudentExamPracticeResultView(examPracticeRecordRepository.save(record));
    }

    @Override
    public List<StudentExamWrongNotebookItemView> getStudentExamWrongNotebook(Long userId) {
        if (userId == null) {
            return List.of();
        }
        return examWrongNotebookItemRepository.findByUserIdOrderByLastWrongAtDescIdDesc(userId).stream()
                .map(this::toStudentExamWrongNotebookItemView)
                .toList();
    }

    private String resolveWordTestTitle(String title) {
        String t = safe(title);
        if (!t.isEmpty()) return t;
        LocalDate d = LocalDate.now();
        return d.getYear() + "\u5e74" + d.getMonthValue() + "\u6708" + d.getDayOfMonth() + "\u65e5\u5355\u8bcd\u6d4b\u8bd5";
    }

    private String resolveWordReviewTitle(String title, List<WordReviewUnitScope> scopes) {
        String t = safe(title);
        if (!t.isEmpty()) return t;
        if (scopes != null && !scopes.isEmpty()) {
            WordReviewUnitScope s = scopes.get(0);
            String grade = safe(s.getGrade());
            String semesterRaw = safe(s.getSemester());
            String semester = semesterRaw.contains("上") ? "上册" : (semesterRaw.contains("下") ? "下册" : semesterRaw);
            String unit = safe(s.getUnit());
            String multi = scopes.size() > 1 ? "多单元" : unit;
            if (!grade.isEmpty() && !semester.isEmpty() && !multi.isEmpty()) {
                return grade + semester + multi + "单词复习";
            }
        }
        LocalDate d = LocalDate.now(REVIEW_ZONE);
        return d.getYear() + "年" + d.getMonthValue() + "月" + d.getDayOfMonth() + "日单词复习";
    }

    private int normalizeDailyQuota(Integer dailyQuota) {
        if (dailyQuota == null) return DEFAULT_DAILY_QUOTA;
        if (dailyQuota < 1 || dailyQuota > 200) {
            throw new RuntimeException("dailyQuota must be between 1 and 200");
        }
        return dailyQuota;
    }

    private int extractDailyQuota(String contentJson) {
        try {
            Map<?, ?> payload = objectMapper.readValue(contentJson, Map.class);
            Object raw = payload.get("dailyQuota");
            if (raw instanceof Number n) return normalizeDailyQuota(n.intValue());
            if (raw != null) return normalizeDailyQuota(Integer.parseInt(String.valueOf(raw)));
            return DEFAULT_DAILY_QUOTA;
        } catch (Exception e) {
            return DEFAULT_DAILY_QUOTA;
        }
    }

    private boolean extractEnableSpelling(String contentJson) {
        try {
            Map<?, ?> payload = objectMapper.readValue(contentJson, Map.class);
            return Boolean.TRUE.equals(payload.get("enableSpelling"));
        } catch (Exception e) {
            return false;
        }
    }

    private boolean extractEnableZhToEn(String contentJson) {
        try {
            Map<?, ?> payload = objectMapper.readValue(contentJson, Map.class);
            return Boolean.TRUE.equals(payload.get("enableZhToEn"));
        } catch (Exception e) {
            return false;
        }
    }

    private List<WordReviewContentItem> extractReviewItems(String contentJson) {
        if (contentJson == null || contentJson.isBlank()) return List.of();
        try {
            Map<?, ?> payload = objectMapper.readValue(contentJson, Map.class);
            Object rawItems = payload.get("items");
            if (!(rawItems instanceof List<?> list)) return List.of();
            List<WordReviewContentItem> items = new ArrayList<>();
            for (Object row : list) {
                WordReviewContentItem item = objectMapper.convertValue(row, WordReviewContentItem.class);
                if (item != null && item.getEntryId() != null) {
                    items.add(item);
                }
            }
            return items;
        } catch (Exception e) {
            return List.of();
        }
    }

    private WordReviewDailySessionView buildDailySessionView(
            WordReviewDailySession session,
            WordReviewAssignment assignment,
            WordReviewTask task
    ) {
        WordReviewDailySessionView view = new WordReviewDailySessionView();
        view.setSessionId(session.getId());
        view.setAssignmentId(assignment.getId());
        view.setTaskTitle(task.getTitle());
        view.setDailyQuota(extractDailyQuota(task.getContentJson()));
        view.setEnableSpelling(extractEnableSpelling(task.getContentJson()));
        view.setEnableZhToEn(extractEnableZhToEn(task.getContentJson()));
        view.setTotalWordCount(assignment.getTotalWordCount());
        view.setMasteredWordCount(assignment.getMasteredWordCount());
        view.setStatus(session.getStatus());
        view.setItems(extractSessionItems(session.getPayloadJson()));
        return view;
    }

    private List<WordReviewSessionItem> extractSessionItems(String payloadJson) {
        if (payloadJson == null || payloadJson.isBlank()) return List.of();
        try {
            Map<?, ?> payload = objectMapper.readValue(payloadJson, Map.class);
            Object raw = payload.get("items");
            if (!(raw instanceof List<?> list)) return List.of();
            List<WordReviewSessionItem> items = new ArrayList<>();
            for (Object row : list) {
                WordReviewSessionItem item = objectMapper.convertValue(row, WordReviewSessionItem.class);
                if (item != null && item.getEntryId() != null) items.add(item);
            }
            return items;
        } catch (Exception e) {
            return List.of();
        }
    }

    private WordReviewSessionItem toSessionItem(WordReviewWordProgress progress) {
        WordReviewSessionItem item = new WordReviewSessionItem();
        item.setEntryId(progress.getEntryId());
        item.setWord(progress.getWord());
        item.setMeaning(progress.getMeaning());
        item.setPhonetic(progress.getPhonetic());
        item.setWordAudio(progress.getWordAudio());
        item.setSentence(progress.getSentence());
        item.setSentenceCn(progress.getSentenceCn());
        item.setSentenceAudio(progress.getSentenceAudio());
        return item;
    }

    private double reviewPriorityScore(WordReviewWordProgress progress, LocalDate today) {
        double recency = 1.0;
        if (progress.getLastReviewedAt() != null) {
            long days = ChronoUnit.DAYS.between(progress.getLastReviewedAt().toLocalDate(), today);
            recency = Math.min(1.0, Math.max(0.0, days / 7.0));
        }

        double reviewCount = Math.max(1.0, Optional.ofNullable(progress.getReviewCount()).orElse(0));
        double errorRate = Optional.ofNullable(progress.getWrongCount()).orElse(0) / reviewCount;
        double streakNorm = Math.min(1.0, Optional.ofNullable(progress.getCurrentStreak()).orElse(0) / 3.0);
        double newWordBoost = Optional.ofNullable(progress.getReviewCount()).orElse(0) <= 0 ? 1.0 : 0.0;
        return 0.4 * recency + 0.3 * errorRate + 0.2 * (1.0 - streakNorm) + 0.1 * newWordBoost;
    }

    private int normalizePassScore(Integer passScore) {
        if (passScore == null) return DEFAULT_PASS_SCORE;
        if (passScore < 0 || passScore > 100) {
            throw new RuntimeException("passScore must be between 0 and 100");
        }
        return passScore;
    }

    private int extractPassScoreFromContentJson(String contentJson) {
        if (contentJson == null || contentJson.isBlank()) return DEFAULT_PASS_SCORE;
        try {
            Map<?, ?> payload = objectMapper.readValue(contentJson, Map.class);
            Object raw = payload.get("passScore");
            if (raw instanceof Number n) {
                int v = n.intValue();
                return Math.max(0, Math.min(100, v));
            }
            if (raw != null) {
                int v = Integer.parseInt(String.valueOf(raw));
                return Math.max(0, Math.min(100, v));
            }
            return DEFAULT_PASS_SCORE;
        } catch (Exception e) {
            return DEFAULT_PASS_SCORE;
        }
    }

    private boolean isDurationBetter(Integer incomingDuration, Integer currentDuration) {
        if (incomingDuration == null || incomingDuration <= 0) return false;
        if (currentDuration == null || currentDuration <= 0) return true;
        return incomingDuration < currentDuration;
    }

    private int effectiveAttemptCount(TestAssignment assignment) {
        Integer value = assignment.getAttemptCount();
        if (value != null && value >= 0) return value;
        if (assignment.getScore() != null || assignment.getCompletedAt() != null) return 1;
        return 0;
    }

    private List<WordTestContentItem> extractItemsFromContentJson(String contentJson) {
        if (contentJson == null || contentJson.isBlank()) return List.of();
        try {
            Map<?, ?> payload = objectMapper.readValue(contentJson, Map.class);
            Object rawItems = payload.get("items");
            if (!(rawItems instanceof List<?> list)) return List.of();
            List<WordTestContentItem> items = new ArrayList<>();
            for (Object v : list) {
                WordTestContentItem item = objectMapper.convertValue(v, WordTestContentItem.class);
                if (item != null && item.getEntryId() != null) {
                    items.add(item);
                }
            }
            return items;
        } catch (Exception e) {
            return List.of();
        }
    }

    private ParsedExamJsonl parseExamJsonl(
            MultipartFile file,
            String bookVersion,
            String grade,
            String semester,
            String unitCode
    ) {
        if (file == null || file.isEmpty()) {
            throw new RuntimeException("请上传 JSONL 文件");
        }

        Map<String, Object> meta = null;
        List<Map<String, Object>> materials = new ArrayList<>();
        List<Map<String, Object>> questions = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) continue;
                Map<String, Object> row = objectMapper.readValue(line, new TypeReference<Map<String, Object>>() {});
                String recordType = safe(row.get("record_type"));
                if ("meta".equalsIgnoreCase(recordType)) {
                    meta = row;
                    continue;
                }
                if ("material".equalsIgnoreCase(recordType)) {
                    materials.add(row);
                    continue;
                }
                if ("question".equalsIgnoreCase(recordType)) {
                    questions.add(row);
                }
            }
        } catch (IOException e) {
            throw new RuntimeException("读取 JSONL 失败");
        }

        if (meta == null) {
            throw new RuntimeException("JSONL 缺少 meta 记录");
        }
        if (questions.isEmpty()) {
            throw new RuntimeException("JSONL 未包含题目数据");
        }

        String metaBookVersion = safe(rawString(meta, "book_version"));
        String metaGrade = safe(rawString(meta, "grade"));
        String metaSemester = safe(rawString(meta, "semester"));
        String metaUnit = normalizeExamUnitCode(rawString(meta, "unit"));
        if (!bookVersion.equals(metaBookVersion)
                || !grade.equals(metaGrade)
                || !semester.equals(metaSemester)
                || !unitCode.equals(metaUnit)) {
            throw new RuntimeException("导入范围与 JSONL meta 中的教材范围不一致");
        }

        return new ParsedExamJsonl(meta, materials, questions);
    }

    private List<Map<String, Object>> parseOptionRows(Object value) {
        if (!(value instanceof List<?> list)) return List.of();
        List<Map<String, Object>> rows = new ArrayList<>();
        for (Object item : list) {
            if (item instanceof Map<?, ?> raw) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("key", safe(raw.get("key")));
                row.put("text", safe(raw.get("text")));
                rows.add(row);
            }
        }
        return rows;
    }

    private Integer parseRequiredInt(Object value, String fieldName) {
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (Exception e) {
            throw new RuntimeException("字段 " + fieldName + " 不是有效数字");
        }
    }

    private String rawString(Map<String, Object> row, String key) {
        return row == null ? "" : String.valueOf(row.getOrDefault(key, "")).trim();
    }

    private String resolveExamPaperName(Map<String, Object> meta, String unitCode, String paperType) {
        String title = safe(rawString(meta, "source_title"));
        if (!title.isEmpty()) return title;
        return unitCode + " " + paperType;
    }

    private String buildExamPaperCode(
            String sourceType,
            String paperType,
            String bookVersion,
            String grade,
            String semester,
            String unitCode
    ) {
        return "paper_" + buildStableId(sourceType, paperType, bookVersion, grade, semester, unitCode);
    }

    private String normalizeExamUnitCode(Object value) {
        String raw = safe(value);
        if (raw.isEmpty()) return "";
        String compact = raw.replaceAll("\\s+", "");
        if (compact.matches("(?i)^unit\\d+[a-zA-Z]?$")) {
            String suffix = compact.substring(4);
            return "Unit " + suffix.toUpperCase();
        }
        return raw;
    }

    private String normalizeExamPaperType(Object value, String sourceType) {
        String raw = safe(value);
        String normalizedSourceType = safe(sourceType);
        if (raw.isEmpty() && "sync_exam".equalsIgnoreCase(normalizedSourceType)) {
            return "同步测试题";
        }
        if ("sync_exam".equalsIgnoreCase(normalizedSourceType)) {
            if ("同步测试题".equals(raw) || "同步题".equals(raw) || "单元拔尖检测".equals(raw) || "单元测试题".equals(raw)) {
                return "同步测试题";
            }
        }
        return raw;
    }

    private boolean isSameExamPaperType(String expected, String actual) {
        if (expected.isEmpty()) return true;
        String normalizedExpected = normalizeExamPaperType(expected, "");
        String normalizedActual = normalizeExamPaperType(actual, "");
        return normalizedExpected.equals(normalizedActual);
    }

    private String buildStableId(Object... parts) {
        StringBuilder seed = new StringBuilder();
        for (Object part : parts) {
            if (seed.length() > 0) seed.append('|');
            seed.append(safe(part));
        }
        try {
            MessageDigest md5 = MessageDigest.getInstance("MD5");
            byte[] bytes = md5.digest(seed.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : bytes) {
                hex.append(String.format("%02x", b));
            }
            return hex.substring(0, 16);
        } catch (Exception e) {
            throw new RuntimeException("生成稳定 ID 失败");
        }
    }

    private ExamPaper requireExamPaper(Long paperId) {
        if (paperId == null) {
            throw new RuntimeException("paperId 不能为空");
        }
        return examPaperRepository.findById(paperId)
                .orElseThrow(() -> new RuntimeException("试卷不存在"));
    }

    private ExamMaterial requireExamMaterial(Long paperId, Long materialId) {
        if (materialId == null) {
            throw new RuntimeException("materialId 不能为空");
        }
        ExamMaterial material = examMaterialRepository.findById(materialId)
                .orElseThrow(() -> new RuntimeException("材料不存在"));
        if (!paperId.equals(material.getPaperId())) {
            throw new RuntimeException("材料不属于当前试卷");
        }
        return material;
    }

    private ExamQuestion requireExamQuestion(Long paperId, Long questionId) {
        if (questionId == null) {
            throw new RuntimeException("questionId 不能为空");
        }
        ExamQuestion question = examQuestionRepository.findById(questionId)
                .orElseThrow(() -> new RuntimeException("题目不存在"));
        if (!paperId.equals(question.getPaperId())) {
            throw new RuntimeException("题目不属于当前试卷");
        }
        return question;
    }

    private void applyMaterialRequest(ExamMaterial material, ExamMaterialUpsertRequest request, ExamPaper paper) {
        if (request == null) {
            throw new RuntimeException("材料请求不能为空");
        }
        String label = safe(request.getMaterialLabel());
        String questionType = safe(request.getQuestionType());
        String content = safe(request.getContent());
        if (label.isEmpty() || questionType.isEmpty() || content.isEmpty()) {
            throw new RuntimeException("材料标签、题型、内容不能为空");
        }
        String materialUid = safe(request.getMaterialUid());
        if (materialUid.isEmpty()) {
            String paperCode = paper != null ? paper.getPaperCode() : String.valueOf(material.getPaperId());
            materialUid = buildStableId("material", paperCode, questionType, label);
        }
        material.setMaterialUid(materialUid);
        material.setMaterialLabel(label);
        material.setQuestionType(questionType);
        material.setTitle(safe(request.getTitle()));
        material.setContent(content);
        material.setAnalysis(safe(request.getAnalysis()));
        material.setSortOrder(request.getSortOrder() == null ? Optional.ofNullable(material.getSortOrder()).orElse(0) : request.getSortOrder());
    }

    private void applyQuestionRequest(ExamQuestion question, ExamQuestionUpsertRequest request, ExamPaper paper) {
        if (request == null) {
            throw new RuntimeException("题目请求不能为空");
        }
        Integer questionNo = request.getQuestionNo();
        String questionType = safe(request.getQuestionType());
        if (questionNo == null || questionNo <= 0 || questionType.isEmpty()) {
            throw new RuntimeException("题号和题型不能为空");
        }
        Long materialId = request.getMaterialId();
        if (materialId != null) {
            requireExamMaterial(paper.getId(), materialId);
        }
        String questionUid = safe(request.getQuestionUid());
        if (questionUid.isEmpty()) {
            questionUid = buildStableId("question", paper.getPaperCode(), questionNo, questionType);
        }
        question.setQuestionUid(questionUid);
        question.setQuestionNo(questionNo);
        question.setQuestionType(questionType);
        question.setStem(safe(request.getStem()));
        question.setAnswerText(safe(request.getAnswerText()));
        question.setAnalysis(safe(request.getAnalysis()));
        question.setDifficulty(safe(request.getDifficulty()));
        question.setStatus(safe(request.getStatus()).isEmpty() ? "active" : safe(request.getStatus()));
        question.setSortOrder(request.getSortOrder() == null ? questionNo : request.getSortOrder());
        question.setMaterialId(materialId);
        if (question.getScore() == null) {
            question.setScore(BigDecimal.ONE);
        }
    }

    private void replaceQuestionOptions(Long questionId, List<ExamQuestionOptionPayload> options) {
        examQuestionOptionRepository.deleteByQuestionId(questionId);
        if (options == null || options.isEmpty()) return;
        List<ExamQuestionOption> rows = new ArrayList<>();
        for (int i = 0; i < options.size(); i++) {
            ExamQuestionOptionPayload raw = options.get(i);
            if (raw == null) continue;
            String key = safe(raw.getKey());
            String text = safe(raw.getText());
            if (key.isEmpty() || text.isEmpty()) continue;
            ExamQuestionOption option = new ExamQuestionOption();
            option.setQuestionId(questionId);
            option.setOptionKey(key);
            option.setOptionText(text);
            option.setSortOrder(raw.getSortOrder() == null ? (i + 1) : raw.getSortOrder());
            rows.add(option);
        }
        if (!rows.isEmpty()) {
            examQuestionOptionRepository.saveAll(rows);
        }
    }

    private void refreshPaperQuestionCount(Long paperId) {
        ExamPaper paper = requireExamPaper(paperId);
        paper.setQuestionCount(examQuestionRepository.findByPaperIdOrderByQuestionNoAsc(paperId).size());
        examPaperRepository.save(paper);
    }

    private Map<Long, ExamMaterial> loadMaterialMap(Long paperId) {
        return examMaterialRepository.findByPaperIdOrderBySortOrderAscIdAsc(paperId).stream()
                .collect(Collectors.toMap(ExamMaterial::getId, item -> item, (a, b) -> a, LinkedHashMap::new));
    }

    private DeleteStats deleteExamPaperCascade(Long paperId) {
        DeleteStats stats = new DeleteStats();
        if (paperId == null) return stats;
        List<ExamQuestion> questions = examQuestionRepository.findByPaperIdOrderByQuestionNoAsc(paperId);
        List<Long> questionIds = questions.stream().map(ExamQuestion::getId).toList();
        stats.deletedOptionCount += questions.stream()
                .mapToInt(question -> examQuestionOptionRepository.findByQuestionIdOrderBySortOrderAscIdAsc(question.getId()).size())
                .sum();
        if (!questionIds.isEmpty()) {
            examQuestionOptionRepository.deleteByQuestionIdIn(questionIds);
        }
        List<ExamMaterial> materials = examMaterialRepository.findByPaperIdOrderBySortOrderAscIdAsc(paperId);
        examQuestionRepository.deleteByPaperId(paperId);
        examMaterialRepository.deleteByPaperId(paperId);
        examPaperRepository.deleteById(paperId);
        stats.deletedPaperCount = 1;
        stats.deletedMaterialCount = materials.size();
        stats.deletedQuestionCount = questions.size();
        return stats;
    }

    private ExamDeleteResult toDeleteResult(String message, DeleteStats stats) {
        ExamDeleteResult result = new ExamDeleteResult();
        result.setMessage(message);
        result.setDeletedPaperCount(stats.deletedPaperCount);
        result.setDeletedMaterialCount(stats.deletedMaterialCount);
        result.setDeletedQuestionCount(stats.deletedQuestionCount);
        result.setDeletedOptionCount(stats.deletedOptionCount);
        return result;
    }

    private ExamPaperSummaryView toExamPaperSummary(ExamPaper paper) {
        ExamPaperSummaryView view = new ExamPaperSummaryView();
        view.setId(paper.getId());
        view.setPaperCode(paper.getPaperCode());
        view.setPaperName(paper.getPaperName());
        view.setPaperType(paper.getPaperType());
        view.setSourceType(paper.getSourceType());
        view.setBookVersion(paper.getBookVersion());
        view.setGrade(paper.getGrade());
        view.setSemester(paper.getSemester());
        view.setUnitCode(paper.getUnitCode());
        view.setSourceFile(paper.getSourceFile());
        view.setQuestionCount(paper.getQuestionCount());
        view.setStatus(paper.getStatus());
        view.setCreatedAt(paper.getCreatedAt());
        view.setUpdatedAt(paper.getUpdatedAt());
        return view;
    }

    private ExamPaperDetailView buildExamPaperDetail(ExamPaper paper) {
        List<ExamMaterial> materials = examMaterialRepository.findByPaperIdOrderBySortOrderAscIdAsc(paper.getId());
        List<ExamQuestion> questions = examQuestionRepository.findByPaperIdOrderByQuestionNoAsc(paper.getId());

        Map<Long, ExamMaterial> materialMap = materials.stream()
                .collect(Collectors.toMap(ExamMaterial::getId, item -> item, (a, b) -> a, LinkedHashMap::new));

        ExamPaperDetailView detail = new ExamPaperDetailView();
        detail.setId(paper.getId());
        detail.setPaperCode(paper.getPaperCode());
        detail.setPaperName(paper.getPaperName());
        detail.setPaperType(paper.getPaperType());
        detail.setSourceType(paper.getSourceType());
        detail.setBookVersion(paper.getBookVersion());
        detail.setGrade(paper.getGrade());
        detail.setSemester(paper.getSemester());
        detail.setUnitCode(paper.getUnitCode());
        detail.setSourceFile(paper.getSourceFile());
        detail.setQuestionCount(paper.getQuestionCount());
        detail.setStatus(paper.getStatus());
        detail.setCreatedBy(paper.getCreatedBy());
        detail.setCreatedAt(paper.getCreatedAt());
        detail.setUpdatedAt(paper.getUpdatedAt());
        detail.setMaterials(materials.stream().map(this::toExamMaterialView).toList());
        detail.setQuestions(questions.stream().map(question -> toExamQuestionView(question, materialMap)).toList());
        return detail;
    }

    private ExamMaterialView toExamMaterialView(ExamMaterial material) {
        ExamMaterialView view = new ExamMaterialView();
        view.setId(material.getId());
        view.setMaterialUid(material.getMaterialUid());
        view.setMaterialLabel(material.getMaterialLabel());
        view.setQuestionType(material.getQuestionType());
        view.setTitle(material.getTitle());
        view.setContent(material.getContent());
        view.setAnalysis(material.getAnalysis());
        view.setSortOrder(material.getSortOrder());
        return view;
    }

    private ExamQuestionView toExamQuestionView(ExamQuestion question, Map<Long, ExamMaterial> materialMap) {
        ExamQuestionView view = new ExamQuestionView();
        view.setId(question.getId());
        view.setQuestionUid(question.getQuestionUid());
        view.setQuestionNo(question.getQuestionNo());
        view.setQuestionType(question.getQuestionType());
        view.setStem(question.getStem());
        view.setAnswerText(question.getAnswerText());
        view.setAnalysis(question.getAnalysis());
        view.setDifficulty(question.getDifficulty());
        view.setStatus(question.getStatus());
        view.setSortOrder(question.getSortOrder());
        view.setMaterialId(question.getMaterialId());

        ExamMaterial material = question.getMaterialId() == null ? null : materialMap.get(question.getMaterialId());
        if (material != null) {
            view.setMaterialUid(material.getMaterialUid());
            view.setMaterialLabel(material.getMaterialLabel());
        }

        view.setOptions(examQuestionOptionRepository.findByQuestionIdOrderBySortOrderAscIdAsc(question.getId()).stream()
                .map(this::toExamQuestionOptionView)
                .toList());
        return view;
    }

    private ExamQuestionOptionView toExamQuestionOptionView(ExamQuestionOption option) {
        ExamQuestionOptionView view = new ExamQuestionOptionView();
        view.setKey(option.getOptionKey());
        view.setText(option.getOptionText());
        view.setSortOrder(option.getSortOrder());
        return view;
    }

    private StudentExamPracticeResultView toStudentExamPracticeResultView(ExamPracticeRecord record) {
        StudentExamPracticeResultView view = new StudentExamPracticeResultView();
        view.setPracticeId(record.getId());
        view.setUserId(record.getUserId());
        view.setPaperId(record.getPaperId());
        view.setPaperName(record.getPaperName());
        view.setBookVersion(record.getBookVersion());
        view.setGrade(record.getGrade());
        view.setSemester(record.getSemester());
        view.setUnitCode(record.getUnitCode());
        view.setScore(record.getScore());
        view.setCorrectCount(record.getCorrectCount());
        view.setTotalCount(record.getTotalCount());
        view.setDurationSeconds(record.getDurationSeconds());
        view.setSubmittedAt(record.getSubmittedAt());
        view.setAnswers(parsePracticeResultAnswers(record.getAnswersJson()));
        return view;
    }

    private List<StudentExamPracticeQuestionResultView> parsePracticeResultAnswers(String answersJson) {
        if (answersJson == null || answersJson.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(answersJson, new TypeReference<List<StudentExamPracticeQuestionResultView>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private StudentExamWrongNotebookItemView toStudentExamWrongNotebookItemView(ExamWrongNotebookItem item) {
        StudentExamWrongNotebookItemView view = new StudentExamWrongNotebookItemView();
        view.setId(item.getId());
        view.setPaperId(item.getPaperId());
        view.setPaperName(item.getPaperName());
        view.setBookVersion(item.getBookVersion());
        view.setGrade(item.getGrade());
        view.setSemester(item.getSemester());
        view.setUnitCode(item.getUnitCode());
        view.setQuestionId(item.getQuestionId());
        view.setQuestionUid(item.getQuestionUid());
        view.setQuestionNo(item.getQuestionNo());
        view.setQuestionType(item.getQuestionType());
        view.setMaterialLabel(item.getMaterialLabel());
        view.setMaterialTitle(item.getMaterialTitle());
        view.setMaterialContent(item.getMaterialContent());
        view.setMaterialAnalysis(item.getMaterialAnalysis());
        view.setStem(item.getStem());
        view.setOptions(parseQuestionOptionsJson(item.getOptionsJson()));
        view.setSubmittedAnswer(item.getSubmittedAnswer());
        view.setCorrectAnswer(item.getCorrectAnswer());
        view.setAnalysis(item.getAnalysis());
        view.setWrongCount(item.getWrongCount());
        view.setLastWrongAt(item.getLastWrongAt());
        return view;
    }

    private List<ExamQuestionOptionView> parseQuestionOptionsJson(String optionsJson) {
        if (optionsJson == null || optionsJson.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(optionsJson, new TypeReference<List<ExamQuestionOptionView>>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private void upsertWrongNotebookItem(Long userId, ExamPaper paper, ExamQuestion question, ExamMaterial material, String submittedAnswer) {
        ExamWrongNotebookItem item = examWrongNotebookItemRepository.findByUserIdAndQuestionUid(userId, question.getQuestionUid())
                .orElseGet(ExamWrongNotebookItem::new);
        item.setUserId(userId);
        item.setPaperId(paper.getId());
        item.setPaperName(paper.getPaperName());
        item.setBookVersion(paper.getBookVersion());
        item.setGrade(paper.getGrade());
        item.setSemester(paper.getSemester());
        item.setUnitCode(paper.getUnitCode());
        item.setQuestionId(question.getId());
        item.setQuestionUid(question.getQuestionUid());
        item.setQuestionNo(question.getQuestionNo());
        item.setQuestionType(question.getQuestionType());
        item.setMaterialLabel(material == null ? "" : safe(material.getMaterialLabel()));
        item.setMaterialTitle(material == null ? "" : safe(material.getTitle()));
        item.setMaterialContent(material == null ? "" : safe(material.getContent()));
        item.setMaterialAnalysis(material == null ? "" : safe(material.getAnalysis()));
        item.setStem(question.getStem());
        item.setOptionsJson(writeJson(examQuestionOptionRepository.findByQuestionIdOrderBySortOrderAscIdAsc(question.getId()).stream()
                .map(this::toExamQuestionOptionView)
                .toList()));
        item.setSubmittedAnswer(submittedAnswer);
        item.setCorrectAnswer(safe(question.getAnswerText()));
        item.setAnalysis(safe(question.getAnalysis()));
        item.setWrongCount(Optional.ofNullable(item.getWrongCount()).orElse(0) + 1);
        item.setLastWrongAt(LocalDateTime.now());
        examWrongNotebookItemRepository.save(item);
    }

    private boolean isStudentAnswerCorrect(String submittedAnswer, String correctAnswer) {
        String normalizedSubmitted = normalizeStudentAnswer(submittedAnswer);
        String normalizedCorrect = normalizeStudentAnswer(correctAnswer);
        if (normalizedCorrect.isEmpty()) {
            return normalizedSubmitted.isEmpty();
        }
        if (normalizedSubmitted.equalsIgnoreCase(normalizedCorrect)) {
            return true;
        }
        List<String> accepted = splitAcceptedAnswers(normalizedCorrect);
        return accepted.stream().anyMatch(answer -> answer.equalsIgnoreCase(normalizedSubmitted));
    }

    private List<String> splitAcceptedAnswers(String answerText) {
        String normalized = normalizeStudentAnswer(answerText);
        if (normalized.isEmpty()) {
            return List.of();
        }
        return List.of(normalized.split("\\|"))
                .stream()
                .flatMap(part -> List.of(part.split("/")).stream())
                .flatMap(part -> List.of(part.split(";")).stream())
                .map(this::normalizeStudentAnswer)
                .filter(part -> !part.isEmpty())
                .distinct()
                .toList();
    }

    private String normalizeStudentAnswer(String value) {
        return safe(value)
                .replace('（', '(')
                .replace('）', ')')
                .replace('，', ',')
                .replaceAll("\\s+", " ")
                .trim();
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception e) {
            throw new RuntimeException("json 搴忓垪鍖栧け璐?");
        }
    }

    private void cleanupOrphanWordTest(String testId) {
        if (testId == null || testId.isBlank()) return;
        long count = testAssignmentRepository.countByTestId(testId);
        if (count == 0) {
            wordTestRepository.deleteById(testId);
        }
    }

    private void cleanupOrphanWordReviewTask(String taskId) {
        if (taskId == null || taskId.isBlank()) return;
        long count = wordReviewAssignmentRepository.countByTaskId(taskId);
        if (count == 0) {
            wordReviewTaskRepository.deleteById(taskId);
        }
    }

    private record ParsedExamJsonl(
            Map<String, Object> meta,
            List<Map<String, Object>> materials,
            List<Map<String, Object>> questions
    ) {}

    private static class DeleteStats {
        private int deletedPaperCount;
        private int deletedMaterialCount;
        private int deletedQuestionCount;
        private int deletedOptionCount;

        private void merge(DeleteStats other) {
            if (other == null) return;
            this.deletedPaperCount += other.deletedPaperCount;
            this.deletedMaterialCount += other.deletedMaterialCount;
            this.deletedQuestionCount += other.deletedQuestionCount;
            this.deletedOptionCount += other.deletedOptionCount;
        }
    }
}

