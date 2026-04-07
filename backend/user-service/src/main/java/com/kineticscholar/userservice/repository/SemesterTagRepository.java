package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.SemesterTag;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface SemesterTagRepository extends JpaRepository<SemesterTag, Long> {
    boolean existsByName(String name);
    Optional<SemesterTag> findByName(String name);
    void deleteByNameNotIn(java.util.Collection<String> names);
}
