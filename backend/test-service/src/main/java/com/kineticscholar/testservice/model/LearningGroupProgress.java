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
        name = "learning_group_progress",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_learning_group_user_unit_module_group",
                columnNames = {"user_id", "unit_id", "module", "group_no"}
        )
)
public class LearningGroupProgress {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "unit_id", nullable = false, length = 300)
    private String unitId;

    @Column(name = "module", nullable = false, length = 20)
    private String module;

    @Column(name = "group_no", nullable = false)
    private Integer groupNo;

    @Column(name = "started_at", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "completed_at")
    private LocalDateTime completedAt;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "item_total")
    private Integer itemTotal;

    @Column(name = "learned_count")
    private Integer learnedCount;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        if (startedAt == null) startedAt = now;
        updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}

