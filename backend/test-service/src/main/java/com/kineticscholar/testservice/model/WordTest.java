package com.kineticscholar.testservice.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "word_tests")
public class WordTest {
    @Id
    @Column(name = "id", nullable = false, length = 50)
    private String id;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "type", nullable = false, length = 20)
    private String type; // 默写, 听写

    @Column(name = "unit_id", length = 120)
    private String unitId;

    @Column(name = "store_code", nullable = false, length = 64)
    private String storeCode;

    @Column(name = "status", nullable = false, length = 20)
    private String status;

    @Column(name = "content_json", columnDefinition = "TEXT")
    private String contentJson;

    @Column(name = "created_by", nullable = false)
    private Long createdBy;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
