package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.TeacherExamSectionItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TeacherExamSectionItemRepository extends JpaRepository<TeacherExamSectionItem, Long> {
    List<TeacherExamSectionItem> findByPaperIdOrderBySectionIdAscSortOrderAscIdAsc(Long paperId);

    List<TeacherExamSectionItem> findBySectionIdOrderBySortOrderAscIdAsc(Long sectionId);

    void deleteByPaperId(Long paperId);
}
