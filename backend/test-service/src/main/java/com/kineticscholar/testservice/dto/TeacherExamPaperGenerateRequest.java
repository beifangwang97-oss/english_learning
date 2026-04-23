package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class TeacherExamPaperGenerateRequest {
    private Long createdBy;
    private String storeCode;
    private String title;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private String difficulty;
    private String knowledgeTag;
    private List<TeacherExamSectionConfigRequest> sections;
}
