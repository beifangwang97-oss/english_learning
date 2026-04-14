package com.kineticscholar.testservice.controller;

import com.kineticscholar.testservice.model.WordTest;
import com.kineticscholar.testservice.model.TestAssignment;
import com.kineticscholar.testservice.model.TestAnswer;
import com.kineticscholar.testservice.dto.BatchDeleteWordTestAssignmentsRequest;
import com.kineticscholar.testservice.dto.BatchDeleteWordReviewAssignmentsRequest;
import com.kineticscholar.testservice.dto.BatchAssignUnitTasksRequest;
import com.kineticscholar.testservice.dto.BatchDeleteUnitAssignmentsRequest;
import com.kineticscholar.testservice.dto.PublishWordTestRequest;
import com.kineticscholar.testservice.dto.PublishWordReviewRequest;
import com.kineticscholar.testservice.dto.SubmitWordReviewSessionRequest;
import com.kineticscholar.testservice.service.TestService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.ArrayList;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

@RestController
@RequestMapping({"/api", "/api/tests"})
public class TestController {

    @Autowired
    private TestService testService;

    // WordTest endpoints
    @PostMapping("/word-tests")
    public ResponseEntity<?> createWordTest(@RequestBody WordTest wordTest) {
        WordTest createdWordTest = testService.createWordTest(wordTest);
        return new ResponseEntity<>(createdWordTest, HttpStatus.CREATED);
    }

    @GetMapping("/word-tests")
    public ResponseEntity<?> getAllWordTests() {
        return new ResponseEntity<>(testService.getAllWordTests(), HttpStatus.OK);
    }

    @GetMapping("/word-tests/creator/{creatorId}")
    public ResponseEntity<?> getWordTestsByCreator(@PathVariable Long creatorId) {
        return new ResponseEntity<>(testService.getWordTestsByCreator(creatorId), HttpStatus.OK);
    }

    @GetMapping("/word-tests/unit/{unitId}")
    public ResponseEntity<?> getWordTestsByUnitId(@PathVariable String unitId) {
        return new ResponseEntity<>(testService.getWordTestsByUnitId(unitId), HttpStatus.OK);
    }

    @GetMapping("/word-tests/{id}")
    public ResponseEntity<?> getWordTestById(@PathVariable String id) {
        Optional<WordTest> wordTest = testService.getWordTestById(id);
        if (wordTest.isPresent()) {
            return new ResponseEntity<>(wordTest.get(), HttpStatus.OK);
        } else {
            return new ResponseEntity<>(Map.of("error", "WordTest not found"), HttpStatus.NOT_FOUND);
        }
    }

    @PutMapping("/word-tests/{id}")
    public ResponseEntity<?> updateWordTest(@PathVariable String id, @RequestBody WordTest wordTest) {
        try {
            WordTest updatedWordTest = testService.updateWordTest(id, wordTest);
            return new ResponseEntity<>(updatedWordTest, HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.NOT_FOUND);
        }
    }

    @DeleteMapping("/word-tests/{id}")
    public ResponseEntity<?> deleteWordTest(@PathVariable String id) {
        testService.deleteWordTest(id);
        return new ResponseEntity<>(HttpStatus.NO_CONTENT);
    }

    @PostMapping("/word-tests/publish")
    public ResponseEntity<?> publishWordTest(@RequestBody PublishWordTestRequest request) {
        try {
            WordTest saved = testService.publishWordTest(request);
            return new ResponseEntity<>(saved, HttpStatus.CREATED);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/word-tests/teacher-assignments")
    public ResponseEntity<?> getTeacherWordTestAssignments(
            @RequestParam("teacherId") Long teacherId,
            @RequestParam("storeCode") String storeCode
    ) {
        return new ResponseEntity<>(testService.getTeacherWordTestAssignments(teacherId, storeCode), HttpStatus.OK);
    }

    @GetMapping("/word-tests/student-assignments")
    public ResponseEntity<?> getStudentWordTests(@RequestParam("userId") Long userId) {
        return new ResponseEntity<>(testService.getStudentWordTests(userId), HttpStatus.OK);
    }

    @DeleteMapping("/word-tests/assignments/{assignmentId}")
    public ResponseEntity<?> deleteWordTestAssignment(@PathVariable Long assignmentId) {
        testService.deleteWordTestAssignment(assignmentId);
        return new ResponseEntity<>(Map.of("message", "Word test assignment deleted"), HttpStatus.OK);
    }

    @PostMapping("/word-tests/assignments/batch-delete")
    public ResponseEntity<?> batchDeleteWordTestAssignments(@RequestBody BatchDeleteWordTestAssignmentsRequest request) {
        if (request == null || request.getAssignmentIds() == null || request.getAssignmentIds().isEmpty()) {
            return new ResponseEntity<>(Map.of("error", "assignmentIds is required"), HttpStatus.BAD_REQUEST);
        }
        testService.deleteWordTestAssignments(request.getAssignmentIds());
        return new ResponseEntity<>(Map.of("message", "Word test assignments deleted"), HttpStatus.OK);
    }

    @PostMapping("/word-reviews/publish")
    public ResponseEntity<?> publishWordReview(@RequestBody PublishWordReviewRequest request) {
        try {
            testService.publishWordReview(request);
            return new ResponseEntity<>(Map.of("message", "Word review published"), HttpStatus.CREATED);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/word-reviews/teacher-assignments")
    public ResponseEntity<?> getTeacherWordReviewAssignments(
            @RequestParam("teacherId") Long teacherId,
            @RequestParam("storeCode") String storeCode
    ) {
        return new ResponseEntity<>(testService.getTeacherWordReviewAssignments(teacherId, storeCode), HttpStatus.OK);
    }

    @GetMapping("/word-reviews/student-assignments")
    public ResponseEntity<?> getStudentWordReviews(@RequestParam("userId") Long userId) {
        return new ResponseEntity<>(testService.getStudentWordReviews(userId), HttpStatus.OK);
    }

    @PostMapping("/word-reviews/assignments/{assignmentId}/start-daily-session")
    public ResponseEntity<?> startWordReviewDailySession(@PathVariable Long assignmentId) {
        return new ResponseEntity<>(testService.startWordReviewDailySession(assignmentId), HttpStatus.OK);
    }

    @PostMapping("/word-reviews/daily-sessions/{sessionId}/submit")
    public ResponseEntity<?> submitWordReviewDailySession(
            @PathVariable Long sessionId,
            @RequestBody SubmitWordReviewSessionRequest request
    ) {
        testService.submitWordReviewDailySession(sessionId, request);
        return new ResponseEntity<>(Map.of("message", "Word review session submitted"), HttpStatus.OK);
    }

    @DeleteMapping("/word-reviews/assignments/{assignmentId}")
    public ResponseEntity<?> deleteWordReviewAssignment(@PathVariable Long assignmentId) {
        testService.deleteWordReviewAssignment(assignmentId);
        return new ResponseEntity<>(Map.of("message", "Word review assignment deleted"), HttpStatus.OK);
    }

    @PostMapping("/word-reviews/assignments/batch-delete")
    public ResponseEntity<?> batchDeleteWordReviewAssignments(@RequestBody BatchDeleteWordReviewAssignmentsRequest request) {
        if (request == null || request.getAssignmentIds() == null || request.getAssignmentIds().isEmpty()) {
            return new ResponseEntity<>(Map.of("error", "assignmentIds is required"), HttpStatus.BAD_REQUEST);
        }
        testService.deleteWordReviewAssignments(request.getAssignmentIds());
        return new ResponseEntity<>(Map.of("message", "Word review assignments deleted"), HttpStatus.OK);
    }

    // TestAssignment endpoints
    @PostMapping("/test-assignments")
    public ResponseEntity<?> createTestAssignment(@RequestBody TestAssignment testAssignment) {
        TestAssignment createdTestAssignment = testService.createTestAssignment(testAssignment);
        return new ResponseEntity<>(createdTestAssignment, HttpStatus.CREATED);
    }

    @GetMapping("/test-assignments/test/{testId}")
    public ResponseEntity<?> getTestAssignmentsByTestId(@PathVariable String testId) {
        return new ResponseEntity<>(testService.getTestAssignmentsByTestId(testId), HttpStatus.OK);
    }

    @GetMapping("/test-assignments/user/{userId}")
    public ResponseEntity<?> getTestAssignmentsByUserId(@PathVariable Long userId) {
        return new ResponseEntity<>(testService.getTestAssignmentsByUserId(userId), HttpStatus.OK);
    }

    @GetMapping("/test-assignments/user/{userId}/pending")
    public ResponseEntity<?> getPendingTestAssignmentsByUserId(@PathVariable Long userId) {
        return new ResponseEntity<>(testService.getPendingTestAssignmentsByUserId(userId), HttpStatus.OK);
    }

    @GetMapping("/test-assignments/{id}")
    public ResponseEntity<?> getTestAssignmentById(@PathVariable Long id) {
        Optional<TestAssignment> testAssignment = testService.getTestAssignmentById(id);
        if (testAssignment.isPresent()) {
            return new ResponseEntity<>(testAssignment.get(), HttpStatus.OK);
        } else {
            return new ResponseEntity<>(Map.of("error", "TestAssignment not found"), HttpStatus.NOT_FOUND);
        }
    }

    @PutMapping("/test-assignments/{id}")
    public ResponseEntity<?> updateTestAssignment(@PathVariable Long id, @RequestBody TestAssignment testAssignment) {
        try {
            TestAssignment updatedTestAssignment = testService.updateTestAssignment(id, testAssignment);
            return new ResponseEntity<>(updatedTestAssignment, HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.NOT_FOUND);
        }
    }

    @DeleteMapping("/test-assignments/{id}")
    public ResponseEntity<?> deleteTestAssignment(@PathVariable Long id) {
        testService.deleteTestAssignment(id);
        return new ResponseEntity<>(HttpStatus.NO_CONTENT);
    }

    // TestAnswer endpoints
    @PostMapping("/test-answers")
    public ResponseEntity<?> createTestAnswer(@RequestBody TestAnswer testAnswer) {
        TestAnswer createdTestAnswer = testService.createTestAnswer(testAnswer);
        return new ResponseEntity<>(createdTestAnswer, HttpStatus.CREATED);
    }

    @GetMapping("/test-answers/assignment/{assignmentId}")
    public ResponseEntity<?> getTestAnswersByAssignmentId(@PathVariable Long assignmentId) {
        return new ResponseEntity<>(testService.getTestAnswersByAssignmentId(assignmentId), HttpStatus.OK);
    }

    // Business logic endpoints
    @PostMapping("/word-tests/{testId}/assign")
    public ResponseEntity<?> assignTestToStudents(@PathVariable String testId, @RequestBody Map<String, List<Long>> request) {
        List<Long> studentIds = request.get("studentIds");
        if (studentIds != null && !studentIds.isEmpty()) {
            testService.assignTestToStudents(testId, studentIds);
            return new ResponseEntity<>(Map.of("message", "Test assigned successfully"), HttpStatus.OK);
        } else {
            return new ResponseEntity<>(Map.of("error", "Student IDs are required"), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping("/test-assignments/{assignmentId}/submit")
    public ResponseEntity<?> submitTest(@PathVariable Long assignmentId, @RequestBody Map<String, Object> request) {
        List<TestAnswer> answers = parseAnswers(request.get("answers"));
        Integer score = toInteger(request.get("score"));
        Integer duration = toInteger(request.get("duration"));
        Integer correctCount = toInteger(request.get("correctCount"));
        Integer totalCount = toInteger(request.get("totalCount"));

        if (answers != null && score != null && duration != null) {
            testService.submitTest(assignmentId, answers, score, duration, correctCount, totalCount);
            return new ResponseEntity<>(Map.of("message", "Test submitted successfully"), HttpStatus.OK);
        } else {
            return new ResponseEntity<>(Map.of("error", "Answers, score, and duration are required"), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/unit-assignments/student/{userId}")
    public ResponseEntity<?> getStudentUnitAssignments(@PathVariable Long userId) {
        return new ResponseEntity<>(testService.getUnitAssignmentsByUserId(userId), HttpStatus.OK);
    }

    @GetMapping("/unit-assignments")
    public ResponseEntity<?> getUnitAssignmentsByUsers(@RequestParam(name = "userIds") String userIds) {
        List<Long> ids = List.of(userIds.split(",")).stream()
                .map(String::trim)
                .filter(v -> !v.isEmpty())
                .map(Long::valueOf)
                .collect(Collectors.toList());
        return new ResponseEntity<>(testService.getUnitAssignmentsByUserIds(ids), HttpStatus.OK);
    }

    @PostMapping("/unit-assignments/batch-assign")
    public ResponseEntity<?> batchAssignUnitTasks(@RequestBody BatchAssignUnitTasksRequest request) {
        if (request == null || request.getAssignedBy() == null) {
            return new ResponseEntity<>(Map.of("error", "assignedBy is required"), HttpStatus.BAD_REQUEST);
        }
        if (request.getStudentIds() == null || request.getStudentIds().isEmpty()) {
            return new ResponseEntity<>(Map.of("error", "studentIds is required"), HttpStatus.BAD_REQUEST);
        }
        if (request.getUnits() == null || request.getUnits().isEmpty()) {
            return new ResponseEntity<>(Map.of("error", "units is required"), HttpStatus.BAD_REQUEST);
        }

        testService.assignUnitTasks(request.getAssignedBy(), request.getStudentIds(), request.getUnits());
        return new ResponseEntity<>(Map.of("message", "Unit tasks assigned successfully"), HttpStatus.OK);
    }

    @DeleteMapping("/unit-assignments/{assignmentId}")
    public ResponseEntity<?> deleteUnitAssignment(@PathVariable Long assignmentId) {
        testService.deleteUnitAssignment(assignmentId);
        return new ResponseEntity<>(Map.of("message", "Unit assignment deleted"), HttpStatus.OK);
    }

    @PostMapping("/unit-assignments/batch-delete")
    public ResponseEntity<?> batchDeleteUnitAssignments(@RequestBody BatchDeleteUnitAssignmentsRequest request) {
        if (request == null || request.getAssignmentIds() == null || request.getAssignmentIds().isEmpty()) {
            return new ResponseEntity<>(Map.of("error", "assignmentIds is required"), HttpStatus.BAD_REQUEST);
        }
        testService.deleteUnitAssignments(request.getAssignmentIds());
        return new ResponseEntity<>(Map.of("message", "Unit assignments deleted"), HttpStatus.OK);
    }

    private Integer toInteger(Object value) {
        if (value == null) return null;
        if (value instanceof Integer i) return i;
        if (value instanceof Number n) return n.intValue();
        try {
            return Integer.parseInt(String.valueOf(value));
        } catch (Exception e) {
            return null;
        }
    }

    private List<TestAnswer> parseAnswers(Object value) {
        if (!(value instanceof List<?> list)) return null;
        List<TestAnswer> answers = new ArrayList<>();
        for (Object row : list) {
            if (!(row instanceof Map<?, ?> map)) continue;
            TestAnswer answer = new TestAnswer();
            Object wordId = map.get("wordId");
            if (wordId == null) continue;
            answer.setWordId(String.valueOf(wordId));
            Object input = map.get("input");
            answer.setInput(input == null ? "" : String.valueOf(input));
            Object isCorrect = map.get("isCorrect");
            if (isCorrect instanceof Boolean b) {
                answer.setCorrect(b);
            } else {
                answer.setCorrect(Boolean.parseBoolean(String.valueOf(isCorrect)));
            }
            answers.add(answer);
        }
        return answers;
    }
}
