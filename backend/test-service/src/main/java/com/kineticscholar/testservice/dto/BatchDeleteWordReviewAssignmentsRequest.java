package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class BatchDeleteWordReviewAssignmentsRequest {
    private List<Long> assignmentIds;
}
