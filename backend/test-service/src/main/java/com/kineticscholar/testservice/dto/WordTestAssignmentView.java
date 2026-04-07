package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class WordTestAssignmentView {
    private Long assignmentId;
    private String testId;
    private Long userId;
    private String title;
    private String testType;
    private String status;
    private Integer score;
    private Integer correctCount;
    private Integer totalCount;
    private Integer duration;
    private String storeCode;
    private LocalDateTime createdAt;
}
