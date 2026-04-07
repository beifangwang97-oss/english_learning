package com.kineticscholar.testservice.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import jakarta.persistence.*;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(name = "test_answers")
public class TestAnswer {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "assignment_id", nullable = false)
    private Long assignmentId;

    @Column(name = "word_id", nullable = false, length = 50)
    private String wordId;

    @Column(name = "input", nullable = false, length = 200)
    private String input;

    @Column(name = "is_correct", nullable = false)
    private boolean isCorrect;
}
