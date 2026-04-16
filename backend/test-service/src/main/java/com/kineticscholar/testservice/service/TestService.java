package com.kineticscholar.testservice.service;

import com.kineticscholar.testservice.dto.ExamDeleteResult;
import com.kineticscholar.testservice.dto.ExamImportResult;
import com.kineticscholar.testservice.dto.ExamMaterialUpsertRequest;
import com.kineticscholar.testservice.dto.ExamMaterialView;
import com.kineticscholar.testservice.dto.ExamPaperDetailView;
import com.kineticscholar.testservice.dto.ExamPaperSummaryView;
import com.kineticscholar.testservice.dto.ExamPaperUpdateRequest;
import com.kineticscholar.testservice.dto.ExamQuestionUpsertRequest;
import com.kineticscholar.testservice.dto.ExamQuestionView;
import com.kineticscholar.testservice.dto.PublishWordReviewRequest;
import com.kineticscholar.testservice.dto.PublishWordTestRequest;
import com.kineticscholar.testservice.dto.StudentExamPracticeResultView;
import com.kineticscholar.testservice.dto.StudentExamPracticeSubmitRequest;
import com.kineticscholar.testservice.dto.StudentExamWrongNotebookItemView;
import com.kineticscholar.testservice.dto.StudentWordReviewAssignmentView;
import com.kineticscholar.testservice.dto.StudentWordTestAssignmentView;
import com.kineticscholar.testservice.dto.SubmitWordReviewSessionRequest;
import com.kineticscholar.testservice.dto.UnitTaskItem;
import com.kineticscholar.testservice.dto.WordReviewAssignmentView;
import com.kineticscholar.testservice.dto.WordReviewDailySessionView;
import com.kineticscholar.testservice.dto.WordTestAssignmentView;
import com.kineticscholar.testservice.model.TestAnswer;
import com.kineticscholar.testservice.model.TestAssignment;
import com.kineticscholar.testservice.model.UnitAssignment;
import com.kineticscholar.testservice.model.WordTest;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Optional;

public interface TestService {
    WordTest createWordTest(WordTest wordTest);
    List<WordTest> getAllWordTests();
    List<WordTest> getWordTestsByCreator(Long creatorId);
    List<WordTest> getWordTestsByUnitId(String unitId);
    Optional<WordTest> getWordTestById(String id);
    WordTest updateWordTest(String id, WordTest wordTest);
    void deleteWordTest(String id);

    TestAssignment createTestAssignment(TestAssignment testAssignment);
    List<TestAssignment> getTestAssignmentsByTestId(String testId);
    List<TestAssignment> getTestAssignmentsByUserId(Long userId);
    List<TestAssignment> getPendingTestAssignmentsByUserId(Long userId);
    Optional<TestAssignment> getTestAssignmentById(Long id);
    TestAssignment updateTestAssignment(Long id, TestAssignment testAssignment);
    void deleteTestAssignment(Long id);

    TestAnswer createTestAnswer(TestAnswer testAnswer);
    List<TestAnswer> getTestAnswersByAssignmentId(Long assignmentId);
    void deleteTestAnswersByAssignmentId(Long assignmentId);

    void assignTestToStudents(String testId, List<Long> studentIds);
    void submitTest(Long assignmentId, List<TestAnswer> answers, Integer score, Integer duration, Integer correctCount, Integer totalCount);

    List<UnitAssignment> getUnitAssignmentsByUserId(Long userId);
    List<UnitAssignment> getUnitAssignmentsByUserIds(List<Long> userIds);
    void assignUnitTasks(Long assignedBy, List<Long> studentIds, List<UnitTaskItem> units);
    void deleteUnitAssignment(Long assignmentId);
    void deleteUnitAssignments(List<Long> assignmentIds);

    WordTest publishWordTest(PublishWordTestRequest request);
    List<WordTestAssignmentView> getTeacherWordTestAssignments(Long teacherId, String storeCode);
    List<StudentWordTestAssignmentView> getStudentWordTests(Long userId);
    void deleteWordTestAssignment(Long assignmentId);
    void deleteWordTestAssignments(List<Long> assignmentIds);

    void publishWordReview(PublishWordReviewRequest request);
    List<WordReviewAssignmentView> getTeacherWordReviewAssignments(Long teacherId, String storeCode);
    List<StudentWordReviewAssignmentView> getStudentWordReviews(Long userId);
    WordReviewDailySessionView startWordReviewDailySession(Long assignmentId);
    void submitWordReviewDailySession(Long sessionId, SubmitWordReviewSessionRequest request);
    void deleteWordReviewAssignment(Long assignmentId);
    void deleteWordReviewAssignments(List<Long> assignmentIds);

    ExamImportResult importExamPaperJsonl(
            MultipartFile file,
            String bookVersion,
            String grade,
            String semester,
            String unitCode,
            boolean overwrite,
            Long createdBy
    );
    List<ExamPaperSummaryView> getExamPapers(String bookVersion, String grade, String semester, String unitCode, String paperType);
    long countExamPapers(String bookVersion, String grade, String semester, String unitCode, String paperType);
    Optional<ExamPaperDetailView> getExamPaperDetail(Long paperId);
    ExamPaperDetailView updateExamPaper(Long paperId, ExamPaperUpdateRequest request);
    ExamMaterialView createExamMaterial(Long paperId, ExamMaterialUpsertRequest request);
    ExamMaterialView updateExamMaterial(Long paperId, Long materialId, ExamMaterialUpsertRequest request);
    void deleteExamMaterial(Long paperId, Long materialId);
    ExamQuestionView createExamQuestion(Long paperId, ExamQuestionUpsertRequest request);
    ExamQuestionView updateExamQuestion(Long paperId, Long questionId, ExamQuestionUpsertRequest request);
    void deleteExamQuestion(Long paperId, Long questionId);
    ExamDeleteResult deleteExamPaper(Long paperId);
    ExamDeleteResult deleteExamPapersByUnit(String bookVersion, String grade, String semester, String unitCode, String paperType);
    ExamDeleteResult deleteExamPapersBySemester(String bookVersion, String grade, String semester, String paperType);

    Optional<StudentExamPracticeResultView> getLatestStudentExamPractice(Long paperId, Long userId);
    StudentExamPracticeResultView submitStudentExamPractice(Long paperId, StudentExamPracticeSubmitRequest request);
    List<StudentExamWrongNotebookItemView> getStudentExamWrongNotebook(Long userId);
}
