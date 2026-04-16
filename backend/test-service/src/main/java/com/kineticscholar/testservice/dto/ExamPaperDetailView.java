package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class ExamPaperDetailView {
    private Long id;
    private String paperCode;
    private String paperName;
    private String paperType;
    private String sourceType;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private String sourceFile;
    private Integer questionCount;
    private String status;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<ExamMaterialView> materials;
    private List<ExamQuestionView> questions;
}
