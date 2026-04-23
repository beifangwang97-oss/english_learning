package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
public class TeacherExamPaperDetailView {
    private Long id;
    private String paperCode;
    private String title;
    private Long createdBy;
    private String storeCode;
    private String bookVersion;
    private String grade;
    private String semester;
    private String unitCode;
    private String difficulty;
    private Object knowledgeTags;
    private String status;
    private Integer totalSectionCount;
    private Integer totalQuestionCount;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    private List<TeacherExamPaperSectionView> sections = new ArrayList<>();
}
