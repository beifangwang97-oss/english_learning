package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.TeacherExamPaper;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TeacherExamPaperRepository extends JpaRepository<TeacherExamPaper, Long> {
    List<TeacherExamPaper> findByCreatedByAndStoreCodeOrderByUpdatedAtDesc(Long createdBy, String storeCode);
}
