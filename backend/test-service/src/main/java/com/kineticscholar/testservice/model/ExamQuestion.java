package com.kineticscholar.testservice.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(
        name = "exam_questions",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_exam_question_uid",
                        columnNames = {"question_uid"}
                ),
                @UniqueConstraint(
                        name = "uk_exam_question_paper_no",
                        columnNames = {"paper_id", "question_no"}
                )
        },
        indexes = {
                @Index(name = "idx_exam_question_paper", columnList = "paper_id"),
                @Index(name = "idx_exam_question_material", columnList = "material_id"),
                @Index(name = "idx_exam_question_type", columnList = "question_type"),
                @Index(name = "idx_exam_question_status", columnList = "status")
        }
)
public class ExamQuestion {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "question_uid", nullable = false, length = 32)
    private String questionUid;

    @Column(name = "paper_id", nullable = false)
    private Long paperId;

    @Column(name = "material_id")
    private Long materialId;

    @Column(name = "question_no", nullable = false)
    private Integer questionNo;

    @Column(name = "question_type", nullable = false, length = 32)
    private String questionType;

    @Column(name = "stem", nullable = false, columnDefinition = "TEXT")
    private String stem;

    @Column(name = "answer_text", columnDefinition = "TEXT")
    private String answerText;

    @Column(name = "analysis", columnDefinition = "TEXT")
    private String analysis;

    @Column(name = "score", nullable = false, precision = 6, scale = 2)
    private BigDecimal score;

    @Column(name = "difficulty", length = 20)
    private String difficulty;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
        if (score == null) {
            score = BigDecimal.ONE;
        }
        if (sortOrder == null) {
            sortOrder = 0;
        }
        if (status == null || status.isBlank()) {
            status = "active";
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
