package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.ExamWrongNotebookItem;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ExamWrongNotebookItemRepository extends JpaRepository<ExamWrongNotebookItem, Long> {
    Optional<ExamWrongNotebookItem> findByUserIdAndQuestionUid(Long userId, String questionUid);
    List<ExamWrongNotebookItem> findByUserIdOrderByLastWrongAtDescIdDesc(Long userId);
}
