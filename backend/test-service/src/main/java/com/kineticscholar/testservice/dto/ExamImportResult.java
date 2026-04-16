package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class ExamImportResult {
    private Long paperId;
    private String paperCode;
    private String paperName;
    private String paperType;
    private String sourceType;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private Integer materialCount;
    private Integer questionCount;
    private Boolean overwritten;
}
