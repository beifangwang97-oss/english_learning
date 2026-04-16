package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class StudentExamPracticeAnswerRequest {
    private Long questionId;
    private String answerText;
}
