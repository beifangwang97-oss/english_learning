package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.GradeTag;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface GradeTagRepository extends JpaRepository<GradeTag, Long> {
    boolean existsByName(String name);
    Optional<GradeTag> findByName(String name);
    void deleteByNameNotIn(java.util.Collection<String> names);
}
