package com.kineticscholar.learningcontentservice.repository;

import com.kineticscholar.learningcontentservice.model.Word;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WordRepository extends JpaRepository<Word, String> {
    List<Word> findByUnitId(String unitId);
    List<Word> findByUnitIdAndGroupId(String unitId, Integer groupId);
}
