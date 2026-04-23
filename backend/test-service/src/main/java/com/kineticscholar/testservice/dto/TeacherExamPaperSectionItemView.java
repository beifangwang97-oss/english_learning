package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class TeacherExamPaperSectionItemView {
    private Long id;
    private Integer sortOrder;
    private String itemType;
    private Long questionId;
    private Long groupId;
    private Object snapshot;
}
