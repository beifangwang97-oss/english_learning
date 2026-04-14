package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class StudentWordReviewAssignmentView {
    private Long assignmentId;
    private String taskId;
    private String title;
    private String status;
    private Integer dailyQuota;
    private Boolean enableSpelling;
    private Boolean enableZhToEn;
    private Integer totalWordCount;
    private Integer masteredWordCount;
    private LocalDate lastReviewDate;
    private Boolean todayDone;
    private LocalDateTime createdAt;
    private LocalDateTime completedAt;
}
