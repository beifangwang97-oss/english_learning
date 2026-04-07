package com.kineticscholar.learningcontentservice.service.impl;

import com.kineticscholar.learningcontentservice.model.Unit;
import com.kineticscholar.learningcontentservice.model.Word;
import com.kineticscholar.learningcontentservice.model.Phrase;
import com.kineticscholar.learningcontentservice.model.Reading;
import com.kineticscholar.learningcontentservice.model.Quiz;
import com.kineticscholar.learningcontentservice.repository.UnitRepository;
import com.kineticscholar.learningcontentservice.repository.WordRepository;
import com.kineticscholar.learningcontentservice.repository.PhraseRepository;
import com.kineticscholar.learningcontentservice.repository.ReadingRepository;
import com.kineticscholar.learningcontentservice.repository.QuizRepository;
import com.kineticscholar.learningcontentservice.service.LearningContentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

@Service
public class LearningContentServiceImpl implements LearningContentService {

    @Autowired
    private UnitRepository unitRepository;

    @Autowired
    private WordRepository wordRepository;

    @Autowired
    private PhraseRepository phraseRepository;

    @Autowired
    private ReadingRepository readingRepository;

    @Autowired
    private QuizRepository quizRepository;

    // Unit methods
    @Override
    public List<Unit> getAllUnits() {
        return unitRepository.findAll();
    }

    @Override
    public Optional<Unit> getUnitById(String id) {
        return unitRepository.findById(id);
    }

    @Override
    public Unit createUnit(Unit unit) {
        return unitRepository.save(unit);
    }

    @Override
    public Unit updateUnit(String id, Unit unit) {
        Optional<Unit> existingUnit = unitRepository.findById(id);
        if (existingUnit.isPresent()) {
            Unit updatedUnit = existingUnit.get();
            if (unit.getTitle() != null) {
                updatedUnit.setTitle(unit.getTitle());
            }
            if (unit.getSubtitle() != null) {
                updatedUnit.setSubtitle(unit.getSubtitle());
            }
            if (unit.getDesc() != null) {
                updatedUnit.setDesc(unit.getDesc());
            }
            updatedUnit.setSpecial(unit.isSpecial());
            return unitRepository.save(updatedUnit);
        }
        throw new RuntimeException("Unit not found");
    }

    @Override
    public void deleteUnit(String id) {
        unitRepository.deleteById(id);
    }

    // Word methods
    @Override
    public List<Word> getWordsByUnitId(String unitId) {
        return wordRepository.findByUnitId(unitId);
    }

    @Override
    public List<Word> getWordsByUnitIdAndGroupId(String unitId, Integer groupId) {
        return wordRepository.findByUnitIdAndGroupId(unitId, groupId);
    }

    @Override
    public Word createWord(Word word) {
        return wordRepository.save(word);
    }

    @Override
    public Word updateWord(String id, Word word) {
        Optional<Word> existingWord = wordRepository.findById(id);
        if (existingWord.isPresent()) {
            Word updatedWord = existingWord.get();
            if (word.getUnitId() != null) {
                updatedWord.setUnitId(word.getUnitId());
            }
            if (word.getGroupId() != null) {
                updatedWord.setGroupId(word.getGroupId());
            }
            if (word.getEn() != null) {
                updatedWord.setEn(word.getEn());
            }
            if (word.getPhonetic() != null) {
                updatedWord.setPhonetic(word.getPhonetic());
            }
            if (word.getCn() != null) {
                updatedWord.setCn(word.getCn());
            }
            if (word.getSentence() != null) {
                updatedWord.setSentence(word.getSentence());
            }
            if (word.getSentenceCn() != null) {
                updatedWord.setSentenceCn(word.getSentenceCn());
            }
            if (word.getAudioUrl() != null) {
                updatedWord.setAudioUrl(word.getAudioUrl());
            }
            return wordRepository.save(updatedWord);
        }
        throw new RuntimeException("Word not found");
    }

    @Override
    public void deleteWord(String id) {
        wordRepository.deleteById(id);
    }

    // Phrase methods
    @Override
    public List<Phrase> getPhrasesByUnitId(String unitId) {
        return phraseRepository.findByUnitId(unitId);
    }

    @Override
    public List<Phrase> getPhrasesByUnitIdAndGroupId(String unitId, Integer groupId) {
        return phraseRepository.findByUnitIdAndGroupId(unitId, groupId);
    }

    @Override
    public Phrase createPhrase(Phrase phrase) {
        return phraseRepository.save(phrase);
    }

    @Override
    public Phrase updatePhrase(String id, Phrase phrase) {
        Optional<Phrase> existingPhrase = phraseRepository.findById(id);
        if (existingPhrase.isPresent()) {
            Phrase updatedPhrase = existingPhrase.get();
            if (phrase.getUnitId() != null) {
                updatedPhrase.setUnitId(phrase.getUnitId());
            }
            if (phrase.getGroupId() != null) {
                updatedPhrase.setGroupId(phrase.getGroupId());
            }
            if (phrase.getEn() != null) {
                updatedPhrase.setEn(phrase.getEn());
            }
            if (phrase.getCn() != null) {
                updatedPhrase.setCn(phrase.getCn());
            }
            if (phrase.getSentence() != null) {
                updatedPhrase.setSentence(phrase.getSentence());
            }
            if (phrase.getSentenceCn() != null) {
                updatedPhrase.setSentenceCn(phrase.getSentenceCn());
            }
            if (phrase.getAudioUrl() != null) {
                updatedPhrase.setAudioUrl(phrase.getAudioUrl());
            }
            return phraseRepository.save(updatedPhrase);
        }
        throw new RuntimeException("Phrase not found");
    }

    @Override
    public void deletePhrase(String id) {
        phraseRepository.deleteById(id);
    }

    // Reading methods
    @Override
    public Optional<Reading> getReadingByUnitId(String unitId) {
        return readingRepository.findByUnitId(unitId);
    }

    @Override
    public Reading createReading(Reading reading) {
        return readingRepository.save(reading);
    }

    @Override
    public Reading updateReading(String id, Reading reading) {
        Optional<Reading> existingReading = readingRepository.findById(id);
        if (existingReading.isPresent()) {
            Reading updatedReading = existingReading.get();
            if (reading.getUnitId() != null) {
                updatedReading.setUnitId(reading.getUnitId());
            }
            if (reading.getTitle() != null) {
                updatedReading.setTitle(reading.getTitle());
            }
            if (reading.getContent() != null) {
                updatedReading.setContent(reading.getContent());
            }
            if (reading.getTranslation() != null) {
                updatedReading.setTranslation(reading.getTranslation());
            }
            if (reading.getAudioUrl() != null) {
                updatedReading.setAudioUrl(reading.getAudioUrl());
            }
            return readingRepository.save(updatedReading);
        }
        throw new RuntimeException("Reading not found");
    }

    @Override
    public void deleteReading(String id) {
        readingRepository.deleteById(id);
    }

    // Quiz methods
    @Override
    public List<Quiz> getQuizzesByUnitId(String unitId) {
        return quizRepository.findByUnitId(unitId);
    }

    @Override
    public Quiz createQuiz(Quiz quiz) {
        return quizRepository.save(quiz);
    }

    @Override
    public Quiz updateQuiz(String id, Quiz quiz) {
        Optional<Quiz> existingQuiz = quizRepository.findById(id);
        if (existingQuiz.isPresent()) {
            Quiz updatedQuiz = existingQuiz.get();
            if (quiz.getUnitId() != null) {
                updatedQuiz.setUnitId(quiz.getUnitId());
            }
            if (quiz.getQuestion() != null) {
                updatedQuiz.setQuestion(quiz.getQuestion());
            }
            if (quiz.getOptions() != null) {
                updatedQuiz.setOptions(quiz.getOptions());
            }
            if (quiz.getCorrect() != null) {
                updatedQuiz.setCorrect(quiz.getCorrect());
            }
            if (quiz.getExplanation() != null) {
                updatedQuiz.setExplanation(quiz.getExplanation());
            }
            return quizRepository.save(updatedQuiz);
        }
        throw new RuntimeException("Quiz not found");
    }

    @Override
    public void deleteQuiz(String id) {
        quizRepository.deleteById(id);
    }
}
