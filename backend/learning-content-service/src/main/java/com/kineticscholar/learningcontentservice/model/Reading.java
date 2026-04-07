package com.kineticscholar.learningcontentservice.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import jakarta.persistence.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "readings")
public class Reading {
    @Id
    @Column(name = "id", nullable = false, length = 50)
    private String id;

    @Column(name = "unit_id", nullable = false, length = 50)
    private String unitId;

    @Column(name = "title", nullable = false, length = 200)
    private String title;

    @Column(name = "content", nullable = false, columnDefinition = "TEXT")
    private String content;

    @Column(name = "translation", columnDefinition = "TEXT")
    private String translation;

    @Column(name = "audio_url", length = 255)
    private String audioUrl;
}
