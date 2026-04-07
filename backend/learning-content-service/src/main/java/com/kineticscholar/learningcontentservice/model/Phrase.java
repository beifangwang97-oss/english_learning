package com.kineticscholar.learningcontentservice.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import jakarta.persistence.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "phrases")
public class Phrase {
    @Id
    @Column(name = "id", nullable = false, length = 50)
    private String id;

    @Column(name = "unit_id", nullable = false, length = 50)
    private String unitId;

    @Column(name = "group_id", nullable = false)
    private Integer groupId;

    @Column(name = "en", nullable = false, length = 200)
    private String en;

    @Column(name = "cn", nullable = false, length = 200)
    private String cn;

    @Column(name = "sentence", columnDefinition = "TEXT")
    private String sentence;

    @Column(name = "sentence_cn", columnDefinition = "TEXT")
    private String sentenceCn;

    @Column(name = "audio_url", length = 255)
    private String audioUrl;
}
