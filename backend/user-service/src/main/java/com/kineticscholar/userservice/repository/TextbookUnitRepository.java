package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.TextbookUnit;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface TextbookUnitRepository extends JpaRepository<TextbookUnit, Long> {
    List<TextbookUnit> findByBookVersionAndGradeAndSemesterOrderBySortOrderAscIdAsc(
            String bookVersion,
            String grade,
            String semester
    );

    Optional<TextbookUnit> findByBookVersionAndGradeAndSemesterAndUnitCode(
            String bookVersion,
            String grade,
            String semester,
            String unitCode
    );

    boolean existsByBookVersionAndGradeAndSemesterAndUnitCode(
            String bookVersion,
            String grade,
            String semester,
            String unitCode
    );

    long countByBookVersionAndGradeAndSemester(String bookVersion, String grade, String semester);

    long countByBookVersionAndGradeAndSemesterAndUnitCode(
            String bookVersion,
            String grade,
            String semester,
            String unitCode
    );

    void deleteByBookVersionAndGradeAndSemester(String bookVersion, String grade, String semester);
}
