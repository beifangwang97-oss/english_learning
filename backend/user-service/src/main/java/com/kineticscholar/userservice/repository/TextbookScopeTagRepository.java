package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.TextbookScopeTag;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TextbookScopeTagRepository extends JpaRepository<TextbookScopeTag, Long> {
    List<TextbookScopeTag> findByTextbookVersionOrderByGradeAscSemesterAsc(String textbookVersion);
    List<TextbookScopeTag> findByTextbookVersionAndGradeOrderBySemesterAsc(String textbookVersion, String grade);
    boolean existsByTextbookVersionAndGradeAndSemester(String textbookVersion, String grade, String semester);
    void deleteByTextbookVersionAndGradeAndSemester(String textbookVersion, String grade, String semester);
    void deleteByTextbookVersionAndGrade(String textbookVersion, String grade);
    void deleteByTextbookVersion(String textbookVersion);
}

