package com.kineticscholar.userservice.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "lexicon_meanings")
public class LexiconMeaning {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "entry_id", nullable = false)
    private LexiconEntry entry;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder = 0;

    @Column(length = 30)
    private String pos;

    @Column(length = 1000)
    private String meaning;

    @Column(length = 2000)
    private String example;

    @Column(name = "example_zh", length = 2000)
    private String exampleZh;

    @Column(name = "example_audio", length = 255)
    private String exampleAudio;
}

