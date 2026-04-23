package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.TeacherExamSection;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TeacherExamSectionRepository extends JpaRepository<TeacherExamSection, Long> {
    List<TeacherExamSection> findByPaperIdOrderBySectionNoAscIdAsc(Long paperId);

    void deleteByPaperId(Long paperId);
}
