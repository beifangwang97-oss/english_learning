package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class ExamMaterialView {
    private Long id;
    private String materialUid;
    private String materialLabel;
    private String questionType;
    private String title;
    private String content;
    private String analysis;
    private Integer sortOrder;
}
