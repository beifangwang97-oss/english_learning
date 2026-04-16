package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class ExamPaperUpdateRequest {
    private String paperName;
    private String status;
    private String sourceFile;
}
