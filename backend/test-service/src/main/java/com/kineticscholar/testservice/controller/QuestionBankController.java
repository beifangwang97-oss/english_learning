package com.kineticscholar.testservice.controller;

import com.kineticscholar.testservice.dto.QuestionBankQuestionUpdateRequest;
import com.kineticscholar.testservice.service.QuestionBankService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;

@RestController
@RequestMapping({"/api", "/api/tests"})
public class QuestionBankController {

    @Autowired
    private QuestionBankService questionBankService;

    @PostMapping("/question-bank/import")
    public ResponseEntity<?> importQuestionBankJsonl(
            @RequestPart("file") MultipartFile file,
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester,
            @RequestParam(value = "unitCode", required = false) String unitCode,
            @RequestParam(value = "sourceType", required = false) String sourceType,
            @RequestParam(value = "overwriteMode", defaultValue = "overwrite_existing") String overwriteMode,
            @RequestParam(value = "createdBy", required = false) Long createdBy
    ) {
        try {
            return new ResponseEntity<>(questionBankService.importJsonl(
                    file,
                    bookVersion,
                    grade,
                    semester,
                    unitCode,
                    sourceType,
                    overwriteMode,
                    createdBy
            ), HttpStatus.CREATED);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/question-bank/import-batches")
    public ResponseEntity<?> getImportBatches(
            @RequestParam(value = "bookVersion", required = false) String bookVersion,
            @RequestParam(value = "grade", required = false) String grade,
            @RequestParam(value = "semester", required = false) String semester,
            @RequestParam(value = "unitCode", required = false) String unitCode,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "20") int size
    ) {
        return new ResponseEntity<>(questionBankService.getImportBatches(
                bookVersion,
                grade,
                semester,
                unitCode,
                status,
                PageRequest.of(Math.max(page, 0), Math.max(size, 1), Sort.by(Sort.Direction.DESC, "createdAt"))
        ), HttpStatus.OK);
    }

    @GetMapping("/question-bank/import-batches/{batchId}")
    public ResponseEntity<?> getImportBatch(@PathVariable Long batchId) {
        return questionBankService.getImportBatch(batchId)
                .<ResponseEntity<?>>map(view -> new ResponseEntity<>(view, HttpStatus.OK))
                .orElseGet(() -> new ResponseEntity<>(Map.of("error", "Import batch not found"), HttpStatus.NOT_FOUND));
    }

    @GetMapping("/question-bank/questions")
    public ResponseEntity<?> getQuestions(
            @RequestParam(value = "bookVersion", required = false) String bookVersion,
            @RequestParam(value = "grade", required = false) String grade,
            @RequestParam(value = "semester", required = false) String semester,
            @RequestParam(value = "unitCode", required = false) String unitCode,
            @RequestParam(value = "questionType", required = false) String questionType,
            @RequestParam(value = "examScene", required = false) String examScene,
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "sourceType", required = false) String sourceType,
            @RequestParam(value = "batchId", required = false) Long batchId,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "size", defaultValue = "50") int size
    ) {
        return new ResponseEntity<>(questionBankService.getQuestions(
                bookVersion,
                grade,
                semester,
                unitCode,
                questionType,
                examScene,
                status,
                keyword,
                sourceType,
                batchId,
                PageRequest.of(Math.max(page, 0), Math.max(size, 1), Sort.by(Sort.Direction.DESC, "updatedAt"))
        ), HttpStatus.OK);
    }

    @GetMapping("/question-bank/questions/{id}")
    public ResponseEntity<?> getQuestionDetail(@PathVariable Long id) {
        return questionBankService.getQuestionDetail(id)
                .<ResponseEntity<?>>map(view -> new ResponseEntity<>(view, HttpStatus.OK))
                .orElseGet(() -> new ResponseEntity<>(Map.of("error", "Question not found"), HttpStatus.NOT_FOUND));
    }

    @PutMapping("/question-bank/questions/{id}")
    public ResponseEntity<?> updateQuestion(@PathVariable Long id, @org.springframework.web.bind.annotation.RequestBody QuestionBankQuestionUpdateRequest request) {
        try {
            return new ResponseEntity<>(questionBankService.updateQuestion(id, request), HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @DeleteMapping("/question-bank/questions/{id}")
    public ResponseEntity<?> deleteQuestion(@PathVariable Long id) {
        try {
            questionBankService.deleteQuestion(id);
            return new ResponseEntity<>(Map.of("message", "Question deleted"), HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }
}
