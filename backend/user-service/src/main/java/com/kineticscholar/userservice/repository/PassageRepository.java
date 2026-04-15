package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.Passage;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PassageRepository extends JpaRepository<Passage, Long> {

    @EntityGraph(attributePaths = {"sentences"})
    List<Passage> findByBookVersionAndGradeAndSemesterOrderByUnitNameAscSectionAscLabelAscIdAsc(
            String bookVersion,
            String grade,
            String semester
    );

    @EntityGraph(attributePaths = {"sentences"})
    Optional<Passage> findByPassageUid(String passageUid);

    long countByBookVersionAndGradeAndSemester(String bookVersion, String grade, String semester);

    long countByBookVersionAndGradeAndSemesterAndUnitName(
            String bookVersion,
            String grade,
            String semester,
            String unitName
    );

    long countByBookVersionAndGrade(String bookVersion, String grade);

    long countByBookVersion(String bookVersion);

    void deleteByBookVersionAndGradeAndSemester(String bookVersion, String grade, String semester);
}
