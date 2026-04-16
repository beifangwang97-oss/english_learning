package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class WordReviewUnitScope {
    private String textbookVersion;
    private String grade;
    private String semester;
    private String unit;
    private String sourceTag;
}
