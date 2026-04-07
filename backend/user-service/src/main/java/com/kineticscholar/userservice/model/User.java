package com.kineticscholar.userservice.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "users")
public class User {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 50)
    private String username;

    @Column(nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "login_password", length = 100)
    private String loginPassword;

    @Column(nullable = false, length = 20)
    private String role; // student, teacher, admin

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 255)
    private String avatar;

    @Column(length = 20)
    private String phone;

    @Column(name = "textbook_version", length = 100)
    private String textbookVersion;

    @Column(length = 50)
    private String grade;

    @Column(name = "store_name", length = 100)
    private String storeName;

    @Column(name = "expire_date")
    private LocalDate expireDate;

    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    @Column(name = "online_status", nullable = false)
    private Integer onlineStatus = 0;

    @Column(name = "last_active_at")
    private LocalDateTime lastActiveAt;

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
