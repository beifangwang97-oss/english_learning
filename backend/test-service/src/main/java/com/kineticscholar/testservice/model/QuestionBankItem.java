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
        name = "question_bank_items",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_question_bank_item_uid", columnNames = {"question_uid"})
        },
        indexes = {
                @Index(name = "idx_question_bank_item_scope", columnList = "book_version, grade, semester, unit_code"),
                @Index(name = "idx_question_bank_item_type", columnList = "question_type"),
                @Index(name = "idx_question_bank_item_status", columnList = "status"),
                @Index(name = "idx_question_bank_item_group", columnList = "group_id"),
                @Index(name = "idx_question_bank_item_batch", columnList = "batch_id")
        }
)
public class QuestionBankItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "question_uid", nullable = false, length = 64)
    private String questionUid;

    @Column(name = "batch_id", nullable = false)
    private Long batchId;

    @Column(name = "group_id")
    private Long groupId;

    @Column(name = "question_type", nullable = false, length = 32)
    private String questionType;

    @Column(name = "question_no")
    private Integer questionNo;

    @Column(name = "stem", columnDefinition = "TEXT")
    private String stem;

    @Column(name = "answer_json", nullable = false, columnDefinition = "TEXT")
    private String answerJson;

    @Column(name = "analysis", columnDefinition = "TEXT")
    private String analysis;

    @Column(name = "difficulty", length = 20)
    private String difficulty;

    @Column(name = "knowledge_tags_json", columnDefinition = "TEXT")
    private String knowledgeTagsJson;

    @Column(name = "source_type", nullable = false, length = 32)
    private String sourceType;

    @Column(name = "source_file", length = 255)
    private String sourceFile;

    @Column(name = "parser_version", length = 64)
    private String parserVersion;

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

    @Column(name = "remarks", columnDefinition = "TEXT")
    private String remarks;

    @Column(name = "content_hash", length = 64)
    private String contentHash;

    @Column(name = "created_by")
    private Long createdBy;

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
