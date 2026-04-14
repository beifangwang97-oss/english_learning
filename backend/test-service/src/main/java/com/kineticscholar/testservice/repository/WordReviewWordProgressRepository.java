package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.WordReviewWordProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WordReviewWordProgressRepository extends JpaRepository<WordReviewWordProgress, Long> {
    List<WordReviewWordProgress> findByAssignmentId(Long assignmentId);
    Optional<WordReviewWordProgress> findByAssignmentIdAndEntryId(Long assignmentId, String entryId);
    long countByAssignmentIdAndMasteredTrue(Long assignmentId);
}
