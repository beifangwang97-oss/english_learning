package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.ExamQuestionOption;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExamQuestionOptionRepository extends JpaRepository<ExamQuestionOption, Long> {
    List<ExamQuestionOption> findByQuestionIdOrderBySortOrderAscIdAsc(Long questionId);

    void deleteByQuestionId(Long questionId);

    void deleteByQuestionIdIn(List<Long> questionIds);
}
