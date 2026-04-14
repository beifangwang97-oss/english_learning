package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class WordReviewAssignmentView {
    private Long assignmentId;
    private String taskId;
    private Long userId;
    private String title;
    private String status;
    private Integer dailyQuota;
    private Boolean enableSpelling;
    private Boolean enableZhToEn;
    private Integer totalWordCount;
    private Integer masteredWordCount;
    private LocalDate lastReviewDate;
    private String storeCode;
    private LocalDateTime createdAt;
}
