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
        name = "student_teacher_exam_wrong_notebook_items",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_student_teacher_exam_wrong_user_question", columnNames = {"user_id", "question_uid"})
        },
        indexes = {
                @Index(name = "idx_student_teacher_exam_wrong_user", columnList = "user_id"),
                @Index(name = "idx_student_teacher_exam_wrong_source", columnList = "user_id, source_file"),
                @Index(name = "idx_student_teacher_exam_wrong_scope", columnList = "book_version, grade, semester, unit_code")
        }
)
public class StudentTeacherExamWrongNotebookItem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "assignment_id", nullable = false)
    private Long assignmentId;

    @Column(name = "paper_id", nullable = false)
    private Long paperId;

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

    @Column(name = "section_id")
    private Long sectionId;

    @Column(name = "section_title", length = 255)
    private String sectionTitle;

    @Column(name = "section_question_type", length = 64)
    private String sectionQuestionType;

    @Column(name = "section_item_id")
    private Long sectionItemId;

    @Column(name = "question_id")
    private Long questionId;

    @Column(name = "question_uid", nullable = false, length = 64)
    private String questionUid;

    @Column(name = "question_no")
    private Integer questionNo;

    @Column(name = "question_type", length = 64)
    private String questionType;

    @Column(name = "source_file", length = 255)
    private String sourceFile;

    @Column(name = "source_label", length = 255)
    private String sourceLabel;

    @Column(name = "shared_stem", columnDefinition = "TEXT")
    private String sharedStem;

    @Column(name = "material", columnDefinition = "TEXT")
    private String material;

    @Column(name = "stem", columnDefinition = "TEXT")
    private String stem;

    @Column(name = "options_json", columnDefinition = "TEXT")
    private String optionsJson;

    @Column(name = "submitted_answer_json", columnDefinition = "TEXT")
    private String submittedAnswerJson;

    @Column(name = "correct_answer_json", columnDefinition = "TEXT")
    private String correctAnswerJson;

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
        if (lastWrongAt == null) lastWrongAt = now;
        createdAt = now;
        updatedAt = now;
        if (wrongCount == null) wrongCount = 1;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
