package com.kineticscholar.testservice.service;

import com.kineticscholar.testservice.dto.QuestionBankImportBatchView;
import com.kineticscholar.testservice.dto.QuestionBankImportResult;
import com.kineticscholar.testservice.dto.QuestionBankQuestionDetailView;
import com.kineticscholar.testservice.dto.QuestionBankQuestionSummaryView;
import com.kineticscholar.testservice.dto.QuestionBankQuestionUpdateRequest;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.web.multipart.MultipartFile;

import java.util.Optional;

public interface QuestionBankService {
    QuestionBankImportResult importJsonl(
            MultipartFile file,
            String bookVersion,
            String grade,
            String semester,
            String unitCode,
            String sourceType,
            String overwriteMode,
            Long createdBy
    );

    Page<QuestionBankImportBatchView> getImportBatches(
            String bookVersion,
            String grade,
            String semester,
            String unitCode,
            String status,
            Pageable pageable
    );

    Optional<QuestionBankImportBatchView> getImportBatch(Long batchId);

    Page<QuestionBankQuestionSummaryView> getQuestions(
            String bookVersion,
            String grade,
            String semester,
            String unitCode,
            String questionType,
            String examScene,
            String status,
            String keyword,
            String sourceType,
            Long batchId,
            Pageable pageable
    );

    Optional<QuestionBankQuestionDetailView> getQuestionDetail(Long id);

    QuestionBankQuestionDetailView updateQuestion(Long id, QuestionBankQuestionUpdateRequest request);

    void deleteQuestion(Long id);
}
