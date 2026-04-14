package com.kineticscholar.testservice.service;

import com.kineticscholar.testservice.model.WordTest;
import com.kineticscholar.testservice.model.TestAssignment;
import com.kineticscholar.testservice.model.TestAnswer;
import com.kineticscholar.testservice.model.UnitAssignment;
import com.kineticscholar.testservice.dto.PublishWordTestRequest;
import com.kineticscholar.testservice.dto.PublishWordReviewRequest;
import com.kineticscholar.testservice.dto.StudentWordTestAssignmentView;
import com.kineticscholar.testservice.dto.StudentWordReviewAssignmentView;
import com.kineticscholar.testservice.dto.SubmitWordReviewSessionRequest;
import com.kineticscholar.testservice.dto.UnitTaskItem;
import com.kineticscholar.testservice.dto.WordTestAssignmentView;
import com.kineticscholar.testservice.dto.WordReviewAssignmentView;
import com.kineticscholar.testservice.dto.WordReviewDailySessionView;
import java.util.List;
import java.util.Optional;

public interface TestService {
    // WordTest methods
    WordTest createWordTest(WordTest wordTest);
    List<WordTest> getAllWordTests();
    List<WordTest> getWordTestsByCreator(Long creatorId);
    List<WordTest> getWordTestsByUnitId(String unitId);
    Optional<WordTest> getWordTestById(String id);
    WordTest updateWordTest(String id, WordTest wordTest);
    void deleteWordTest(String id);

    // TestAssignment methods
    TestAssignment createTestAssignment(TestAssignment testAssignment);
    List<TestAssignment> getTestAssignmentsByTestId(String testId);
    List<TestAssignment> getTestAssignmentsByUserId(Long userId);
    List<TestAssignment> getPendingTestAssignmentsByUserId(Long userId);
    Optional<TestAssignment> getTestAssignmentById(Long id);
    TestAssignment updateTestAssignment(Long id, TestAssignment testAssignment);
    void deleteTestAssignment(Long id);

    // TestAnswer methods
    TestAnswer createTestAnswer(TestAnswer testAnswer);
    List<TestAnswer> getTestAnswersByAssignmentId(Long assignmentId);
    void deleteTestAnswersByAssignmentId(Long assignmentId);

    // Business logic methods
    void assignTestToStudents(String testId, List<Long> studentIds);
    void submitTest(Long assignmentId, List<TestAnswer> answers, Integer score, Integer duration, Integer correctCount, Integer totalCount);

    // Unit task assignment methods
    List<UnitAssignment> getUnitAssignmentsByUserId(Long userId);
    List<UnitAssignment> getUnitAssignmentsByUserIds(List<Long> userIds);
    void assignUnitTasks(Long assignedBy, List<Long> studentIds, List<UnitTaskItem> units);
    void deleteUnitAssignment(Long assignmentId);
    void deleteUnitAssignments(List<Long> assignmentIds);

    // Teacher word test publish/query/delete
    WordTest publishWordTest(PublishWordTestRequest request);
    List<WordTestAssignmentView> getTeacherWordTestAssignments(Long teacherId, String storeCode);
    List<StudentWordTestAssignmentView> getStudentWordTests(Long userId);
    void deleteWordTestAssignment(Long assignmentId);
    void deleteWordTestAssignments(List<Long> assignmentIds);

    // Teacher/student word review
    void publishWordReview(PublishWordReviewRequest request);
    List<WordReviewAssignmentView> getTeacherWordReviewAssignments(Long teacherId, String storeCode);
    List<StudentWordReviewAssignmentView> getStudentWordReviews(Long userId);
    WordReviewDailySessionView startWordReviewDailySession(Long assignmentId);
    void submitWordReviewDailySession(Long sessionId, SubmitWordReviewSessionRequest request);
    void deleteWordReviewAssignment(Long assignmentId);
    void deleteWordReviewAssignments(List<Long> assignmentIds);
}
