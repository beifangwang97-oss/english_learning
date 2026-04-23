package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class StudentTeacherExamSubmitRequest {
    private Long userId;
    private Integer durationSeconds;
    private Object answers;
    private Integer score;
    private Integer correctCount;
    private Integer totalCount;
    private List<StudentTeacherExamResultItemRequest> resultItems = new ArrayList<>();
}
