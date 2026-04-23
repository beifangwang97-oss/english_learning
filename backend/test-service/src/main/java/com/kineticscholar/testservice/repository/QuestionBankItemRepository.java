package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.QuestionBankItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.util.List;
import java.util.Optional;

public interface QuestionBankItemRepository extends JpaRepository<QuestionBankItem, Long>, JpaSpecificationExecutor<QuestionBankItem> {
    Optional<QuestionBankItem> findByQuestionUid(String questionUid);

    List<QuestionBankItem> findByGroupIdOrderByQuestionNoAscIdAsc(Long groupId);

    long countByGroupId(Long groupId);
}
