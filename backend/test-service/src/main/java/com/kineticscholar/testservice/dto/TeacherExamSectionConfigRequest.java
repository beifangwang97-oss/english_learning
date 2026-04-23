package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class TeacherExamSectionConfigRequest {
    private String sectionTitle;
    private String questionType;
    private Integer count;
}
