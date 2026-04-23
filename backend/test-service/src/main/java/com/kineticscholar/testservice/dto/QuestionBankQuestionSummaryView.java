package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class QuestionBankQuestionSummaryView {
    private Long id;
    private String questionUid;
    private String questionType;
    private String stem;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private String examScene;
    private Long groupId;
    private String status;
    private String sourceFile;
    private LocalDateTime updatedAt;
}
