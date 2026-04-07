package com.kineticscholar.learningcontentservice.controller;

import com.kineticscholar.learningcontentservice.model.Unit;
import com.kineticscholar.learningcontentservice.model.Word;
import com.kineticscholar.learningcontentservice.model.Phrase;
import com.kineticscholar.learningcontentservice.model.Reading;
import com.kineticscholar.learningcontentservice.model.Quiz;
import com.kineticscholar.learningcontentservice.service.LearningContentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api")
public class LearningContentController {

    @Autowired
    private LearningContentService learningContentService;

    // Unit endpoints
    @GetMapping("/units")
    public ResponseEntity<?> getAllUnits() {
        return new ResponseEntity<>(learningContentService.getAllUnits(), HttpStatus.OK);
    }

    @GetMapping("/units/{id}")
    public ResponseEntity<?> getUnitById(@PathVariable String id) {
        Optional<Unit> unit = learningContentService.getUnitById(id);
        if (unit.isPresent()) {
            return new ResponseEntity<>(unit.get(), HttpStatus.OK);
        } else {
            return new ResponseEntity<>(Map.of("error", "Unit not found"), HttpStatus.NOT_FOUND);
        }
    }

    @PostMapping("/units")
    public ResponseEntity<?> createUnit(@RequestBody Unit unit) {
        Unit createdUnit = learningContentService.createUnit(unit);
        return new ResponseEntity<>(createdUnit, HttpStatus.CREATED);
    }

    @PutMapping("/units/{id}")
    public ResponseEntity<?> updateUnit(@PathVariable String id, @RequestBody Unit unit) {
        try {
            Unit updatedUnit = learningContentService.updateUnit(id, unit);
            return new ResponseEntity<>(updatedUnit, HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.NOT_FOUND);
        }
    }

    @DeleteMapping("/units/{id}")
    public ResponseEntity<?> deleteUnit(@PathVariable String id) {
        learningContentService.deleteUnit(id);
        return new ResponseEntity<>(HttpStatus.NO_CONTENT);
    }

    // Word endpoints
    @GetMapping("/units/{unitId}/words")
    public ResponseEntity<?> getWordsByUnitId(@PathVariable String unitId) {
        return new ResponseEntity<>(learningContentService.getWordsByUnitId(unitId), HttpStatus.OK);
    }

    @GetMapping("/units/{unitId}/words/group/{groupId}")
    public ResponseEntity<?> getWordsByUnitIdAndGroupId(@PathVariable String unitId, @PathVariable Integer groupId) {
        return new ResponseEntity<>(learningContentService.getWordsByUnitIdAndGroupId(unitId, groupId), HttpStatus.OK);
    }

    @PostMapping("/words")
    public ResponseEntity<?> createWord(@RequestBody Word word) {
        Word createdWord = learningContentService.createWord(word);
        return new ResponseEntity<>(createdWord, HttpStatus.CREATED);
    }

    @PutMapping("/words/{id}")
    public ResponseEntity<?> updateWord(@PathVariable String id, @RequestBody Word word) {
        try {
            Word updatedWord = learningContentService.updateWord(id, word);
            return new ResponseEntity<>(updatedWord, HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.NOT_FOUND);
        }
    }

    @DeleteMapping("/words/{id}")
    public ResponseEntity<?> deleteWord(@PathVariable String id) {
        learningContentService.deleteWord(id);
        return new ResponseEntity<>(HttpStatus.NO_CONTENT);
    }

    // Phrase endpoints
    @GetMapping("/units/{unitId}/phrases")
    public ResponseEntity<?> getPhrasesByUnitId(@PathVariable String unitId) {
        return new ResponseEntity<>(learningContentService.getPhrasesByUnitId(unitId), HttpStatus.OK);
    }

    @GetMapping("/units/{unitId}/phrases/group/{groupId}")
    public ResponseEntity<?> getPhrasesByUnitIdAndGroupId(@PathVariable String unitId, @PathVariable Integer groupId) {
        return new ResponseEntity<>(learningContentService.getPhrasesByUnitIdAndGroupId(unitId, groupId), HttpStatus.OK);
    }

    @PostMapping("/phrases")
    public ResponseEntity<?> createPhrase(@RequestBody Phrase phrase) {
        Phrase createdPhrase = learningContentService.createPhrase(phrase);
        return new ResponseEntity<>(createdPhrase, HttpStatus.CREATED);
    }

    @PutMapping("/phrases/{id}")
    public ResponseEntity<?> updatePhrase(@PathVariable String id, @RequestBody Phrase phrase) {
        try {
            Phrase updatedPhrase = learningContentService.updatePhrase(id, phrase);
            return new ResponseEntity<>(updatedPhrase, HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.NOT_FOUND);
        }
    }

    @DeleteMapping("/phrases/{id}")
    public ResponseEntity<?> deletePhrase(@PathVariable String id) {
        learningContentService.deletePhrase(id);
        return new ResponseEntity<>(HttpStatus.NO_CONTENT);
    }

    // Reading endpoints
    @GetMapping("/units/{unitId}/reading")
    public ResponseEntity<?> getReadingByUnitId(@PathVariable String unitId) {
        Optional<Reading> reading = learningContentService.getReadingByUnitId(unitId);
        if (reading.isPresent()) {
            return new ResponseEntity<>(reading.get(), HttpStatus.OK);
        } else {
            return new ResponseEntity<>(Map.of("error", "Reading not found"), HttpStatus.NOT_FOUND);
        }
    }

    @PostMapping("/readings")
    public ResponseEntity<?> createReading(@RequestBody Reading reading) {
        Reading createdReading = learningContentService.createReading(reading);
        return new ResponseEntity<>(createdReading, HttpStatus.CREATED);
    }

    @PutMapping("/readings/{id}")
    public ResponseEntity<?> updateReading(@PathVariable String id, @RequestBody Reading reading) {
        try {
            Reading updatedReading = learningContentService.updateReading(id, reading);
            return new ResponseEntity<>(updatedReading, HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.NOT_FOUND);
        }
    }

    @DeleteMapping("/readings/{id}")
    public ResponseEntity<?> deleteReading(@PathVariable String id) {
        learningContentService.deleteReading(id);
        return new ResponseEntity<>(HttpStatus.NO_CONTENT);
    }

    // Quiz endpoints
    @GetMapping("/units/{unitId}/quizzes")
    public ResponseEntity<?> getQuizzesByUnitId(@PathVariable String unitId) {
        return new ResponseEntity<>(learningContentService.getQuizzesByUnitId(unitId), HttpStatus.OK);
    }

    @PostMapping("/quizzes")
    public ResponseEntity<?> createQuiz(@RequestBody Quiz quiz) {
        Quiz createdQuiz = learningContentService.createQuiz(quiz);
        return new ResponseEntity<>(createdQuiz, HttpStatus.CREATED);
    }

    @PutMapping("/quizzes/{id}")
    public ResponseEntity<?> updateQuiz(@PathVariable String id, @RequestBody Quiz quiz) {
        try {
            Quiz updatedQuiz = learningContentService.updateQuiz(id, quiz);
            return new ResponseEntity<>(updatedQuiz, HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.NOT_FOUND);
        }
    }

    @DeleteMapping("/quizzes/{id}")
    public ResponseEntity<?> deleteQuiz(@PathVariable String id) {
        learningContentService.deleteQuiz(id);
        return new ResponseEntity<>(HttpStatus.NO_CONTENT);
    }
}
