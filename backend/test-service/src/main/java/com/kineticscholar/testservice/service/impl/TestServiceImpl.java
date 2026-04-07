package com.kineticscholar.testservice.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kineticscholar.testservice.dto.PublishWordTestRequest;
import com.kineticscholar.testservice.dto.StudentWordTestAssignmentView;
import com.kineticscholar.testservice.dto.WordTestContentItem;
import com.kineticscholar.testservice.dto.WordTestAssignmentView;
import com.kineticscholar.testservice.model.WordTest;
import com.kineticscholar.testservice.model.TestAssignment;
import com.kineticscholar.testservice.model.TestAnswer;
import com.kineticscholar.testservice.model.UnitAssignment;
import com.kineticscholar.testservice.dto.UnitTaskItem;
import com.kineticscholar.testservice.repository.WordTestRepository;
import com.kineticscholar.testservice.repository.TestAssignmentRepository;
import com.kineticscholar.testservice.repository.TestAnswerRepository;
import com.kineticscholar.testservice.repository.UnitAssignmentRepository;
import com.kineticscholar.testservice.service.TestService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class TestServiceImpl implements TestService {
    private static final String TYPE_DICTATION = "\u542c\u5199";
    private static final String TYPE_TRANSLATION = "\u9ed8\u5199";

    @Autowired
    private WordTestRepository wordTestRepository;

    @Autowired
    private TestAssignmentRepository testAssignmentRepository;

    @Autowired
    private TestAnswerRepository testAnswerRepository;

    @Autowired
    private UnitAssignmentRepository unitAssignmentRepository;

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
        // Update assignment status
        Optional<TestAssignment> existingAssignment = testAssignmentRepository.findById(assignmentId);
        if (existingAssignment.isPresent()) {
            TestAssignment assignment = existingAssignment.get();
            assignment.setStatus("completed");
            assignment.setScore(score);
            assignment.setCorrectCount(correctCount);
            assignment.setTotalCount(totalCount);
            assignment.setDuration(duration);
            assignment.setCompletedAt(LocalDateTime.now());
            testAssignmentRepository.save(assignment);

            // Save answers
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
            assignment.setStatus("published");
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
            row.setStatus(assignment.getStatus());
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
            row.setStatus("completed".equalsIgnoreCase(safe(assignment.getStatus())) ? "completed" : "pending");
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

    private String resolveWordTestTitle(String title) {
        String t = safe(title);
        if (!t.isEmpty()) return t;
        LocalDate d = LocalDate.now();
        return d.getYear() + "\u5e74" + d.getMonthValue() + "\u6708" + d.getDayOfMonth() + "\u65e5\u5355\u8bcd\u6d4b\u8bd5";
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
}

