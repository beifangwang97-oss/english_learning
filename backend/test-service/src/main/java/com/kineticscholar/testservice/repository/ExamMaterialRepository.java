package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.ExamMaterial;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExamMaterialRepository extends JpaRepository<ExamMaterial, Long> {
    List<ExamMaterial> findByPaperIdOrderBySortOrderAscIdAsc(Long paperId);

    Optional<ExamMaterial> findByMaterialUid(String materialUid);

    Optional<ExamMaterial> findByPaperIdAndQuestionTypeAndMaterialLabel(
            Long paperId,
            String questionType,
            String materialLabel
    );

    void deleteByPaperId(Long paperId);
}
