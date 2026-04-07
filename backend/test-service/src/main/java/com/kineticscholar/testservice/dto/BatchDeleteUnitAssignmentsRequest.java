package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class BatchDeleteUnitAssignmentsRequest {
    private List<Long> assignmentIds;
}

