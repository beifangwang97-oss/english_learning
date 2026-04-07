package com.kineticscholar.learningcontentservice.repository;

import com.kineticscholar.learningcontentservice.model.Reading;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface ReadingRepository extends JpaRepository<Reading, String> {
    Optional<Reading> findByUnitId(String unitId);
}
