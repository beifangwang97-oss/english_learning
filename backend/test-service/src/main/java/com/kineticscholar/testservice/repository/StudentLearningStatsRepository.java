package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.StudentLearningStats;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface StudentLearningStatsRepository extends JpaRepository<StudentLearningStats, Long> {
    Optional<StudentLearningStats> findByUserId(Long userId);
}
