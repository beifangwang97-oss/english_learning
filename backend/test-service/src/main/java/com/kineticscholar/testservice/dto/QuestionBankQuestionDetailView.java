package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
public class QuestionBankQuestionDetailView {
    private Long id;
    private String questionUid;
    private Long batchId;
    private Long groupId;
    private String groupUid;
    private String questionType;
    private Integer questionNo;
    private String stem;
    private Object answer;
    private String answerJson;
    private String analysis;
    private String difficulty;
    private Object knowledgeTags;
    private String knowledgeTagsJson;
    private String sourceType;
    private String sourceFile;
    private String parserVersion;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private String examScene;
    private String status;
    private String remarks;
    private String sharedStem;
    private String material;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<QuestionBankOptionView> options = new ArrayList<>();
}
