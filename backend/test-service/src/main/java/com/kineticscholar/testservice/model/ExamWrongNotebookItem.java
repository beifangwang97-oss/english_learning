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

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(
        name = "exam_wrong_notebook_items",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_exam_wrong_user_question", columnNames = {"user_id", "question_uid"})
        },
        indexes = {
                @Index(name = "idx_exam_wrong_user", columnList = "user_id"),
                @Index(name = "idx_exam_wrong_scope", columnList = "book_version, grade, semester, unit_code")
        }
)
public class ExamWrongNotebookItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "paper_id", nullable = false)
    private Long paperId;

    @Column(name = "paper_name", nullable = false, length = 200)
    private String paperName;

    @Column(name = "book_version", nullable = false, length = 100)
    private String bookVersion;

    @Column(name = "grade", nullable = false, length = 50)
    private String grade;

    @Column(name = "semester", nullable = false, length = 50)
    private String semester;

    @Column(name = "unit_code", nullable = false, length = 120)
    private String unitCode;

    @Column(name = "question_id", nullable = false)
    private Long questionId;

    @Column(name = "question_uid", nullable = false, length = 32)
    private String questionUid;

    @Column(name = "question_no", nullable = false)
    private Integer questionNo;

    @Column(name = "question_type", nullable = false, length = 32)
    private String questionType;

    @Column(name = "material_label", length = 20)
    private String materialLabel;

    @Column(name = "material_title", length = 200)
    private String materialTitle;

    @Column(name = "material_content", columnDefinition = "TEXT")
    private String materialContent;

    @Column(name = "material_analysis", columnDefinition = "TEXT")
    private String materialAnalysis;

    @Column(name = "stem", nullable = false, columnDefinition = "TEXT")
    private String stem;

    @Column(name = "options_json", columnDefinition = "TEXT")
    private String optionsJson;

    @Column(name = "submitted_answer", columnDefinition = "TEXT")
    private String submittedAnswer;

    @Column(name = "correct_answer", columnDefinition = "TEXT")
    private String correctAnswer;

    @Column(name = "analysis", columnDefinition = "TEXT")
    private String analysis;

    @Column(name = "wrong_count", nullable = false)
    private Integer wrongCount;

    @Column(name = "last_wrong_at", nullable = false)
    private LocalDateTime lastWrongAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (lastWrongAt == null) {
            lastWrongAt = now;
        }
        createdAt = now;
        updatedAt = now;
        if (wrongCount == null) {
            wrongCount = 1;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
