package com.kineticscholar.testservice.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class StudentTeacherExamWrongNotebookGroupView {
    private String sourceKey;
    private String sourceLabel;
    private List<StudentTeacherExamWrongNotebookItemView> items = new ArrayList<>();
}
