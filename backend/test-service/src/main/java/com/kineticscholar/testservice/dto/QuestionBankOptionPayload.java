package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class QuestionBankOptionPayload {
    private String key;
    private String text;
    private Integer sortOrder;
}
