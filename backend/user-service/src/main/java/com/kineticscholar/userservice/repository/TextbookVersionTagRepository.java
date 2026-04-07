package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.TextbookVersionTag;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface TextbookVersionTagRepository extends JpaRepository<TextbookVersionTag, Long> {
    boolean existsByName(String name);
    Optional<TextbookVersionTag> findByName(String name);
    void deleteByNameNotIn(java.util.Collection<String> names);
}
