package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.LexiconEntry;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface LexiconEntryRepository extends JpaRepository<LexiconEntry, Long> {
    List<LexiconEntry> findByType(String type);
    List<LexiconEntry> findByTypeIn(List<String> types);

    @EntityGraph(attributePaths = {"meanings"})
    List<LexiconEntry> findByTypeAndBookVersionAndGradeAndSemesterOrderByUnitAscIdAsc(
            String type,
            String bookVersion,
            String grade,
            String semester
    );

    @EntityGraph(attributePaths = {"meanings"})
    List<LexiconEntry> findByTypeAndBookVersionAndGradeAndSemesterAndUnitOrderByGroupNoAscIdAsc(
            String type,
            String bookVersion,
            String grade,
            String semester,
            String unit
    );

    @EntityGraph(attributePaths = {"meanings"})
    List<LexiconEntry> findByTypeAndBookVersionAndGradeAndSemesterAndUnitAndGroupNoOrderByIdAsc(
            String type,
            String bookVersion,
            String grade,
            String semester,
            String unit,
            Integer groupNo
    );

    @Query("""
            select e.groupNo, count(e.id)
            from LexiconEntry e
            where e.type = :type
              and e.bookVersion = :bookVersion
              and e.grade = :grade
              and e.semester = :semester
              and e.unit = :unit
            group by e.groupNo
            order by e.groupNo asc
            """)
    List<Object[]> countByGroup(
            @Param("type") String type,
            @Param("bookVersion") String bookVersion,
            @Param("grade") String grade,
            @Param("semester") String semester,
            @Param("unit") String unit
    );
}
