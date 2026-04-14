package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class WordReviewDailySessionView {
    private Long sessionId;
    private Long assignmentId;
    private String taskTitle;
    private Integer dailyQuota;
    private Boolean enableSpelling;
    private Boolean enableZhToEn;
    private Integer totalWordCount;
    private Integer masteredWordCount;
    private String status;
    private List<WordReviewSessionItem> items;
}
