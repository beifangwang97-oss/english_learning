package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class WordTestGroupScope {
    private String textbookVersion;
    private String grade;
    private String semester;
    private String unit;
    private String sourceTag;
    private Integer groupNo;
}
