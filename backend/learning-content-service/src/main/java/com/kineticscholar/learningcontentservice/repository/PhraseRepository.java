package com.kineticscholar.learningcontentservice.repository;

import com.kineticscholar.learningcontentservice.model.Phrase;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface PhraseRepository extends JpaRepository<Phrase, String> {
    List<Phrase> findByUnitId(String unitId);
    List<Phrase> findByUnitIdAndGroupId(String unitId, Integer groupId);
}
