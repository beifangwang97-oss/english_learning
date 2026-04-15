package com.kineticscholar.userservice.model;

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
        name = "textbook_units",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_textbook_unit_scope",
                columnNames = {"book_version", "grade", "semester", "unit_code"}
        ),
        indexes = {
                @Index(name = "idx_textbook_unit_scope", columnList = "book_version,grade,semester,sort_order"),
                @Index(name = "idx_textbook_unit_scope_code", columnList = "book_version,grade,semester,unit_code")
        }
)
public class TextbookUnit {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "book_version", nullable = false, length = 100)
    private String bookVersion;

    @Column(nullable = false, length = 50)
    private String grade;

    @Column(nullable = false, length = 20)
    private String semester;

    @Column(name = "unit_code", nullable = false, length = 120)
    private String unitCode;

    @Column(name = "unit_title", length = 255)
    private String unitTitle;

    @Column(name = "unit_desc_short", length = 1000)
    private String unitDescShort;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(name = "source_file", length = 255)
    private String sourceFile;

    @Column(name = "source_pages", length = 255)
    private String sourcePages;

    @Column(nullable = false)
    private Boolean active = true;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
        if (sortOrder == null) sortOrder = 0;
        if (active == null) active = true;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
        if (sortOrder == null) sortOrder = 0;
        if (active == null) active = true;
    }
}
