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
        name = "phonetic_symbols",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_phonetic_symbol_uid", columnNames = {"phoneme_uid"}),
                @UniqueConstraint(name = "uk_phonetic_symbol_value", columnNames = {"phonetic"})
        },
        indexes = {
                @Index(name = "idx_phonetic_symbol_category", columnList = "category,phoneme_uid"),
                @Index(name = "idx_phonetic_symbol_uid", columnList = "phoneme_uid")
        }
)
public class PhoneticSymbol {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "phoneme_uid", nullable = false, length = 64)
    private String phonemeUid;

    @Column(nullable = false, length = 20)
    private String type = "phoneme";

    @Column(nullable = false, length = 64)
    private String phonetic;

    @Column(nullable = false, length = 20)
    private String category;

    @Column(name = "phoneme_audio", length = 255)
    private String phonemeAudio;

    @Column(name = "example_words_json", columnDefinition = "text")
    private String exampleWordsJson;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now();
        createdAt = now;
        updatedAt = now;
        if (type == null || type.isBlank()) type = "phoneme";
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
        if (type == null || type.isBlank()) type = "phoneme";
    }
}
