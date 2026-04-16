package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.ExamPaper;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExamPaperRepository extends JpaRepository<ExamPaper, Long> {
    Optional<ExamPaper> findByPaperCode(String paperCode);

    Optional<ExamPaper> findByPaperTypeAndBookVersionAndGradeAndSemesterAndUnitCode(
            String paperType,
            String bookVersion,
            String grade,
            String semester,
            String unitCode
    );

    List<ExamPaper> findByBookVersionAndGradeAndSemesterOrderByUnitCodeAsc(
            String bookVersion,
            String grade,
            String semester
    );

    long countByBookVersionAndGradeAndSemester(
            String bookVersion,
            String grade,
            String semester
    );
}
