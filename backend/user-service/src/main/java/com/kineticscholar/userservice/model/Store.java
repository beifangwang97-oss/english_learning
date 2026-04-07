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
@Table(name = "stores")
public class Store {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "store_code", nullable = false, unique = true, length = 64)
    private String storeCode;

    @Column(name = "store_name", nullable = false, length = 128)
    private String storeName;

    @Column(name = "teacher_max", nullable = false)
    private Integer teacherMax = 10;

    @Column(name = "student_max", nullable = false)
    private Integer studentMax = 200;

    // Comma-separated permission values, e.g. "PEP,FLTRP"
    @Column(name = "textbook_permissions", length = 512)
    private String textbookPermissions;

    // Comma-separated permission values, e.g. "G7-T1,G7-T2"
    @Column(name = "grade_permissions", length = 512)
    private String gradePermissions;

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
