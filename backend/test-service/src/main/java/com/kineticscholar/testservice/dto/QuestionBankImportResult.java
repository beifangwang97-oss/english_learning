package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class QuestionBankImportResult {
    private Long batchId;
    private String batchCode;
    private Integer totalCount;
    private Integer successCount;
    private Integer failedCount;
    private Integer createdCount;
    private Integer updatedCount;
    private Integer skippedCount;
    private List<String> errors = new ArrayList<>();
}
