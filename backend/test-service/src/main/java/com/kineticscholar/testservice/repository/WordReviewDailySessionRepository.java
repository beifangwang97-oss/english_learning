package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.WordReviewDailySession;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

@Repository
public interface WordReviewDailySessionRepository extends JpaRepository<WordReviewDailySession, Long> {
    Optional<WordReviewDailySession> findByAssignmentIdAndReviewDate(Long assignmentId, LocalDate reviewDate);
    List<WordReviewDailySession> findByAssignmentId(Long assignmentId);
    List<WordReviewDailySession> findByAssignmentIdIn(List<Long> assignmentIds);
}
