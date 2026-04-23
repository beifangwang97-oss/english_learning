package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class StudentTeacherExamWrongNotebookItemView {
    private Long id;
    private Long assignmentId;
    private Long paperId;
    private String paperTitle;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private Long sectionId;
    private String sectionTitle;
    private String sectionQuestionType;
    private Long sectionItemId;
    private Long questionId;
    private String questionUid;
    private Integer questionNo;
    private String questionType;
    private String sourceFile;
    private String sourceLabel;
    private String sharedStem;
    private String material;
    private String stem;
    private Object options;
    private Object submittedAnswer;
    private Object correctAnswer;
    private String analysis;
    private Integer wrongCount;
    private LocalDateTime lastWrongAt;
}
