package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
public class StudentTeacherExamSubmissionResultView {
    private Long submissionId;
    private Long assignmentId;
    private Long paperId;
    private Long userId;
    private String paperTitle;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private Integer score;
    private Integer correctCount;
    private Integer totalCount;
    private Integer durationSeconds;
    private Object answers;
    private LocalDateTime submittedAt;
    private List<StudentTeacherExamResultItemView> resultItems = new ArrayList<>();
}
