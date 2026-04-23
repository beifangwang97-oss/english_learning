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
        name = "student_teacher_exam_submissions",
        indexes = {
                @Index(name = "idx_student_teacher_exam_assignment", columnList = "assignment_id, user_id"),
                @Index(name = "idx_student_teacher_exam_paper", columnList = "paper_id, user_id"),
                @Index(name = "idx_student_teacher_exam_scope", columnList = "book_version, grade, semester, unit_code")
        }
)
public class StudentTeacherExamSubmission {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "assignment_id", nullable = false)
    private Long assignmentId;

    @Column(name = "paper_id", nullable = false)
    private Long paperId;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "paper_title", nullable = false, length = 255)
    private String paperTitle;

    @Column(name = "book_version", length = 100)
    private String bookVersion;

    @Column(name = "grade", length = 50)
    private String grade;

    @Column(name = "semester", length = 50)
    private String semester;

    @Column(name = "unit_code", length = 120)
    private String unitCode;

    @Column(name = "score", nullable = false)
    private Integer score;

    @Column(name = "correct_count", nullable = false)
    private Integer correctCount;

    @Column(name = "total_count", nullable = false)
    private Integer totalCount;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "answers_json", nullable = false, columnDefinition = "TEXT")
    private String answersJson;

    @Column(name = "result_json", nullable = false, columnDefinition = "TEXT")
    private String resultJson;

    @Column(name = "submitted_at", nullable = false)
    private LocalDateTime submittedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (submittedAt == null) submittedAt = now;
        createdAt = now;
        updatedAt = now;
        if (score == null) score = 0;
        if (correctCount == null) correctCount = 0;
        if (totalCount == null) totalCount = 0;
        if (answersJson == null) answersJson = "{}";
        if (resultJson == null) resultJson = "[]";
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
