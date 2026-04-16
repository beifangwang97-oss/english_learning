package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class StudentExamPracticeResultView {
    private Long practiceId;
    private Long userId;
    private Long paperId;
    private String paperName;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private Integer score;
    private Integer correctCount;
    private Integer totalCount;
    private Integer durationSeconds;
    private LocalDateTime submittedAt;
    private List<StudentExamPracticeQuestionResultView> answers;
}
