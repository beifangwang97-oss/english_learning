package com.kineticscholar.testservice.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(
        name = "unit_assignments",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_unit_assignment_user_unit",
                columnNames = {"user_id", "textbook_version", "grade", "semester", "unit_name"}
        )
)
public class UnitAssignment {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "assigned_by", nullable = false)
    private Long assignedBy;

    @Column(name = "textbook_version", nullable = false, length = 100)
    private String textbookVersion;

    @Column(name = "grade", nullable = false, length = 50)
    private String grade;

    @Column(name = "semester", nullable = false, length = 50)
    private String semester;

    @Column(name = "unit_name", nullable = false, length = 120)
    private String unitName;

    @Column(name = "status", nullable = false, length = 20)
    private String status = "assigned";

    @Column(name = "paper_id")
    private Long paperId;

    @Column(name = "paper_title", length = 255)
    private String paperTitle;

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
