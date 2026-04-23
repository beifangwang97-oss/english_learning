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
        name = "question_bank_import_batches",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_question_bank_import_batch_code", columnNames = {"batch_code"})
        },
        indexes = {
                @Index(name = "idx_question_bank_import_scope", columnList = "book_version, grade, semester, unit_code"),
                @Index(name = "idx_question_bank_import_status", columnList = "import_status")
        }
)
public class QuestionBankImportBatch {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "batch_code", nullable = false, length = 64)
    private String batchCode;

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

    @Column(name = "import_status", nullable = false, length = 20)
    private String importStatus;

    @Column(name = "overwrite_mode", nullable = false, length = 20)
    private String overwriteMode;

    @Column(name = "total_count", nullable = false)
    private Integer totalCount;

    @Column(name = "success_count", nullable = false)
    private Integer successCount;

    @Column(name = "failed_count", nullable = false)
    private Integer failedCount;

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
        if (totalCount == null) totalCount = 0;
        if (successCount == null) successCount = 0;
        if (failedCount == null) failedCount = 0;
        if (importStatus == null || importStatus.isBlank()) importStatus = "processing";
        if (overwriteMode == null || overwriteMode.isBlank()) overwriteMode = "overwrite_existing";
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
