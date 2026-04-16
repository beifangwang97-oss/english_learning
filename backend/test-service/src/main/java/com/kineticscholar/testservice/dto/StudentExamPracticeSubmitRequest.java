package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class StudentExamPracticeSubmitRequest {
    private Long userId;
    private Integer durationSeconds;
    private List<StudentExamPracticeAnswerRequest> answers;
}
