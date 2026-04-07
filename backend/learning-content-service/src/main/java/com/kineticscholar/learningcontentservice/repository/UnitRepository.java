package com.kineticscholar.learningcontentservice.repository;

import com.kineticscholar.learningcontentservice.model.Unit;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface UnitRepository extends JpaRepository<Unit, String> {
}
