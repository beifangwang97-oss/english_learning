package com.kineticscholar.userservice.model;

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
        name = "textbook_scope_tags",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_textbook_scope",
                columnNames = {"textbook_version", "grade", "semester"}
        )
)
public class TextbookScopeTag {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "textbook_version", nullable = false, length = 100)
    private String textbookVersion;

    @Column(name = "grade", nullable = false, length = 50)
    private String grade;

    @Column(name = "semester", nullable = false, length = 20)
    private String semester;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}

