package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class StudentTeacherExamResultItemRequest {
    private Long sectionId;
    private Long sectionItemId;
    private String itemType;
    private Long questionId;
    private String questionUid;
    private Integer questionNo;
    private String questionType;
    private Object submittedAnswer;
    private Object correctAnswer;
    private Boolean correct;
    private String sourceFile;
    private String sharedStem;
    private String material;
    private String stem;
    private Object options;
    private String analysis;
}
