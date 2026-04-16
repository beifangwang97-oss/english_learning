package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
public class StudentExamWrongNotebookItemView {
    private Long id;
    private Long paperId;
    private String paperName;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private Long questionId;
    private String questionUid;
    private Integer questionNo;
    private String questionType;
    private String materialLabel;
    private String materialTitle;
    private String materialContent;
    private String materialAnalysis;
    private String stem;
    private List<ExamQuestionOptionView> options;
    private String submittedAnswer;
    private String correctAnswer;
    private String analysis;
    private Integer wrongCount;
    private LocalDateTime lastWrongAt;
}
