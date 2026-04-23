package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class UnitTaskItem {
    private String textbookVersion;
    private String grade;
    private String semester;
    private String unitName;
    private Long paperId;
    private String paperTitle;
}
