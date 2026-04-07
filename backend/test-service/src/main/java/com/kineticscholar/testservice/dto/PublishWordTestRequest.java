package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class PublishWordTestRequest {
    private Long createdBy;
    private String storeCode;
    private String title;
    private String testType; // 默写, 听写
    private List<Long> studentIds;
    private List<WordTestGroupScope> scopes;
    private List<WordTestContentItem> items;
}

