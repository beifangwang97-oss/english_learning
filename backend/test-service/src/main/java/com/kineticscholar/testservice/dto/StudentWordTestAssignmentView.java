package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class StudentWordTestAssignmentView {
    private Long assignmentId;
    private String testId;
    private String title;
    private String testType;
    private String status;
    private Integer passScore;
    private Integer attemptCount;
    private Integer score;
    private Integer correctCount;
    private Integer totalCount;
    private Integer duration;
    private LocalDateTime createdAt;
    private LocalDateTime completedAt;
    private List<WordTestContentItem> items;
}
