package com.kineticscholar.testservice.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(
        name = "student_learning_stats",
        uniqueConstraints = @UniqueConstraint(name = "uk_student_learning_stats_user", columnNames = {"user_id"})
)
public class StudentLearningStats {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "stats_date", nullable = false)
    private LocalDate statsDate;

    @Column(name = "total_words_completed", nullable = false)
    private Integer totalWordsCompleted;

    @Column(name = "today_words_completed", nullable = false)
    private Integer todayWordsCompleted;

    @Column(name = "total_phrases_completed", nullable = false)
    private Integer totalPhrasesCompleted;

    @Column(name = "today_phrases_completed", nullable = false)
    private Integer todayPhrasesCompleted;

    @Column(name = "total_passages_completed", nullable = false)
    private Integer totalPassagesCompleted;

    @Column(name = "today_passages_completed", nullable = false)
    private Integer todayPassagesCompleted;

    @Column(name = "total_review_words_completed", nullable = false)
    private Integer totalReviewWordsCompleted;

    @Column(name = "today_review_words_completed", nullable = false)
    private Integer todayReviewWordsCompleted;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (createdAt == null) {
            createdAt = now;
        }
        updatedAt = now;
        if (statsDate == null) {
            statsDate = LocalDate.now();
        }
        totalWordsCompleted = safeInt(totalWordsCompleted);
        todayWordsCompleted = safeInt(todayWordsCompleted);
        totalPhrasesCompleted = safeInt(totalPhrasesCompleted);
        todayPhrasesCompleted = safeInt(todayPhrasesCompleted);
        totalPassagesCompleted = safeInt(totalPassagesCompleted);
        todayPassagesCompleted = safeInt(todayPassagesCompleted);
        totalReviewWordsCompleted = safeInt(totalReviewWordsCompleted);
        todayReviewWordsCompleted = safeInt(todayReviewWordsCompleted);
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
        totalWordsCompleted = safeInt(totalWordsCompleted);
        todayWordsCompleted = safeInt(todayWordsCompleted);
        totalPhrasesCompleted = safeInt(totalPhrasesCompleted);
        todayPhrasesCompleted = safeInt(todayPhrasesCompleted);
        totalPassagesCompleted = safeInt(totalPassagesCompleted);
        todayPassagesCompleted = safeInt(todayPassagesCompleted);
        totalReviewWordsCompleted = safeInt(totalReviewWordsCompleted);
        todayReviewWordsCompleted = safeInt(todayReviewWordsCompleted);
    }

    private int safeInt(Integer value) {
        return value == null ? 0 : Math.max(0, value);
    }
}
