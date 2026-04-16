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
        name = "exam_papers",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_exam_paper_code",
                        columnNames = {"paper_code"}
                ),
                @UniqueConstraint(
                        name = "uk_exam_paper_scope",
                        columnNames = {"paper_type", "book_version", "grade", "semester", "unit_code"}
                )
        },
        indexes = {
                @Index(name = "idx_exam_paper_scope", columnList = "book_version, grade, semester, unit_code"),
                @Index(name = "idx_exam_paper_status", columnList = "status")
        }
)
public class ExamPaper {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "paper_code", nullable = false, length = 64)
    private String paperCode;

    @Column(name = "paper_name", nullable = false, length = 200)
    private String paperName;

    @Column(name = "paper_type", nullable = false, length = 32)
    private String paperType;

    @Column(name = "source_type", nullable = false, length = 32)
    private String sourceType;

    @Column(name = "book_version", nullable = false, length = 100)
    private String bookVersion;

    @Column(name = "grade", nullable = false, length = 50)
    private String grade;

    @Column(name = "semester", nullable = false, length = 50)
    private String semester;

    @Column(name = "unit_code", nullable = false, length = 120)
    private String unitCode;

    @Column(name = "source_file", length = 255)
    private String sourceFile;

    @Column(name = "question_count", nullable = false)
    private Integer questionCount;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

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
        if (questionCount == null) {
            questionCount = 0;
        }
        if (status == null || status.isBlank()) {
            status = "draft";
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
