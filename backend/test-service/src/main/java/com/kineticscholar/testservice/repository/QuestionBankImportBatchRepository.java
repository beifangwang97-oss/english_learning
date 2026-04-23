package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.QuestionBankImportBatch;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

public interface QuestionBankImportBatchRepository extends JpaRepository<QuestionBankImportBatch, Long>, JpaSpecificationExecutor<QuestionBankImportBatch> {
}
