package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.LearningSessionState;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface LearningSessionStateRepository extends JpaRepository<LearningSessionState, Long> {
    Optional<LearningSessionState> findByUserIdAndUnitIdAndModule(Long userId, String unitId, String module);
}

