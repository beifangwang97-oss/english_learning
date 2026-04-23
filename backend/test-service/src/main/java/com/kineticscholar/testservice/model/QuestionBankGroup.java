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
        name = "question_bank_groups",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_question_bank_group_batch_uid", columnNames = {"batch_id", "group_uid"})
        },
        indexes = {
                @Index(name = "idx_question_bank_group_scope", columnList = "book_version, grade, semester, unit_code"),
                @Index(name = "idx_question_bank_group_batch", columnList = "batch_id")
        }
)
public class QuestionBankGroup {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_uid", nullable = false, length = 64)
    private String groupUid;

    @Column(name = "batch_id", nullable = false)
    private Long batchId;

    @Column(name = "shared_stem", columnDefinition = "TEXT")
    private String sharedStem;

    @Column(name = "material", columnDefinition = "TEXT")
    private String material;

    @Column(name = "question_type", length = 32)
    private String questionType;

    @Column(name = "book_version", nullable = false, length = 100)
    private String bookVersion;

    @Column(name = "grade", nullable = false, length = 50)
    private String grade;

    @Column(name = "semester", nullable = false, length = 50)
    private String semester;

    @Column(name = "unit_code", length = 120)
    private String unitCode;

    @Column(name = "exam_scene", length = 64)
    private String examScene;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
        if (status == null || status.isBlank()) status = "active";
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
