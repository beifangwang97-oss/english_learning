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
        name = "exam_materials",
        uniqueConstraints = {
                @UniqueConstraint(
                        name = "uk_exam_material_uid",
                        columnNames = {"material_uid"}
                ),
                @UniqueConstraint(
                        name = "uk_exam_material_paper_type_label",
                        columnNames = {"paper_id", "question_type", "material_label"}
                )
        },
        indexes = {
                @Index(name = "idx_exam_material_paper", columnList = "paper_id"),
                @Index(name = "idx_exam_material_paper_label", columnList = "paper_id, material_label")
        }
)
public class ExamMaterial {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "material_uid", nullable = false, length = 32)
    private String materialUid;

    @Column(name = "paper_id", nullable = false)
    private Long paperId;

    @Column(name = "material_label", nullable = false, length = 20)
    private String materialLabel;

    @Column(name = "question_type", nullable = false, length = 32)
    private String questionType;

    @Column(name = "title", length = 200)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "analysis", columnDefinition = "TEXT")
    private String analysis;

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
        if (sortOrder == null) {
            sortOrder = 0;
        }
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
