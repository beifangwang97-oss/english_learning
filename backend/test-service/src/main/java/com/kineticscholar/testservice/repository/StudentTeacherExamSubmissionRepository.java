package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.StudentTeacherExamSubmission;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface StudentTeacherExamSubmissionRepository extends JpaRepository<StudentTeacherExamSubmission, Long> {
    Optional<StudentTeacherExamSubmission> findTopByAssignmentIdAndUserIdOrderBySubmittedAtDescIdDesc(Long assignmentId, Long userId);
}
