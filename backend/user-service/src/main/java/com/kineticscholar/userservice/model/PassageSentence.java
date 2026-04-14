package com.kineticscholar.userservice.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
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
        name = "passage_sentences",
        uniqueConstraints = @UniqueConstraint(name = "uk_passage_sentence_no", columnNames = {"passage_id", "sentence_no"})
)
public class PassageSentence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "passage_id", nullable = false)
    private Passage passage;

    @Column(name = "sentence_no", nullable = false)
    private Integer sentenceNo;

    @Column(name = "sentence_en", nullable = false, columnDefinition = "text")
    private String sentenceEn;

    @Column(name = "sentence_zh", nullable = false, columnDefinition = "text")
    private String sentenceZh;

    @Column(name = "sentence_audio", length = 500)
    private String sentenceAudio;

    @Column(name = "paragraph_no")
    private Integer paragraphNo;

    @Column(name = "sentence_no_in_paragraph")
    private Integer sentenceNoInParagraph;

    @Column(name = "newline_after", nullable = false)
    private Integer newlineAfter = 0;

    @Column(name = "is_paragraph_end", nullable = false)
    private Boolean paragraphEnd = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @jakarta.persistence.PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
    }
}
