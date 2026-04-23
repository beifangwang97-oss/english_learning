package com.kineticscholar.testservice.service;

import com.kineticscholar.testservice.dto.TeacherExamPaperDetailView;
import com.kineticscholar.testservice.dto.TeacherExamPaperGenerateRequest;
import com.kineticscholar.testservice.dto.TeacherExamPaperListItemView;
import com.kineticscholar.testservice.dto.TeacherExamPaperReplaceItemRequest;
import com.kineticscholar.testservice.dto.TeacherExamPaperUpdateRequest;
import com.kineticscholar.testservice.dto.TeacherExamQuestionCandidateView;

import java.util.List;
import java.util.Optional;

public interface TeacherExamPaperService {
    TeacherExamPaperDetailView generatePaper(TeacherExamPaperGenerateRequest request);

    List<TeacherExamPaperListItemView> getTeacherPapers(Long createdBy, String storeCode);

    Optional<TeacherExamPaperDetailView> getPaperDetail(Long paperId);

    TeacherExamPaperDetailView updatePaper(Long paperId, TeacherExamPaperUpdateRequest request);

    TeacherExamPaperDetailView replaceSectionItem(Long paperId, Long sectionId, Long itemId, TeacherExamPaperReplaceItemRequest request);

    TeacherExamPaperDetailView deleteSectionItem(Long paperId, Long sectionId, Long itemId);

    List<TeacherExamQuestionCandidateView> getReplacementCandidates(
            String bookVersion,
            String grade,
            String semester,
            String unitCode,
            String difficulty,
            String knowledgeTag,
            String questionType,
            Long currentQuestionId,
            Long currentGroupId,
            String keyword,
            Integer limit
    );

    void deletePaper(Long paperId);
}
