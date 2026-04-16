package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class ExamQuestionView {
    private Long id;
    private String questionUid;
    private Integer questionNo;
    private String questionType;
    private String stem;
    private String answerText;
    private String analysis;
    private String difficulty;
    private String status;
    private Integer sortOrder;
    private Long materialId;
    private String materialUid;
    private String materialLabel;
    private List<ExamQuestionOptionView> options;
}
