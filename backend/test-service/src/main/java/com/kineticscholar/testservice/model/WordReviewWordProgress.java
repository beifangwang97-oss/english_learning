package com.kineticscholar.testservice.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "word_review_word_progress")
public class WordReviewWordProgress {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "assignment_id", nullable = false)
    private Long assignmentId;

    @Column(name = "entry_id", nullable = false, length = 80)
    private String entryId;

    @Column(name = "word", nullable = false, length = 120)
    private String word;

    @Column(name = "phonetic", length = 120)
    private String phonetic;

    @Column(name = "meaning", columnDefinition = "TEXT")
    private String meaning;

    @Column(name = "word_audio", length = 500)
    private String wordAudio;

    @Column(name = "sentence", columnDefinition = "TEXT")
    private String sentence;

    @Column(name = "sentence_cn", columnDefinition = "TEXT")
    private String sentenceCn;

    @Column(name = "sentence_audio", length = 500)
    private String sentenceAudio;

    @Column(name = "review_count", nullable = false)
    private Integer reviewCount;

    @Column(name = "correct_count", nullable = false)
    private Integer correctCount;

    @Column(name = "wrong_count", nullable = false)
    private Integer wrongCount;

    @Column(name = "current_streak", nullable = false)
    private Integer currentStreak;

    @Column(name = "mastered", nullable = false)
    private Boolean mastered;

    @Column(name = "last_reviewed_at")
    private LocalDateTime lastReviewedAt;

    @Column(name = "last_correct_at")
    private LocalDateTime lastCorrectAt;

    @Column(name = "mastered_at")
    private LocalDateTime masteredAt;

    @PrePersist
    protected void onCreate() {
        if (reviewCount == null) reviewCount = 0;
        if (correctCount == null) correctCount = 0;
        if (wrongCount == null) wrongCount = 0;
        if (currentStreak == null) currentStreak = 0;
        if (mastered == null) mastered = false;
    }
}
