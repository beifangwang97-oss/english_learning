package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.TestAssignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface TestAssignmentRepository extends JpaRepository<TestAssignment, Long> {
    List<TestAssignment> findByTestId(String testId);
    List<TestAssignment> findByTestIdIn(List<String> testIds);
    List<TestAssignment> findByUserId(Long userId);
    List<TestAssignment> findByUserIdAndStatus(Long userId, String status);
    List<TestAssignment> findByIdIn(List<Long> ids);
    long countByTestId(String testId);
}
