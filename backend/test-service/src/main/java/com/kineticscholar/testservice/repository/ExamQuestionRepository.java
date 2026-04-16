package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.ExamQuestion;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExamQuestionRepository extends JpaRepository<ExamQuestion, Long> {
    Optional<ExamQuestion> findByQuestionUid(String questionUid);

    List<ExamQuestion> findByPaperIdOrderByQuestionNoAsc(Long paperId);

    List<ExamQuestion> findByPaperIdAndQuestionTypeOrderByQuestionNoAsc(Long paperId, String questionType);

    List<ExamQuestion> findByMaterialIdOrderByQuestionNoAsc(Long materialId);

    Optional<ExamQuestion> findByPaperIdAndQuestionNo(Long paperId, Integer questionNo);

    void deleteByPaperId(Long paperId);
}
