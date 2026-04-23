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
        name = "teacher_exam_papers",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_teacher_exam_paper_code", columnNames = {"paper_code"})
        },
        indexes = {
                @Index(name = "idx_teacher_exam_paper_creator_store", columnList = "created_by, store_code"),
                @Index(name = "idx_teacher_exam_paper_scope", columnList = "book_version, grade, semester, unit_code"),
                @Index(name = "idx_teacher_exam_paper_status", columnList = "status")
        }
)
public class TeacherExamPaper {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "paper_code", nullable = false, length = 64)
    private String paperCode;

    @Column(name = "title", nullable = false, length = 255)
    private String title;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "store_code", length = 64)
    private String storeCode;

    @Column(name = "book_version", length = 100)
    private String bookVersion;

    @Column(name = "grade", length = 50)
    private String grade;

    @Column(name = "semester", length = 50)
    private String semester;

    @Column(name = "unit_code", length = 120)
    private String unitCode;

    @Column(name = "difficulty", length = 20)
    private String difficulty;

    @Column(name = "knowledge_tags_json", columnDefinition = "TEXT")
    private String knowledgeTagsJson;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "total_section_count", nullable = false)
    private Integer totalSectionCount;

    @Column(name = "total_question_count", nullable = false)
    private Integer totalQuestionCount;

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
        if (totalSectionCount == null) totalSectionCount = 0;
        if (totalQuestionCount == null) totalQuestionCount = 0;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
