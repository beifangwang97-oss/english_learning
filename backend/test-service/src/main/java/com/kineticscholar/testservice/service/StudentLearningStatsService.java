package com.kineticscholar.testservice.service;

import com.kineticscholar.testservice.dto.StudentLearningStatsView;
import com.kineticscholar.testservice.model.LearningGroupProgress;
import com.kineticscholar.testservice.model.WordReviewDailySession;

public interface StudentLearningStatsService {
    StudentLearningStatsView getStudentLearningStats(Long userId);
    void recordLearningGroupCompletion(
            LearningGroupProgress savedRow,
            boolean wasCompletedBefore,
            Integer previousLearnedCount,
            Integer previousItemTotal
    );
    void recordWordReviewSessionCompletion(Long userId, WordReviewDailySession session);
}
