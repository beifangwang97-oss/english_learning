package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class QuestionBankImportBatchView {
    private Long id;
    private String batchCode;
    private String sourceType;
    private String sourceFile;
    private String parserVersion;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private String importStatus;
    private String overwriteMode;
    private Integer totalCount;
    private Integer successCount;
    private Integer failedCount;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
