package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.UnitAssignment;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UnitAssignmentRepository extends JpaRepository<UnitAssignment, Long> {
    List<UnitAssignment> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<UnitAssignment> findByUserIdInOrderByCreatedAtDesc(List<Long> userIds);

    Optional<UnitAssignment> findByUserIdAndTextbookVersionAndGradeAndSemesterAndUnitName(
            Long userId,
            String textbookVersion,
            String grade,
            String semester,
            String unitName
    );
}
