package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.ExamPracticeRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface ExamPracticeRecordRepository extends JpaRepository<ExamPracticeRecord, Long> {
    Optional<ExamPracticeRecord> findTopByUserIdAndPaperIdOrderBySubmittedAtDescIdDesc(Long userId, Long paperId);
}
