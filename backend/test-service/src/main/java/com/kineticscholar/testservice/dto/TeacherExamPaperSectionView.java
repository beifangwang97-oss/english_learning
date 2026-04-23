package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class TeacherExamPaperSectionView {
    private Long id;
    private Integer sectionNo;
    private String sectionTitle;
    private String questionType;
    private Integer requestedCount;
    private Integer actualCount;
    private String itemType;
    private List<TeacherExamPaperSectionItemView> items = new ArrayList<>();
}
