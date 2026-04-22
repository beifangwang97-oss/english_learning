package com.kineticscholar.userservice.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(
        name = "lexicon_entries",
        indexes = {
                @Index(name = "idx_lexicon_query_core", columnList = "type,book_version,grade,semester,unit_name,group_no"),
                @Index(name = "idx_lexicon_query_unit", columnList = "book_version,grade,semester,unit_name")
        }
)
public class LexiconEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "entry_uid", nullable = false, length = 64)
    private String entryUid;

    @Column(nullable = false, length = 20)
    private String type;

    @Column(nullable = false, length = 255)
    private String word;

    @Column(length = 255)
    private String phonetic;

    @Column(name = "unit_name", nullable = false, length = 50)
    private String unit;

    @Column(name = "book_version", nullable = false, length = 100)
    private String bookVersion;

    @Column(nullable = false, length = 50)
    private String grade;

    @Column(nullable = false, length = 50)
    private String semester;

    @Column(name = "source_tag", length = 40)
    private String sourceTag;

    @Column(name = "word_audio", length = 255)
    private String wordAudio;

    @Column(name = "phrase_audio", length = 255)
    private String phraseAudio;

    @Column(name = "syllable_text", length = 255)
    private String syllableText;

    @Column(name = "syllable_pronunciation", columnDefinition = "TEXT")
    private String syllablePronunciation;

    @Column(name = "memory_tip", columnDefinition = "TEXT")
    private String memoryTip;

    @Column(name = "proper_noun_type", length = 100)
    private String properNounType;

    @Column(name = "group_no")
    private Integer groupNo;

    @OneToMany(mappedBy = "entry", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sortOrder ASC, id ASC")
    private List<LexiconMeaning> meanings = new ArrayList<>();

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
