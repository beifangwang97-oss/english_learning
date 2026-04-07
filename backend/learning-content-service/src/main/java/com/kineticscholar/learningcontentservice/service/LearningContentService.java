package com.kineticscholar.learningcontentservice.service;

import com.kineticscholar.learningcontentservice.model.Unit;
import com.kineticscholar.learningcontentservice.model.Word;
import com.kineticscholar.learningcontentservice.model.Phrase;
import com.kineticscholar.learningcontentservice.model.Reading;
import com.kineticscholar.learningcontentservice.model.Quiz;
import java.util.List;
import java.util.Optional;

public interface LearningContentService {
    // Unit methods
    List<Unit> getAllUnits();
    Optional<Unit> getUnitById(String id);
    Unit createUnit(Unit unit);
    Unit updateUnit(String id, Unit unit);
    void deleteUnit(String id);

    // Word methods
    List<Word> getWordsByUnitId(String unitId);
    List<Word> getWordsByUnitIdAndGroupId(String unitId, Integer groupId);
    Word createWord(Word word);
    Word updateWord(String id, Word word);
    void deleteWord(String id);

    // Phrase methods
    List<Phrase> getPhrasesByUnitId(String unitId);
    List<Phrase> getPhrasesByUnitIdAndGroupId(String unitId, Integer groupId);
    Phrase createPhrase(Phrase phrase);
    Phrase updatePhrase(String id, Phrase phrase);
    void deletePhrase(String id);

    // Reading methods
    Optional<Reading> getReadingByUnitId(String unitId);
    Reading createReading(Reading reading);
    Reading updateReading(String id, Reading reading);
    void deleteReading(String id);

    // Quiz methods
    List<Quiz> getQuizzesByUnitId(String unitId);
    Quiz createQuiz(Quiz quiz);
    Quiz updateQuiz(String id, Quiz quiz);
    void deleteQuiz(String id);
}
