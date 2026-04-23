package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.List;

@Data
public class BatchAssignUnitTasksRequest {
    private Long assignedBy;
    private List<Long> studentIds;
    private List<UnitTaskItem> units;
    private Long paperId;
    private String paperTitle;
}
