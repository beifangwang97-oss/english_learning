package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.WordReviewAssignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WordReviewAssignmentRepository extends JpaRepository<WordReviewAssignment, Long> {
    List<WordReviewAssignment> findByTaskIdIn(List<String> taskIds);
    List<WordReviewAssignment> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<WordReviewAssignment> findByIdIn(List<Long> ids);
    long countByTaskId(String taskId);
}
