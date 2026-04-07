package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.TestAnswer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TestAnswerRepository extends JpaRepository<TestAnswer, Long> {
    List<TestAnswer> findByAssignmentId(Long assignmentId);
}
