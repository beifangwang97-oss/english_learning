package com.kineticscholar.testservice.service.impl;

import com.kineticscholar.testservice.dto.StudentLearningStatsView;
import com.kineticscholar.testservice.model.LearningGroupProgress;
import com.kineticscholar.testservice.model.StudentLearningStats;
import com.kineticscholar.testservice.model.WordReviewAssignment;
import com.kineticscholar.testservice.model.WordReviewDailySession;
import com.kineticscholar.testservice.repository.LearningGroupProgressRepository;
import com.kineticscholar.testservice.repository.StudentLearningStatsRepository;
import com.kineticscholar.testservice.repository.WordReviewAssignmentRepository;
import com.kineticscholar.testservice.repository.WordReviewDailySessionRepository;
import com.kineticscholar.testservice.service.StudentLearningStatsService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

@Service
public class StudentLearningStatsServiceImpl implements StudentLearningStatsService {
    private static final ZoneId STATS_ZONE = ZoneId.of("Asia/Shanghai");

    private final StudentLearningStatsRepository statsRepository;
    private final LearningGroupProgressRepository learningGroupProgressRepository;
    private final WordReviewAssignmentRepository wordReviewAssignmentRepository;
    private final WordReviewDailySessionRepository wordReviewDailySessionRepository;

    public StudentLearningStatsServiceImpl(
            StudentLearningStatsRepository statsRepository,
            LearningGroupProgressRepository learningGroupProgressRepository,
            WordReviewAssignmentRepository wordReviewAssignmentRepository,
            WordReviewDailySessionRepository wordReviewDailySessionRepository
    ) {
        this.statsRepository = statsRepository;
        this.learningGroupProgressRepository = learningGroupProgressRepository;
        this.wordReviewAssignmentRepository = wordReviewAssignmentRepository;
        this.wordReviewDailySessionRepository = wordReviewDailySessionRepository;
    }

    @Override
    @Transactional
    public StudentLearningStatsView getStudentLearningStats(Long userId) {
        if (userId == null) {
            throw new RuntimeException("userId is required");
        }
        StudentLearningStats stats = ensureStats(userId);
        return toView(stats);
    }

    @Override
    @Transactional
    public void recordLearningGroupCompletion(
            LearningGroupProgress savedRow,
            boolean wasCompletedBefore,
            Integer previousLearnedCount,
            Integer previousItemTotal
    ) {
        if (savedRow == null || savedRow.getUserId() == null) {
            return;
        }
        Optional<StudentLearningStats> existingOpt = statsRepository.findByUserId(savedRow.getUserId());
        if (existingOpt.isEmpty()) {
            rebuildStats(savedRow.getUserId());
            return;
        }

        int previousContribution = resolveLearningContribution(
                savedRow.getModule(),
                wasCompletedBefore,
                previousLearnedCount,
                previousItemTotal
        );
        int currentContribution = resolveLearningContribution(
                savedRow.getModule(),
                savedRow.getCompletedAt() != null,
                savedRow.getLearnedCount(),
                savedRow.getItemTotal()
        );
        int delta = Math.max(0, currentContribution - previousContribution);
        if (delta <= 0) {
            ensureToday(existingOpt.get());
            return;
        }

        StudentLearningStats stats = ensureToday(existingOpt.get());
        applyLearningDelta(stats, safe(savedRow.getModule()), delta);
        statsRepository.save(stats);
    }

    @Override
    @Transactional
    public void recordWordReviewSessionCompletion(Long userId, WordReviewDailySession session) {
        if (userId == null || session == null) {
            return;
        }
        Optional<StudentLearningStats> existingOpt = statsRepository.findByUserId(userId);
        if (existingOpt.isEmpty()) {
            rebuildStats(userId);
            return;
        }
        int delta = resolveReviewContribution(session);
        if (delta <= 0) {
            ensureToday(existingOpt.get());
            return;
        }
        StudentLearningStats stats = ensureToday(existingOpt.get());
        stats.setTotalReviewWordsCompleted(safe(stats.getTotalReviewWordsCompleted()) + delta);
        stats.setTodayReviewWordsCompleted(safe(stats.getTodayReviewWordsCompleted()) + delta);
        statsRepository.save(stats);
    }

    private StudentLearningStats ensureStats(Long userId) {
        StudentLearningStats stats = statsRepository.findByUserId(userId)
                .map(this::ensureToday)
                .orElseGet(() -> rebuildStats(userId));
        return ensureToday(stats);
    }

    private StudentLearningStats rebuildStats(Long userId) {
        LocalDate today = LocalDate.now(STATS_ZONE);

        int totalWords = 0;
        int totalPhrases = 0;
        int totalPassages = 0;
        int todayWords = 0;
        int todayPhrases = 0;
        int todayPassages = 0;

        for (LearningGroupProgress row : learningGroupProgressRepository.findByUserIdAndCompletedAtIsNotNull(userId)) {
            int contribution = resolveLearningContribution(row.getModule(), true, row.getLearnedCount(), row.getItemTotal());
            if (contribution <= 0) {
                continue;
            }
            String module = safe(row.getModule());
            if ("vocab".equals(module)) {
                totalWords += contribution;
                if (row.getCompletedAt() != null && row.getCompletedAt().atZone(STATS_ZONE).toLocalDate().equals(today)) {
                    todayWords += contribution;
                }
            } else if ("phrase".equals(module)) {
                totalPhrases += contribution;
                if (row.getCompletedAt() != null && row.getCompletedAt().atZone(STATS_ZONE).toLocalDate().equals(today)) {
                    todayPhrases += contribution;
                }
            } else if ("reading".equals(module)) {
                totalPassages += contribution;
                if (row.getCompletedAt() != null && row.getCompletedAt().atZone(STATS_ZONE).toLocalDate().equals(today)) {
                    todayPassages += contribution;
                }
            }
        }

        int totalReviewWords = 0;
        int todayReviewWords = 0;
        List<Long> assignmentIds = wordReviewAssignmentRepository.findByUserIdOrderByCreatedAtDesc(userId)
                .stream()
                .map(WordReviewAssignment::getId)
                .toList();
        if (!assignmentIds.isEmpty()) {
            for (WordReviewDailySession session : wordReviewDailySessionRepository.findByAssignmentIdIn(assignmentIds)) {
                if (!"done".equalsIgnoreCase(safe(session.getStatus()))) {
                    continue;
                }
                int contribution = resolveReviewContribution(session);
                if (contribution <= 0) {
                    continue;
                }
                totalReviewWords += contribution;
                if (today.equals(session.getReviewDate())) {
                    todayReviewWords += contribution;
                }
            }
        }

        StudentLearningStats stats = statsRepository.findByUserId(userId).orElseGet(StudentLearningStats::new);
        stats.setUserId(userId);
        stats.setStatsDate(today);
        stats.setTotalWordsCompleted(totalWords);
        stats.setTodayWordsCompleted(todayWords);
        stats.setTotalPhrasesCompleted(totalPhrases);
        stats.setTodayPhrasesCompleted(todayPhrases);
        stats.setTotalPassagesCompleted(totalPassages);
        stats.setTodayPassagesCompleted(todayPassages);
        stats.setTotalReviewWordsCompleted(totalReviewWords);
        stats.setTodayReviewWordsCompleted(todayReviewWords);
        return statsRepository.save(stats);
    }

    private StudentLearningStats ensureToday(StudentLearningStats stats) {
        LocalDate today = LocalDate.now(STATS_ZONE);
        if (stats == null) {
            return null;
        }
        if (today.equals(stats.getStatsDate())) {
            return stats;
        }
        stats.setStatsDate(today);
        stats.setTodayWordsCompleted(0);
        stats.setTodayPhrasesCompleted(0);
        stats.setTodayPassagesCompleted(0);
        stats.setTodayReviewWordsCompleted(0);
        return statsRepository.save(stats);
    }

    private void applyLearningDelta(StudentLearningStats stats, String module, int delta) {
        if ("vocab".equals(module)) {
            stats.setTotalWordsCompleted(safe(stats.getTotalWordsCompleted()) + delta);
            stats.setTodayWordsCompleted(safe(stats.getTodayWordsCompleted()) + delta);
            return;
        }
        if ("phrase".equals(module)) {
            stats.setTotalPhrasesCompleted(safe(stats.getTotalPhrasesCompleted()) + delta);
            stats.setTodayPhrasesCompleted(safe(stats.getTodayPhrasesCompleted()) + delta);
            return;
        }
        if ("reading".equals(module)) {
            stats.setTotalPassagesCompleted(safe(stats.getTotalPassagesCompleted()) + delta);
            stats.setTodayPassagesCompleted(safe(stats.getTodayPassagesCompleted()) + delta);
        }
    }

    private int resolveLearningContribution(String module, boolean completed, Integer learnedCount, Integer itemTotal) {
        if (!completed) {
            return 0;
        }
        String normalized = safe(module);
        if ("reading".equals(normalized)) {
            return 1;
        }
        if ("vocab".equals(normalized) || "phrase".equals(normalized)) {
            if (learnedCount != null && learnedCount >= 0) {
                return learnedCount;
            }
            if (itemTotal != null && itemTotal >= 0) {
                return itemTotal;
            }
        }
        return 0;
    }

    private int resolveReviewContribution(WordReviewDailySession session) {
        if (session == null || !"done".equalsIgnoreCase(safe(session.getStatus()))) {
            return 0;
        }
        int finished = safe(session.getFinishedCount());
        if (finished > 0) {
            return finished;
        }
        return safe(session.getSelectedCount());
    }

    private StudentLearningStatsView toView(StudentLearningStats stats) {
        StudentLearningStatsView view = new StudentLearningStatsView();
        view.setUserId(stats.getUserId());
        view.setStatsDate(stats.getStatsDate() == null ? null : stats.getStatsDate().toString());
        view.setTotalWordsCompleted(safe(stats.getTotalWordsCompleted()));
        view.setTodayWordsCompleted(safe(stats.getTodayWordsCompleted()));
        view.setTotalPhrasesCompleted(safe(stats.getTotalPhrasesCompleted()));
        view.setTodayPhrasesCompleted(safe(stats.getTodayPhrasesCompleted()));
        view.setTotalPassagesCompleted(safe(stats.getTotalPassagesCompleted()));
        view.setTodayPassagesCompleted(safe(stats.getTodayPassagesCompleted()));
        view.setTotalReviewWordsCompleted(safe(stats.getTotalReviewWordsCompleted()));
        view.setTodayReviewWordsCompleted(safe(stats.getTodayReviewWordsCompleted()));
        return view;
    }

    private int safe(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }

    private String safe(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }
}
