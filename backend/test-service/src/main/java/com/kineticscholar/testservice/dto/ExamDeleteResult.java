package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class ExamDeleteResult {
    private String message;
    private Integer deletedPaperCount;
    private Integer deletedMaterialCount;
    private Integer deletedQuestionCount;
    private Integer deletedOptionCount;
}
