package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class StudentTeacherExamAssignmentView {
    private Long assignmentId;
    private Long userId;
    private String textbookVersion;
    private String grade;
    private String semester;
    private String unitName;
    private Long paperId;
    private String paperTitle;
    private TeacherExamPaperDetailView paper;
    private StudentTeacherExamSubmissionResultView latestSubmission;
}
