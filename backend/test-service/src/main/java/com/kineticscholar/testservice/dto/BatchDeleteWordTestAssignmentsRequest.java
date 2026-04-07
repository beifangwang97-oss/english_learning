package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class BatchDeleteWordTestAssignmentsRequest {
    private List<Long> assignmentIds;
}

