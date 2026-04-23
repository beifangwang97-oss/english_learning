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
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(
        name = "teacher_exam_section_items",
        indexes = {
                @Index(name = "idx_teacher_exam_item_paper", columnList = "paper_id"),
                @Index(name = "idx_teacher_exam_item_section", columnList = "section_id"),
                @Index(name = "idx_teacher_exam_item_source", columnList = "question_id, group_id")
        }
)
public class TeacherExamSectionItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "paper_id", nullable = false)
    private Long paperId;

    @Column(name = "section_id", nullable = false)
    private Long sectionId;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @Column(name = "item_type", nullable = false, length = 20)
    private String itemType;

    @Column(name = "question_id")
    private Long questionId;

    @Column(name = "group_id")
    private Long groupId;

    @Column(name = "snapshot_json", nullable = false, columnDefinition = "TEXT")
    private String snapshotJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
