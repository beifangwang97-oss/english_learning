package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.LexiconEntry;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

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
    List<LexiconEntry> findByTypeAndBookVersionAndGradeAndSemesterAndSourceTagOrderByUnitAscIdAsc(
            String type,
            String bookVersion,
            String grade,
            String semester,
            String sourceTag
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

    @EntityGraph(attributePaths = {"meanings"})
    List<LexiconEntry> findByTypeAndBookVersionAndGradeAndSemesterAndUnitAndSourceTagAndGroupNoOrderByIdAsc(
            String type,
            String bookVersion,
            String grade,
            String semester,
            String unit,
            String sourceTag,
            Integer groupNo
    );

    long countByBookVersionAndGradeAndSemesterAndUnit(
            String bookVersion,
            String grade,
            String semester,
            String unit
    );

    long countByTypeAndBookVersionAndGradeAndSemester(
            String type,
            String bookVersion,
            String grade,
            String semester
    );

    long countByTypeAndBookVersionAndGradeAndSemesterAndSourceTag(
            String type,
            String bookVersion,
            String grade,
            String semester,
            String sourceTag
    );

    @Modifying
    @Transactional
    @Query("""
            update LexiconEntry e
               set e.sourceTag = :defaultTag
             where e.sourceTag is null or trim(e.sourceTag) = ''
            """)
    int backfillMissingSourceTags(@Param("defaultTag") String defaultTag);

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

    @Query("""
            select e.groupNo, count(e.id)
            from LexiconEntry e
            where e.type = :type
              and e.bookVersion = :bookVersion
              and e.grade = :grade
              and e.semester = :semester
              and e.unit = :unit
              and e.sourceTag = :sourceTag
            group by e.groupNo
            order by e.groupNo asc
            """)
    List<Object[]> countByGroupAndSourceTag(
            @Param("type") String type,
            @Param("bookVersion") String bookVersion,
            @Param("grade") String grade,
            @Param("semester") String semester,
            @Param("unit") String unit,
            @Param("sourceTag") String sourceTag
    );
}
