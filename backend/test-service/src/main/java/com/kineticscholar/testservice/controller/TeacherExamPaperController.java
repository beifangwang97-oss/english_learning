package com.kineticscholar.testservice.controller;

import com.kineticscholar.testservice.dto.TeacherExamPaperGenerateRequest;
import com.kineticscholar.testservice.dto.TeacherExamPaperReplaceItemRequest;
import com.kineticscholar.testservice.dto.TeacherExamPaperUpdateRequest;
import com.kineticscholar.testservice.service.TeacherExamPaperService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@RequestMapping({"/api", "/api/tests"})
public class TeacherExamPaperController {

    @Autowired
    private TeacherExamPaperService teacherExamPaperService;

    @PostMapping("/teacher-exam-papers/generate")
    public ResponseEntity<?> generatePaper(@RequestBody TeacherExamPaperGenerateRequest request) {
        try {
            return new ResponseEntity<>(teacherExamPaperService.generatePaper(request), HttpStatus.CREATED);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/teacher-exam-papers")
    public ResponseEntity<?> getTeacherPapers(
            @RequestParam("createdBy") Long createdBy,
            @RequestParam(value = "storeCode", required = false) String storeCode
    ) {
        return new ResponseEntity<>(teacherExamPaperService.getTeacherPapers(createdBy, storeCode), HttpStatus.OK);
    }

    @GetMapping("/teacher-exam-papers/{paperId}")
    public ResponseEntity<?> getPaperDetail(@PathVariable Long paperId) {
        return teacherExamPaperService.getPaperDetail(paperId)
                .<ResponseEntity<?>>map(detail -> new ResponseEntity<>(detail, HttpStatus.OK))
                .orElseGet(() -> new ResponseEntity<>(Map.of("error", "Teacher exam paper not found"), HttpStatus.NOT_FOUND));
    }

    @PutMapping("/teacher-exam-papers/{paperId}")
    public ResponseEntity<?> updatePaper(@PathVariable Long paperId, @RequestBody TeacherExamPaperUpdateRequest request) {
        try {
            return new ResponseEntity<>(teacherExamPaperService.updatePaper(paperId, request), HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping("/teacher-exam-papers/{paperId}/sections/{sectionId}/items/{itemId}/replace")
    public ResponseEntity<?> replaceSectionItem(
            @PathVariable Long paperId,
            @PathVariable Long sectionId,
            @PathVariable Long itemId,
            @RequestBody TeacherExamPaperReplaceItemRequest request
    ) {
        try {
            return new ResponseEntity<>(teacherExamPaperService.replaceSectionItem(paperId, sectionId, itemId, request), HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @DeleteMapping("/teacher-exam-papers/{paperId}/sections/{sectionId}/items/{itemId}")
    public ResponseEntity<?> deleteSectionItem(
            @PathVariable Long paperId,
            @PathVariable Long sectionId,
            @PathVariable Long itemId
    ) {
        try {
            return new ResponseEntity<>(teacherExamPaperService.deleteSectionItem(paperId, sectionId, itemId), HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/teacher-exam-papers/question-bank/candidates")
    public ResponseEntity<?> getReplacementCandidates(
            @RequestParam(value = "bookVersion", required = false) String bookVersion,
            @RequestParam(value = "grade", required = false) String grade,
            @RequestParam(value = "semester", required = false) String semester,
            @RequestParam(value = "unitCode", required = false) String unitCode,
            @RequestParam(value = "difficulty", required = false) String difficulty,
            @RequestParam(value = "knowledgeTag", required = false) String knowledgeTag,
            @RequestParam("questionType") String questionType,
            @RequestParam(value = "currentQuestionId", required = false) Long currentQuestionId,
            @RequestParam(value = "currentGroupId", required = false) Long currentGroupId,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "limit", required = false) Integer limit
    ) {
        return new ResponseEntity<>(
                teacherExamPaperService.getReplacementCandidates(
                        bookVersion,
                        grade,
                        semester,
                        unitCode,
                        difficulty,
                        knowledgeTag,
                        questionType,
                        currentQuestionId,
                        currentGroupId,
                        keyword,
                        limit
                ),
                HttpStatus.OK
        );
    }

    @DeleteMapping("/teacher-exam-papers/{paperId}")
    public ResponseEntity<?> deletePaper(@PathVariable Long paperId) {
        teacherExamPaperService.deletePaper(paperId);
        return new ResponseEntity<>(Map.of("message", "Teacher exam paper deleted"), HttpStatus.OK);
    }
}
