package com.kineticscholar.testservice.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kineticscholar.testservice.dto.TeacherExamPaperDetailView;
import com.kineticscholar.testservice.dto.TeacherExamPaperGenerateRequest;
import com.kineticscholar.testservice.dto.TeacherExamPaperListItemView;
import com.kineticscholar.testservice.dto.TeacherExamPaperReplaceItemRequest;
import com.kineticscholar.testservice.dto.TeacherExamPaperSectionItemView;
import com.kineticscholar.testservice.dto.TeacherExamPaperSectionView;
import com.kineticscholar.testservice.dto.TeacherExamPaperUpdateRequest;
import com.kineticscholar.testservice.dto.TeacherExamQuestionCandidateView;
import com.kineticscholar.testservice.dto.TeacherExamSectionConfigRequest;
import com.kineticscholar.testservice.model.QuestionBankGroup;
import com.kineticscholar.testservice.model.QuestionBankItem;
import com.kineticscholar.testservice.model.QuestionBankOption;
import com.kineticscholar.testservice.model.TeacherExamPaper;
import com.kineticscholar.testservice.model.TeacherExamSection;
import com.kineticscholar.testservice.model.TeacherExamSectionItem;
import com.kineticscholar.testservice.repository.QuestionBankGroupRepository;
import com.kineticscholar.testservice.repository.QuestionBankItemRepository;
import com.kineticscholar.testservice.repository.QuestionBankOptionRepository;
import com.kineticscholar.testservice.repository.TeacherExamPaperRepository;
import com.kineticscholar.testservice.repository.TeacherExamSectionItemRepository;
import com.kineticscholar.testservice.repository.TeacherExamSectionRepository;
import com.kineticscholar.testservice.service.TeacherExamPaperService;
import jakarta.persistence.criteria.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class TeacherExamPaperServiceImpl implements TeacherExamPaperService {

    @Autowired
    private TeacherExamPaperRepository paperRepository;

    @Autowired
    private TeacherExamSectionRepository sectionRepository;

    @Autowired
    private TeacherExamSectionItemRepository sectionItemRepository;

    @Autowired
    private QuestionBankItemRepository questionBankItemRepository;

    @Autowired
    private QuestionBankGroupRepository questionBankGroupRepository;

    @Autowired
    private QuestionBankOptionRepository questionBankOptionRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Override
    @Transactional
    public TeacherExamPaperDetailView generatePaper(TeacherExamPaperGenerateRequest request) {
        if (request == null) throw new RuntimeException("request is required");
        if (request.getCreatedBy() == null) throw new RuntimeException("createdBy is required");
        if (request.getSections() == null || request.getSections().isEmpty()) throw new RuntimeException("sections is required");

        TeacherExamPaper paper = new TeacherExamPaper();
        paper.setPaperCode("tp_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        paper.setTitle(resolvePaperTitle(request.getTitle()));
        paper.setCreatedBy(request.getCreatedBy());
        paper.setStoreCode(blankToNull(request.getStoreCode()));
        paper.setBookVersion(normalizeBookVersion(request.getBookVersion()));
        paper.setGrade(blankToNull(request.getGrade()));
        paper.setSemester(normalizeSemester(request.getSemester()));
        paper.setUnitCode(normalizeUnitCode(request.getUnitCode()));
        paper.setDifficulty(blankToNull(request.getDifficulty()));
        paper.setKnowledgeTagsJson(writeJson(blankToNull(request.getKnowledgeTag()) == null ? List.of() : List.of(request.getKnowledgeTag().trim())));
        paper.setStatus("active");
        paper.setTotalSectionCount(request.getSections().size());
        paper.setTotalQuestionCount(0);
        paper = paperRepository.save(paper);

        List<TeacherExamSection> sections = new ArrayList<>();
        List<TeacherExamSectionItem> itemsToSave = new ArrayList<>();
        Set<Long> usedQuestionIds = new LinkedHashSet<>();
        Set<Long> usedGroupIds = new LinkedHashSet<>();
        int totalQuestionCount = 0;

        for (int i = 0; i < request.getSections().size(); i += 1) {
            TeacherExamSectionConfigRequest sectionRequest = request.getSections().get(i);
            String questionType = requireText(sectionRequest == null ? null : sectionRequest.getQuestionType(), "section.questionType is required");
            int requestedCount = sectionRequest.getCount() == null ? 0 : sectionRequest.getCount();
            if (requestedCount <= 0) throw new RuntimeException("section.count must be greater than 0");

            List<QuestionBankItem> matchedQuestions = loadMatchedQuestions(
                    normalizeBookVersion(request.getBookVersion()),
                    request.getGrade(),
                    normalizeSemester(request.getSemester()),
                    normalizeUnitCode(request.getUnitCode()),
                    request.getDifficulty(),
                    request.getKnowledgeTag(),
                    questionType,
                    null
            );
            if (matchedQuestions.isEmpty()) {
                throw new RuntimeException("No question bank items matched section: " + questionType);
            }

            boolean groupedMode = matchedQuestions.stream().anyMatch(row -> row.getGroupId() != null);
            TeacherExamSection section = new TeacherExamSection();
            section.setPaperId(paper.getId());
            section.setSectionNo(i + 1);
            section.setSectionTitle(resolveSectionTitle(sectionRequest, i + 1));
            section.setQuestionType(questionType);
            section.setRequestedCount(requestedCount);
            section.setActualCount(0);
            section.setItemType(groupedMode ? "group" : "question");
            section = sectionRepository.save(section);
            sections.add(section);

            int actualCount = 0;
            if (groupedMode) {
                List<Long> groupIds = matchedQuestions.stream()
                        .map(QuestionBankItem::getGroupId)
                        .filter(id -> id != null && !usedGroupIds.contains(id))
                        .distinct()
                        .collect(Collectors.toCollection(ArrayList::new));
                Collections.shuffle(groupIds);
                for (Long groupId : groupIds) {
                    if (actualCount >= requestedCount) break;
                    List<QuestionBankItem> groupQuestions = questionBankItemRepository.findByGroupIdOrderByQuestionNoAscIdAsc(groupId);
                    if (groupQuestions.isEmpty()) continue;
                    if (groupQuestions.stream().anyMatch(question -> usedQuestionIds.contains(question.getId()))) continue;

                    TeacherExamSectionItem item = new TeacherExamSectionItem();
                    item.setPaperId(paper.getId());
                    item.setSectionId(section.getId());
                    item.setSortOrder(actualCount + 1);
                    item.setItemType("group");
                    item.setGroupId(groupId);
                    item.setQuestionId(null);
                    item.setSnapshotJson(writeJson(buildGroupSnapshot(groupId, groupQuestions)));
                    itemsToSave.add(item);

                    usedGroupIds.add(groupId);
                    groupQuestions.stream().map(QuestionBankItem::getId).forEach(usedQuestionIds::add);
                    totalQuestionCount += groupQuestions.size();
                    actualCount += 1;
                }
            } else {
                List<QuestionBankItem> candidates = matchedQuestions.stream()
                        .filter(row -> !usedQuestionIds.contains(row.getId()))
                        .collect(Collectors.toCollection(ArrayList::new));
                Collections.shuffle(candidates);
                for (QuestionBankItem candidate : candidates) {
                    if (actualCount >= requestedCount) break;
                    TeacherExamSectionItem item = new TeacherExamSectionItem();
                    item.setPaperId(paper.getId());
                    item.setSectionId(section.getId());
                    item.setSortOrder(actualCount + 1);
                    item.setItemType("question");
                    item.setQuestionId(candidate.getId());
                    item.setGroupId(candidate.getGroupId());
                    item.setSnapshotJson(writeJson(buildQuestionSnapshot(candidate)));
                    itemsToSave.add(item);

                    usedQuestionIds.add(candidate.getId());
                    if (candidate.getGroupId() != null) usedGroupIds.add(candidate.getGroupId());
                    totalQuestionCount += 1;
                    actualCount += 1;
                }
            }
            section.setActualCount(actualCount);
            sectionRepository.save(section);
        }

        if (!itemsToSave.isEmpty()) {
            sectionItemRepository.saveAll(itemsToSave);
        }
        paper.setTotalQuestionCount(totalQuestionCount);
        paperRepository.save(paper);
        return buildDetail(paper);
    }

    @Override
    @Transactional(readOnly = true)
    public List<TeacherExamPaperListItemView> getTeacherPapers(Long createdBy, String storeCode) {
        if (createdBy == null) return List.of();
        return paperRepository.findByCreatedByAndStoreCodeOrderByUpdatedAtDesc(createdBy, safeStoreCode(storeCode))
                .stream()
                .map(this::toListItem)
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<TeacherExamPaperDetailView> getPaperDetail(Long paperId) {
        return paperRepository.findById(paperId).map(this::buildDetail);
    }

    @Override
    @Transactional
    public TeacherExamPaperDetailView updatePaper(Long paperId, TeacherExamPaperUpdateRequest request) {
        TeacherExamPaper paper = requirePaper(paperId);
        if (request == null) throw new RuntimeException("request is required");
        if (request.getTitle() != null) {
            paper.setTitle(requireText(request.getTitle(), "title is required"));
        }
        paper = paperRepository.save(paper);
        return buildDetail(paper);
    }

    @Override
    @Transactional
    public TeacherExamPaperDetailView replaceSectionItem(Long paperId, Long sectionId, Long itemId, TeacherExamPaperReplaceItemRequest request) {
        TeacherExamPaper paper = requirePaper(paperId);
        TeacherExamSection section = sectionRepository.findById(sectionId)
                .orElseThrow(() -> new RuntimeException("Section not found"));
        if (!paper.getId().equals(section.getPaperId())) throw new RuntimeException("Section does not belong to paper");
        TeacherExamSectionItem item = sectionItemRepository.findById(itemId)
                .orElseThrow(() -> new RuntimeException("Section item not found"));
        if (!paper.getId().equals(item.getPaperId()) || !section.getId().equals(item.getSectionId())) {
            throw new RuntimeException("Section item does not belong to paper");
        }
        if (request == null) throw new RuntimeException("request is required");

        if (request.getGroupId() != null) {
            Long groupId = request.getGroupId();
            List<QuestionBankItem> groupQuestions = questionBankItemRepository.findByGroupIdOrderByQuestionNoAscIdAsc(groupId);
            if (groupQuestions.isEmpty()) throw new RuntimeException("Group not found");
            ensureSameQuestionType(section.getQuestionType(), groupQuestions.get(0).getQuestionType());
            item.setItemType("group");
            item.setGroupId(groupId);
            item.setQuestionId(null);
            item.setSnapshotJson(writeJson(buildGroupSnapshot(groupId, groupQuestions)));
        } else if (request.getQuestionId() != null) {
            QuestionBankItem question = questionBankItemRepository.findById(request.getQuestionId())
                    .orElseThrow(() -> new RuntimeException("Question not found"));
            ensureSameQuestionType(section.getQuestionType(), question.getQuestionType());
            item.setItemType("question");
            item.setQuestionId(question.getId());
            item.setGroupId(question.getGroupId());
            item.setSnapshotJson(writeJson(buildQuestionSnapshot(question)));
        } else {
            throw new RuntimeException("questionId or groupId is required");
        }

        sectionItemRepository.save(item);
        refreshPaperQuestionCount(paper);
        return buildDetail(paper);
    }

    @Override
    @Transactional
    public TeacherExamPaperDetailView deleteSectionItem(Long paperId, Long sectionId, Long itemId) {
        TeacherExamPaper paper = requirePaper(paperId);
        TeacherExamSection section = sectionRepository.findById(sectionId)
                .orElseThrow(() -> new RuntimeException("Section not found"));
        if (!paper.getId().equals(section.getPaperId())) throw new RuntimeException("Section does not belong to paper");
        TeacherExamSectionItem item = sectionItemRepository.findById(itemId)
                .orElseThrow(() -> new RuntimeException("Section item not found"));
        if (!paper.getId().equals(item.getPaperId()) || !section.getId().equals(item.getSectionId())) {
            throw new RuntimeException("Section item does not belong to paper");
        }

        sectionItemRepository.delete(item);
        normalizeSectionItems(section);
        refreshPaperQuestionCount(paper);
        return buildDetail(paper);
    }

    @Override
    @Transactional(readOnly = true)
    public List<TeacherExamQuestionCandidateView> getReplacementCandidates(
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
    ) {
        int max = limit == null || limit <= 0 ? 50 : Math.min(limit, 200);
        List<QuestionBankItem> matched = loadMatchedQuestions(bookVersion, grade, semester, unitCode, difficulty, knowledgeTag, questionType, keyword);
        String preferredSourceFile = resolvePreferredSourceFile(currentQuestionId, currentGroupId);
        if (preferredSourceFile != null) {
            List<QuestionBankItem> sameSource = matched.stream()
                    .filter(row -> preferredSourceFile.equalsIgnoreCase(safe(row.getSourceFile()).trim()))
                    .toList();
            if (!sameSource.isEmpty()) matched = sameSource;
        }
        if (matched.isEmpty()) return List.of();

        boolean groupedMode = matched.stream().anyMatch(row -> row.getGroupId() != null);
        if (groupedMode) {
            List<TeacherExamQuestionCandidateView> rows = new ArrayList<>();
            for (Long groupId : matched.stream().map(QuestionBankItem::getGroupId).filter(id -> id != null).distinct().toList()) {
                if (rows.size() >= max) break;
                if (currentGroupId != null && currentGroupId.equals(groupId)) continue;
                List<QuestionBankItem> groupQuestions = questionBankItemRepository.findByGroupIdOrderByQuestionNoAscIdAsc(groupId);
                if (groupQuestions.isEmpty()) continue;
                QuestionBankItem first = groupQuestions.get(0);
                QuestionBankGroup group = questionBankGroupRepository.findById(groupId).orElse(null);
                TeacherExamQuestionCandidateView view = new TeacherExamQuestionCandidateView();
                view.setItemType("group");
                view.setGroupId(groupId);
                view.setQuestionType(first.getQuestionType());
                view.setLabel((group == null ? first.getQuestionType() : blankToNull(group.getSharedStem())) != null
                        ? safe(group == null ? null : group.getSharedStem())
                        : safe(first.getStem()));
                view.setStem(first.getStem());
                view.setSharedStem(group == null ? null : group.getSharedStem());
                view.setMaterial(group == null ? null : group.getMaterial());
                view.setQuestionCount(groupQuestions.size());
                view.setBookVersion(first.getBookVersion());
                view.setGrade(first.getGrade());
                view.setSemester(first.getSemester());
                view.setUnitCode(first.getUnitCode());
                view.setSourceFile(first.getSourceFile());
                rows.add(view);
            }
            return rows;
        }

        return matched.stream()
                .filter(row -> currentQuestionId == null || !currentQuestionId.equals(row.getId()))
                .limit(max)
                .map(row -> {
                    TeacherExamQuestionCandidateView view = new TeacherExamQuestionCandidateView();
                    view.setItemType("question");
                    view.setQuestionId(row.getId());
                    view.setGroupId(row.getGroupId());
                    view.setQuestionType(row.getQuestionType());
                    view.setLabel(safe(row.getStem()));
                    view.setStem(row.getStem());
                    if (row.getGroupId() != null) {
                        questionBankGroupRepository.findById(row.getGroupId()).ifPresent(group -> {
                            view.setSharedStem(group.getSharedStem());
                            view.setMaterial(group.getMaterial());
                        });
                    }
                    view.setQuestionCount(1);
                    view.setBookVersion(row.getBookVersion());
                    view.setGrade(row.getGrade());
                    view.setSemester(row.getSemester());
                    view.setUnitCode(row.getUnitCode());
                    view.setSourceFile(row.getSourceFile());
                    return view;
                })
                .toList();
    }

    @Override
    @Transactional
    public void deletePaper(Long paperId) {
        requirePaper(paperId);
        sectionItemRepository.deleteByPaperId(paperId);
        sectionRepository.deleteByPaperId(paperId);
        paperRepository.deleteById(paperId);
    }

    private TeacherExamPaper requirePaper(Long paperId) {
        return paperRepository.findById(paperId)
                .orElseThrow(() -> new RuntimeException("Teacher exam paper not found"));
    }

    private TeacherExamPaperListItemView toListItem(TeacherExamPaper row) {
        TeacherExamPaperListItemView view = new TeacherExamPaperListItemView();
        view.setId(row.getId());
        view.setPaperCode(row.getPaperCode());
        view.setTitle(row.getTitle());
        view.setCreatedBy(row.getCreatedBy());
        view.setStoreCode(row.getStoreCode());
        view.setBookVersion(row.getBookVersion());
        view.setGrade(row.getGrade());
        view.setSemester(row.getSemester());
        view.setUnitCode(row.getUnitCode());
        view.setDifficulty(row.getDifficulty());
        view.setKnowledgeTags(parseJson(row.getKnowledgeTagsJson()));
        view.setStatus(row.getStatus());
        view.setTotalSectionCount(row.getTotalSectionCount());
        view.setTotalQuestionCount(row.getTotalQuestionCount());
        view.setCreatedAt(row.getCreatedAt());
        view.setUpdatedAt(row.getUpdatedAt());
        return view;
    }

    private TeacherExamPaperDetailView buildDetail(TeacherExamPaper paper) {
        TeacherExamPaperDetailView view = new TeacherExamPaperDetailView();
        view.setId(paper.getId());
        view.setPaperCode(paper.getPaperCode());
        view.setTitle(paper.getTitle());
        view.setCreatedBy(paper.getCreatedBy());
        view.setStoreCode(paper.getStoreCode());
        view.setBookVersion(paper.getBookVersion());
        view.setGrade(paper.getGrade());
        view.setSemester(paper.getSemester());
        view.setUnitCode(paper.getUnitCode());
        view.setDifficulty(paper.getDifficulty());
        view.setKnowledgeTags(parseJson(paper.getKnowledgeTagsJson()));
        view.setStatus(paper.getStatus());
        view.setTotalSectionCount(paper.getTotalSectionCount());
        view.setTotalQuestionCount(paper.getTotalQuestionCount());
        view.setCreatedAt(paper.getCreatedAt());
        view.setUpdatedAt(paper.getUpdatedAt());

        Map<Long, List<TeacherExamSectionItem>> itemMap = sectionItemRepository.findByPaperIdOrderBySectionIdAscSortOrderAscIdAsc(paper.getId())
                .stream()
                .collect(Collectors.groupingBy(TeacherExamSectionItem::getSectionId, LinkedHashMap::new, Collectors.toList()));
        for (TeacherExamSection section : sectionRepository.findByPaperIdOrderBySectionNoAscIdAsc(paper.getId())) {
            TeacherExamPaperSectionView sectionView = new TeacherExamPaperSectionView();
            sectionView.setId(section.getId());
            sectionView.setSectionNo(section.getSectionNo());
            sectionView.setSectionTitle(section.getSectionTitle());
            sectionView.setQuestionType(section.getQuestionType());
            sectionView.setRequestedCount(section.getRequestedCount());
            sectionView.setActualCount(section.getActualCount());
            sectionView.setItemType(section.getItemType());
            for (TeacherExamSectionItem item : itemMap.getOrDefault(section.getId(), List.of())) {
                TeacherExamPaperSectionItemView itemView = new TeacherExamPaperSectionItemView();
                itemView.setId(item.getId());
                itemView.setSortOrder(item.getSortOrder());
                itemView.setItemType(item.getItemType());
                itemView.setQuestionId(item.getQuestionId());
                itemView.setGroupId(item.getGroupId());
                itemView.setSnapshot(parseJson(item.getSnapshotJson()));
                sectionView.getItems().add(itemView);
            }
            view.getSections().add(sectionView);
        }
        return view;
    }

    private void refreshPaperQuestionCount(TeacherExamPaper paper) {
        int totalQuestionCount = 0;
        for (TeacherExamSectionItem item : sectionItemRepository.findByPaperIdOrderBySectionIdAscSortOrderAscIdAsc(paper.getId())) {
            Object snapshot = parseJson(item.getSnapshotJson());
            if (snapshot instanceof Map<?, ?> map) {
                Object count = map.get("questionCount");
                if (count instanceof Number number) totalQuestionCount += number.intValue();
                else totalQuestionCount += 1;
            } else {
                totalQuestionCount += 1;
            }
        }
        paper.setTotalQuestionCount(totalQuestionCount);
        paperRepository.save(paper);
    }

    private void normalizeSectionItems(TeacherExamSection section) {
        List<TeacherExamSectionItem> items = sectionItemRepository.findBySectionIdOrderBySortOrderAscIdAsc(section.getId());
        for (int index = 0; index < items.size(); index += 1) {
            TeacherExamSectionItem item = items.get(index);
            int sortOrder = index + 1;
            if (item.getSortOrder() == null || item.getSortOrder() != sortOrder) {
                item.setSortOrder(sortOrder);
                sectionItemRepository.save(item);
            }
        }
        section.setActualCount(items.size());
        sectionRepository.save(section);
    }

    private List<QuestionBankItem> loadMatchedQuestions(
            String bookVersion,
            String grade,
            String semester,
            String unitCode,
            String difficulty,
            String knowledgeTag,
            String questionType,
            String keyword
    ) {
        Specification<QuestionBankItem> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            predicates.add(root.get("status").in(List.of("active", "draft")));
            predicates.add(cb.equal(root.get("questionType"), requireText(questionType, "questionType is required")));
            addEquals(predicates, cb, root.get("grade"), grade);
            addEquals(predicates, cb, root.get("difficulty"), difficulty);
            if (!safe(knowledgeTag).isBlank()) {
                predicates.add(cb.like(cb.lower(root.get("knowledgeTagsJson")), "%" + knowledgeTag.trim().toLowerCase(Locale.ROOT) + "%"));
            }
            if (!safe(keyword).isBlank()) {
                String pattern = "%" + keyword.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.or(
                        cb.like(cb.lower(root.get("stem")), pattern),
                        cb.like(cb.lower(root.get("remarks")), pattern)
                ));
            }
            query.orderBy(cb.asc(root.get("groupId")), cb.asc(root.get("questionNo")), cb.asc(root.get("id")));
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        return questionBankItemRepository.findAll(spec).stream()
                .filter(item -> matchesNormalizedScope(item, bookVersion, semester, unitCode))
                .toList();
    }

    private boolean matchesNormalizedScope(QuestionBankItem item, String bookVersion, String semester, String unitCode) {
        if (!safe(bookVersion).isBlank()) {
            String normalizedExpectedBook = normalizeBookVersion(bookVersion);
            String normalizedActualBook = normalizeBookVersion(item.getBookVersion());
            if (!normalizedExpectedBook.equalsIgnoreCase(normalizedActualBook)) return false;
        }
        if (!safe(semester).isBlank()) {
            String normalizedExpectedSemester = normalizeSemester(semester);
            String normalizedActualSemester = normalizeSemester(item.getSemester());
            if (!normalizedExpectedSemester.equalsIgnoreCase(normalizedActualSemester)) return false;
        }
        if (!safe(unitCode).isBlank()) {
            String normalizedExpectedUnit = normalizeUnitCode(unitCode);
            String normalizedActualUnit = normalizeUnitCode(item.getUnitCode());
            if (!normalizedExpectedUnit.equalsIgnoreCase(normalizedActualUnit)) return false;
        }
        return true;
    }

    private Map<String, Object> buildQuestionSnapshot(QuestionBankItem question) {
        QuestionBankGroup group = question.getGroupId() == null ? null : questionBankGroupRepository.findById(question.getGroupId()).orElse(null);
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("itemType", "question");
        snapshot.put("questionCount", 1);
        snapshot.put("questionId", question.getId());
        snapshot.put("questionUid", question.getQuestionUid());
        snapshot.put("questionType", question.getQuestionType());
        snapshot.put("questionNo", question.getQuestionNo());
        snapshot.put("stem", question.getStem());
        snapshot.put("answer", parseJson(question.getAnswerJson()));
        snapshot.put("analysis", question.getAnalysis());
        snapshot.put("difficulty", question.getDifficulty());
        snapshot.put("bookVersion", question.getBookVersion());
        snapshot.put("grade", question.getGrade());
        snapshot.put("semester", question.getSemester());
        snapshot.put("unitCode", question.getUnitCode());
        snapshot.put("sourceFile", question.getSourceFile());
        snapshot.put("sourceType", question.getSourceType());
        snapshot.put("sharedStem", group == null ? null : group.getSharedStem());
        snapshot.put("material", group == null ? null : group.getMaterial());
        snapshot.put("options", questionBankOptionRepository.findByQuestionIdOrderBySortOrderAscIdAsc(question.getId()).stream()
                .sorted(Comparator.comparing(QuestionBankOption::getSortOrder, Comparator.nullsLast(Integer::compareTo)))
                .map(option -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("key", option.getOptionKey());
                    row.put("text", option.getOptionText());
                    row.put("sortOrder", option.getSortOrder());
                    return row;
                })
                .toList());
        return snapshot;
    }

    private Map<String, Object> buildGroupSnapshot(Long groupId, List<QuestionBankItem> questions) {
        QuestionBankGroup group = questionBankGroupRepository.findById(groupId)
                .orElseThrow(() -> new RuntimeException("Question group not found"));
        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("itemType", "group");
        snapshot.put("groupId", group.getId());
        snapshot.put("groupUid", group.getGroupUid());
        snapshot.put("questionType", group.getQuestionType());
        snapshot.put("sharedStem", group.getSharedStem());
        snapshot.put("material", group.getMaterial());
        snapshot.put("bookVersion", group.getBookVersion());
        snapshot.put("grade", group.getGrade());
        snapshot.put("semester", group.getSemester());
        snapshot.put("unitCode", group.getUnitCode());
        snapshot.put("sourceFile", questions.stream()
                .map(QuestionBankItem::getSourceFile)
                .map(this::blankToNull)
                .filter(value -> value != null)
                .findFirst()
                .orElse(null));
        snapshot.put("questionCount", questions.size());
        snapshot.put("questions", questions.stream().map(this::buildQuestionSnapshot).toList());
        return snapshot;
    }

    private void ensureSameQuestionType(String expected, String actual) {
        if (!safe(expected).trim().equalsIgnoreCase(safe(actual).trim())) {
            throw new RuntimeException("Replacement questionType mismatch");
        }
    }

    private void addEquals(List<Predicate> predicates, jakarta.persistence.criteria.CriteriaBuilder cb, jakarta.persistence.criteria.Path<String> path, String value) {
        if (!safe(value).isBlank()) predicates.add(cb.equal(path, value.trim()));
    }

    private String resolvePaperTitle(String title) {
        String text = blankToNull(title);
        if (text != null) return text;
        LocalDate now = LocalDate.now();
        return now + "教师试卷";
    }

    private String resolveSectionTitle(TeacherExamSectionConfigRequest request, int sectionNo) {
        String title = blankToNull(request == null ? null : request.getSectionTitle());
        if (title != null) return title;
        return "第" + sectionNo + "部分";
    }

    private String resolvePreferredSourceFile(Long currentQuestionId, Long currentGroupId) {
        if (currentQuestionId != null) {
            return questionBankItemRepository.findById(currentQuestionId)
                    .map(QuestionBankItem::getSourceFile)
                    .map(this::blankToNull)
                    .orElse(null);
        }
        if (currentGroupId != null) {
            return questionBankItemRepository.findByGroupIdOrderByQuestionNoAscIdAsc(currentGroupId).stream()
                    .map(QuestionBankItem::getSourceFile)
                    .map(this::blankToNull)
                    .filter(value -> value != null)
                    .findFirst()
                    .orElse(null);
        }
        return null;
    }
    private String requireText(String value, String message) {
        String text = blankToNull(value);
        if (text == null) throw new RuntimeException(message);
        return text;
    }

    private String blankToNull(String value) {
        String text = safe(value).trim();
        return text.isEmpty() ? null : text;
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private String safeStoreCode(String value) {
        return blankToNull(value) == null ? "UNASSIGNED" : value.trim();
    }

    private String normalizeBookVersion(String value) {
        String text = blankToNull(value);
        if (text == null) return null;
        String normalized = text.replaceAll("\\s+", "");
        if ("pep".equalsIgnoreCase(normalized) || normalized.contains("人教")) {
            return "人教版初中";
        }
        return text.trim();
    }

    private String normalizeSemester(String value) {
        String text = blankToNull(value);
        if (text == null) return null;
        String normalized = text.replaceAll("\\s+", "");
        if (normalized.contains("上")) return "上册";
        if (normalized.contains("下")) return "下册";
        return text.trim();
    }
    private String normalizeUnitCode(String value) {
        String text = blankToNull(value);
        if (text == null) return null;
        String compact = text.replaceAll("\\s+", "");
        if (compact.toLowerCase(Locale.ROOT).startsWith("unit")) {
            return "Unit " + compact.substring(4);
        }
        return text.trim();
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize json");
        }
    }

    private Object parseJson(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, Object.class);
        } catch (Exception e) {
            return json;
        }
    }
}


