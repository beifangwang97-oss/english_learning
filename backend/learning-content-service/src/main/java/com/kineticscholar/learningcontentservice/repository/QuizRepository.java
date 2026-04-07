package com.kineticscholar.learningcontentservice.repository;

import com.kineticscholar.learningcontentservice.model.Quiz;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface QuizRepository extends JpaRepository<Quiz, String> {
    List<Quiz> findByUnitId(String unitId);
}
