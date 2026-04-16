package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class ExamQuestionOptionView {
    private String key;
    private String text;
    private Integer sortOrder;
}
