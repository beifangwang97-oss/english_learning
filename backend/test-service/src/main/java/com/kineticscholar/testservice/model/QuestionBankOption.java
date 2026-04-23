package com.kineticscholar.testservice.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(
        name = "question_bank_options",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_question_bank_option", columnNames = {"question_id", "option_key"})
        },
        indexes = {
                @Index(name = "idx_question_bank_option_question", columnList = "question_id")
        }
)
public class QuestionBankOption {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "question_id", nullable = false)
    private Long questionId;

    @Column(name = "option_key", nullable = false, length = 16)
    private String optionKey;

    @Column(name = "option_text", nullable = false, columnDefinition = "TEXT")
    private String optionText;

    @Column(name = "sort_order", nullable = false)
    private Integer sortOrder;

    @PrePersist
    protected void onCreate() {
        if (sortOrder == null) sortOrder = 0;
    }
}
