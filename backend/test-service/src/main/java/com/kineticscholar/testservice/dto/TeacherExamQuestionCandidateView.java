package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class TeacherExamQuestionCandidateView {
    private String itemType;
    private Long questionId;
    private Long groupId;
    private String questionType;
    private String label;
    private String stem;
    private String sharedStem;
    private String material;
    private Integer questionCount;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private String sourceFile;
}
