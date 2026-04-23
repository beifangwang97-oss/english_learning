package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.QuestionBankGroup;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface QuestionBankGroupRepository extends JpaRepository<QuestionBankGroup, Long> {
    Optional<QuestionBankGroup> findByBatchIdAndGroupUid(Long batchId, String groupUid);
}
