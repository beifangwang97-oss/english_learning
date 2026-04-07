package com.kineticscholar.learningcontentservice.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "units")
public class Unit {
    @Id
    @Column(name = "id", nullable = false, length = 50)
    private String id;

    @Column(name = "title", nullable = false, length = 100)
    private String title;

    @Column(name = "subtitle", length = 200)
    private String subtitle;

    @Column(name = "desc", columnDefinition = "TEXT")
    private String desc;

    @Column(name = "is_special", nullable = false)
    private boolean isSpecial = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
