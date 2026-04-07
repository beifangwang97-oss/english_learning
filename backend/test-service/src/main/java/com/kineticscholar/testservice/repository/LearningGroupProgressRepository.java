package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.LearningGroupProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LearningGroupProgressRepository extends JpaRepository<LearningGroupProgress, Long> {
    Optional<LearningGroupProgress> findByUserIdAndUnitIdAndModuleAndGroupNo(Long userId, String unitId, String module, Integer groupNo);
    List<LearningGroupProgress> findByUserIdAndUnitIdAndModuleOrderByGroupNoAsc(Long userId, String unitId, String module);
}

