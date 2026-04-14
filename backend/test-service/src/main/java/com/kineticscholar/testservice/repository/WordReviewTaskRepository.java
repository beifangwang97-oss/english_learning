package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.WordReviewTask;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WordReviewTaskRepository extends JpaRepository<WordReviewTask, String> {
    List<WordReviewTask> findByCreatedByAndStoreCodeOrderByCreatedAtDesc(Long createdBy, String storeCode);
}
