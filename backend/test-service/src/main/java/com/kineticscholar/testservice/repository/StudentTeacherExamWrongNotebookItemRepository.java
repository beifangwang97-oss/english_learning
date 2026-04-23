package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.StudentTeacherExamWrongNotebookItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface StudentTeacherExamWrongNotebookItemRepository extends JpaRepository<StudentTeacherExamWrongNotebookItem, Long> {
    Optional<StudentTeacherExamWrongNotebookItem> findByUserIdAndQuestionUid(Long userId, String questionUid);

    List<StudentTeacherExamWrongNotebookItem> findByUserIdOrderByLastWrongAtDescIdDesc(Long userId);
}
