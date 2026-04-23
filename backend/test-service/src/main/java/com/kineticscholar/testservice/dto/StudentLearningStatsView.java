package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class StudentLearningStatsView {
    private Long userId;
    private String statsDate;
    private Integer totalWordsCompleted;
    private Integer todayWordsCompleted;
    private Integer totalPhrasesCompleted;
    private Integer todayPhrasesCompleted;
    private Integer totalPassagesCompleted;
    private Integer todayPassagesCompleted;
    private Integer totalReviewWordsCompleted;
    private Integer todayReviewWordsCompleted;
}
