package com.kineticscholar.learningcontentservice.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import jakarta.persistence.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "quizzes")
public class Quiz {
    @Id
    @Column(name = "id", nullable = false, length = 50)
    private String id;

    @Column(name = "unit_id", nullable = false, length = 50)
    private String unitId;

    @Column(name = "question", nullable = false, columnDefinition = "TEXT")
    private String question;

    @Column(name = "options", nullable = false, columnDefinition = "JSONB")
    private String options;

    @Column(name = "correct", nullable = false)
    private Integer correct;

    @Column(name = "explanation", columnDefinition = "TEXT")
    private String explanation;
}
