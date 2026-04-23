package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class TeacherExamPaperListItemView {
    private Long id;
    private String paperCode;
    private String title;
    private Long createdBy;
    private String storeCode;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private String difficulty;
    private Object knowledgeTags;
    private String status;
    private Integer totalSectionCount;
    private Integer totalQuestionCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
