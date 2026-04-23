package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class QuestionBankOptionView {
    private Long id;
    private String key;
    private String text;
    private Integer sortOrder;
}
