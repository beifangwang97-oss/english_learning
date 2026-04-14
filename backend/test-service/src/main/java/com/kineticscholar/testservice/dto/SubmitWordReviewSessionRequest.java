package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class SubmitWordReviewSessionRequest {
    private List<SubmitWordReviewWordResult> results;
}
