package com.kineticscholar.testservice.repository;

import com.kineticscholar.testservice.model.WordTest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WordTestRepository extends JpaRepository<WordTest, String> {
    List<WordTest> findByCreatedBy(Long createdBy);
    List<WordTest> findByUnitId(String unitId);
    List<WordTest> findByCreatedByAndStoreCodeOrderByCreatedAtDesc(Long createdBy, String storeCode);
}
