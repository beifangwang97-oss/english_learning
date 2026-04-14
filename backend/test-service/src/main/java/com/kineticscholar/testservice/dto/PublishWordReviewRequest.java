package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class PublishWordReviewRequest {
    private Long createdBy;
    private String storeCode;
    private String title;
    private Integer dailyQuota;
    private Boolean enableSpelling;
    private Boolean enableZhToEn;
    private List<Long> studentIds;
    private List<WordReviewUnitScope> scopes;
    private List<WordReviewContentItem> items;
}
