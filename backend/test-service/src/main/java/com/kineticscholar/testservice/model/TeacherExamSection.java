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
        name = "teacher_exam_sections",
        indexes = {
                @Index(name = "idx_teacher_exam_section_paper", columnList = "paper_id"),
                @Index(name = "idx_teacher_exam_section_order", columnList = "paper_id, section_no")
        }
)
public class TeacherExamSection {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "paper_id", nullable = false)
    private Long paperId;

    @Column(name = "section_no", nullable = false)
    private Integer sectionNo;

    @Column(name = "section_title", nullable = false, length = 255)
    private String sectionTitle;

    @Column(name = "question_type", nullable = false, length = 64)
    private String questionType;

    @Column(name = "requested_count", nullable = false)
    private Integer requestedCount;

    @Column(name = "actual_count", nullable = false)
    private Integer actualCount;

    @Column(name = "item_type", nullable = false, length = 20)
    private String itemType;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
        if (actualCount == null) actualCount = 0;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
