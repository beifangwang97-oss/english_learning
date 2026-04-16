package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class StudentExamPracticeQuestionResultView {
    private Long questionId;
    private Integer questionNo;
    private String submittedAnswer;
    private String correctAnswer;
    private Boolean correct;
}
