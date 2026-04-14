package com.kineticscholar.testservice.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kineticscholar.testservice.dto.PublishWordTestRequest;
import com.kineticscholar.testservice.dto.PublishWordReviewRequest;
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
import com.kineticscholar.testservice.model.WordTest;
import com.kineticscholar.testservice.model.WordReviewTask;
import com.kineticscholar.testservice.model.WordReviewAssignment;
import com.kineticscholar.testservice.model.WordReviewDailySession;
import com.kineticscholar.testservice.model.WordReviewWordProgress;
import com.kineticscholar.testservice.model.TestAssignment;
import com.kineticscholar.testservice.model.TestAnswer;
import com.kineticscholar.testservice.model.UnitAssignment;
import com.kineticscholar.testservice.dto.UnitTaskItem;
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

    private String safe(String value) {
        return value == null ? "" : value.trim();
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
}

