package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class QuestionBankQuestionUpdateRequest {
    private String stem;
    private Object answer;
    private String analysis;
    private String difficulty;
    private Object knowledgeTags;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private String examScene;
    private String status;
    private String remarks;
    private String sharedStem;
    private String material;
    private List<QuestionBankOptionPayload> options;
}
