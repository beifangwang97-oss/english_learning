package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.QuestionBankOption;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuestionBankOptionRepository extends JpaRepository<QuestionBankOption, Long> {
    List<QuestionBankOption> findByQuestionIdOrderBySortOrderAscIdAsc(Long questionId);

    void deleteByQuestionId(Long questionId);
}
