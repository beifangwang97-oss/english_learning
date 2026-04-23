package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class TeacherExamPaperReplaceItemRequest {
    private Long questionId;
    private Long groupId;
}
