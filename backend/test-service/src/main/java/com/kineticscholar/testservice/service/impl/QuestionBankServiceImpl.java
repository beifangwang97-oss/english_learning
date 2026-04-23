package com.kineticscholar.testservice.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kineticscholar.testservice.dto.QuestionBankImportBatchView;
import com.kineticscholar.testservice.dto.QuestionBankImportResult;
import com.kineticscholar.testservice.dto.QuestionBankOptionPayload;
import com.kineticscholar.testservice.dto.QuestionBankOptionView;
import com.kineticscholar.testservice.dto.QuestionBankQuestionDetailView;
import com.kineticscholar.testservice.dto.QuestionBankQuestionSummaryView;
import com.kineticscholar.testservice.dto.QuestionBankQuestionUpdateRequest;
import com.kineticscholar.testservice.model.QuestionBankGroup;
import com.kineticscholar.testservice.model.QuestionBankImportBatch;
import com.kineticscholar.testservice.model.QuestionBankItem;
import com.kineticscholar.testservice.model.QuestionBankOption;
import com.kineticscholar.testservice.repository.QuestionBankGroupRepository;
import com.kineticscholar.testservice.repository.QuestionBankImportBatchRepository;
import com.kineticscholar.testservice.repository.QuestionBankItemRepository;
import com.kineticscholar.testservice.repository.QuestionBankOptionRepository;
import com.kineticscholar.testservice.service.QuestionBankService;
import jakarta.persistence.criteria.Predicate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
public class QuestionBankServiceImpl implements QuestionBankService {

    @Autowired
    private QuestionBankImportBatchRepository importBatchRepository;

    @Autowired
    private QuestionBankGroupRepository groupRepository;

    @Autowired
    private QuestionBankItemRepository itemRepository;

    @Autowired
    private QuestionBankOptionRepository optionRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Override
    @Transactional
    public QuestionBankImportResult importJsonl(
            MultipartFile file,
            String bookVersion,
            String grade,
            String semester,
            String unitCode,
            String sourceType,
            String overwriteMode,
            Long createdBy
    ) {
        String bv = requireText(bookVersion, "bookVersion is required");
        String g = requireText(grade, "grade is required");
        String s = requireText(semester, "semester is required");
        String st = safe(sourceType);
        if (st.isBlank()) st = "question_bank";
        String overwrite = safe(overwriteMode);
        if (!"skip_existing".equals(overwrite) && !"overwrite_existing".equals(overwrite)) {
            overwrite = "overwrite_existing";
        }
        if (file == null || file.isEmpty()) {
            throw new RuntimeException("file is required");
        }

        QuestionBankImportBatch batch = new QuestionBankImportBatch();
        batch.setBatchCode("qb_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
        batch.setSourceType(st);
        batch.setSourceFile(file.getOriginalFilename());
        batch.setBookVersion(bv);
        batch.setGrade(g);
        batch.setSemester(s);
        batch.setUnitCode(blankToNull(unitCode));
        batch.setImportStatus("processing");
        batch.setOverwriteMode(overwrite);
        batch.setCreatedBy(createdBy);
        batch = importBatchRepository.save(batch);

        QuestionBankImportResult result = new QuestionBankImportResult();
        result.setBatchId(batch.getId());
        result.setBatchCode(batch.getBatchCode());
        result.setTotalCount(0);
        result.setSuccessCount(0);
        result.setFailedCount(0);
        result.setCreatedCount(0);
        result.setUpdatedCount(0);
        result.setSkippedCount(0);

        Map<String, QuestionBankGroup> groupCache = new HashMap<>();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            int lineNo = 0;
            while ((line = reader.readLine()) != null) {
                lineNo += 1;
                if (line == null || line.trim().isEmpty()) continue;
                result.setTotalCount(result.getTotalCount() + 1);
                try {
                    JsonNode root = objectMapper.readTree(line);
                    upsertQuestion(root, batch, groupCache, overwrite, createdBy);
                    result.setSuccessCount(result.getSuccessCount() + 1);
                } catch (SkipImportException e) {
                    result.setSkippedCount(result.getSkippedCount() + 1);
                    appendError(result, "Line " + lineNo + ": " + e.getMessage());
                } catch (Exception e) {
                    result.setFailedCount(result.getFailedCount() + 1);
                    appendError(result, "Line " + lineNo + ": " + e.getMessage());
                }
            }
        } catch (IOException e) {
            throw new RuntimeException("Failed to read jsonl file", e);
        }

        batch.setTotalCount(result.getTotalCount());
        batch.setSuccessCount(result.getSuccessCount());
        batch.setFailedCount(result.getFailedCount());
        if (result.getTotalCount() == 0) batch.setImportStatus("failed");
        else if (result.getFailedCount() == 0) batch.setImportStatus("completed");
        else if (result.getSuccessCount() == 0) batch.setImportStatus("failed");
        else batch.setImportStatus("partial_failed");
        importBatchRepository.save(batch);

        return result;
    }

    private void upsertQuestion(
            JsonNode root,
            QuestionBankImportBatch batch,
            Map<String, QuestionBankGroup> groupCache,
            String overwriteMode,
            Long createdBy
    ) {
        String questionUid = requireNodeText(root, "question_uid", "question_uid is required");
        String questionType = requireNodeText(root, "question_type", "question_type is required");
        String bookVersion = defaultIfBlank(nodeText(root, "book_version"), batch.getBookVersion());
        String grade = defaultIfBlank(nodeText(root, "grade"), batch.getGrade());
        String semester = defaultIfBlank(nodeText(root, "semester"), batch.getSemester());
        String unitCode = defaultIfBlank(nodeText(root, "unit"), batch.getUnitCode());
        String stem = blankToNull(nodeText(root, "stem"));
        String sharedStem = blankToNull(nodeText(root, "shared_stem"));
        String material = blankToNull(nodeText(root, "material"));
        if (stem == null && sharedStem == null && material == null) {
            throw new RuntimeException("stem/shared_stem/material cannot all be empty");
        }

        JsonNode answerNode = root.get("answer");
        if (answerNode == null || answerNode.isNull()) {
            throw new RuntimeException("answer is required");
        }
        String answerJson = writeJson(answerNode);

        JsonNode optionsNode = root.get("options");
        List<QuestionBankOptionPayload> optionPayloads = parseOptionPayloads(optionsNode);
        if (requiresOptions(questionType) && optionPayloads.isEmpty()) {
            throw new RuntimeException("options is required for question_type=" + questionType);
        }

        Optional<QuestionBankItem> existingOpt = itemRepository.findByQuestionUid(questionUid);
        if (existingOpt.isPresent() && "skip_existing".equals(overwriteMode)) {
            throw new SkipImportException("question_uid already exists: " + questionUid);
        }

        QuestionBankGroup group = resolveGroup(root, batch, groupCache, questionType, bookVersion, grade, semester, unitCode);
        QuestionBankItem item = existingOpt.orElseGet(QuestionBankItem::new);
        item.setQuestionUid(questionUid);
        item.setBatchId(batch.getId());
        item.setGroupId(group == null ? null : group.getId());
        item.setQuestionType(questionType);
        item.setQuestionNo(root.hasNonNull("question_no") ? root.get("question_no").asInt() : null);
        item.setStem(stem);
        item.setAnswerJson(answerJson);
        item.setAnalysis(blankToNull(nodeText(root, "analysis")));
        item.setDifficulty(blankToNull(nodeText(root, "difficulty")));
        item.setKnowledgeTagsJson(root.has("knowledge_tags") ? writeJson(root.get("knowledge_tags")) : null);
        item.setSourceType(defaultIfBlank(nodeText(root, "source_type"), batch.getSourceType()));
        item.setSourceFile(defaultIfBlank(nodeText(root, "source_file"), batch.getSourceFile()));
        item.setParserVersion(blankToNull(nodeText(root, "parser_version")));
        item.setBookVersion(bookVersion);
        item.setGrade(grade);
        item.setSemester(semester);
        item.setUnitCode(unitCode);
        item.setExamScene(blankToNull(nodeText(root, "exam_scene")));
        item.setStatus(defaultIfBlank(nodeText(root, "status"), "active"));
        item.setRemarks(blankToNull(nodeText(root, "remarks")));
        item.setContentHash(sha256Hex(questionType + "|" + safe(stem) + "|" + answerJson));
        if (item.getCreatedBy() == null) item.setCreatedBy(createdBy);
        QuestionBankItem saved = itemRepository.save(item);

        optionRepository.deleteByQuestionId(saved.getId());
        if (!optionPayloads.isEmpty()) {
            List<QuestionBankOption> rows = new ArrayList<>();
            for (int i = 0; i < optionPayloads.size(); i += 1) {
                QuestionBankOptionPayload raw = optionPayloads.get(i);
                if (safe(raw.getKey()).isBlank() || safe(raw.getText()).isBlank()) continue;
                QuestionBankOption option = new QuestionBankOption();
                option.setQuestionId(saved.getId());
                option.setOptionKey(raw.getKey().trim());
                option.setOptionText(raw.getText().trim());
                option.setSortOrder(raw.getSortOrder() == null ? i : raw.getSortOrder());
                rows.add(option);
            }
            if (!rows.isEmpty()) optionRepository.saveAll(rows);
        }
    }

    private QuestionBankGroup resolveGroup(
            JsonNode root,
            QuestionBankImportBatch batch,
            Map<String, QuestionBankGroup> groupCache,
            String questionType,
            String bookVersion,
            String grade,
            String semester,
            String unitCode
    ) {
        String groupUid = blankToNull(nodeText(root, "group_uid"));
        if (groupUid == null) return null;
        QuestionBankGroup cached = groupCache.get(groupUid);
        if (cached != null) return cached;

        QuestionBankGroup group = groupRepository.findByBatchIdAndGroupUid(batch.getId(), groupUid).orElseGet(QuestionBankGroup::new);
        group.setBatchId(batch.getId());
        group.setGroupUid(groupUid);
        group.setQuestionType(questionType);
        group.setSharedStem(blankToNull(nodeText(root, "shared_stem")));
        group.setMaterial(blankToNull(nodeText(root, "material")));
        group.setBookVersion(bookVersion);
        group.setGrade(grade);
        group.setSemester(semester);
        group.setUnitCode(unitCode);
        group.setExamScene(blankToNull(nodeText(root, "exam_scene")));
        group.setStatus("active");
        QuestionBankGroup saved = groupRepository.save(group);
        groupCache.put(groupUid, saved);
        return saved;
    }

    @Override
    @Transactional(readOnly = true)
    public Page<QuestionBankImportBatchView> getImportBatches(
            String bookVersion,
            String grade,
            String semester,
            String unitCode,
            String status,
            Pageable pageable
    ) {
        return importBatchRepository.findAll((root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            addEquals(predicates, cb, root.get("bookVersion"), bookVersion);
            addEquals(predicates, cb, root.get("grade"), grade);
            addEquals(predicates, cb, root.get("semester"), semester);
            addEquals(predicates, cb, root.get("unitCode"), unitCode);
            addEquals(predicates, cb, root.get("importStatus"), status);
            return cb.and(predicates.toArray(new Predicate[0]));
        }, pageable).map(this::toBatchView);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<QuestionBankImportBatchView> getImportBatch(Long batchId) {
        return importBatchRepository.findById(batchId).map(this::toBatchView);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<QuestionBankQuestionSummaryView> getQuestions(
            String bookVersion,
            String grade,
            String semester,
            String unitCode,
            String questionType,
            String examScene,
            String status,
            String keyword,
            String sourceType,
            Long batchId,
            Pageable pageable
    ) {
        Specification<QuestionBankItem> spec = (root, query, cb) -> {
            List<Predicate> predicates = new ArrayList<>();
            addEquals(predicates, cb, root.get("bookVersion"), bookVersion);
            addEquals(predicates, cb, root.get("grade"), grade);
            addEquals(predicates, cb, root.get("semester"), semester);
            addEquals(predicates, cb, root.get("unitCode"), unitCode);
            addEquals(predicates, cb, root.get("questionType"), questionType);
            addEquals(predicates, cb, root.get("examScene"), examScene);
            addEquals(predicates, cb, root.get("status"), status);
            addEquals(predicates, cb, root.get("sourceType"), sourceType);
            if (batchId != null) {
                predicates.add(cb.equal(root.get("batchId"), batchId));
            }
            if (!safe(keyword).isBlank()) {
                String pattern = "%" + keyword.trim().toLowerCase(Locale.ROOT) + "%";
                predicates.add(cb.like(cb.lower(root.get("stem")), pattern));
            }
            return cb.and(predicates.toArray(new Predicate[0]));
        };
        return itemRepository.findAll(spec, pageable).map(this::toQuestionSummary);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<QuestionBankQuestionDetailView> getQuestionDetail(Long id) {
        return itemRepository.findById(id).map(this::toQuestionDetail);
    }

    @Override
    @Transactional
    public QuestionBankQuestionDetailView updateQuestion(Long id, QuestionBankQuestionUpdateRequest request) {
        QuestionBankItem item = itemRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Question not found"));
        if (request == null) {
            throw new RuntimeException("request is required");
        }
        if (request.getStem() != null) item.setStem(blankToNull(request.getStem()));
        if (request.getAnalysis() != null) item.setAnalysis(blankToNull(request.getAnalysis()));
        if (request.getDifficulty() != null) item.setDifficulty(blankToNull(request.getDifficulty()));
        if (request.getStatus() != null) item.setStatus(defaultIfBlank(request.getStatus(), "active"));
        if (request.getRemarks() != null) item.setRemarks(blankToNull(request.getRemarks()));
        if (request.getBookVersion() != null) item.setBookVersion(requireText(request.getBookVersion(), "bookVersion is required"));
        if (request.getGrade() != null) item.setGrade(requireText(request.getGrade(), "grade is required"));
        if (request.getSemester() != null) item.setSemester(requireText(request.getSemester(), "semester is required"));
        if (request.getUnitCode() != null) item.setUnitCode(blankToNull(request.getUnitCode()));
        if (request.getExamScene() != null) item.setExamScene(blankToNull(request.getExamScene()));
        if (request.getAnswer() != null) item.setAnswerJson(writeJson(request.getAnswer()));
        if (request.getKnowledgeTags() != null) item.setKnowledgeTagsJson(writeJson(request.getKnowledgeTags()));
        item.setContentHash(sha256Hex(item.getQuestionType() + "|" + safe(item.getStem()) + "|" + safe(item.getAnswerJson())));

        QuestionBankGroup group = item.getGroupId() == null ? null : groupRepository.findById(item.getGroupId()).orElse(null);
        if (request.getSharedStem() != null || request.getMaterial() != null) {
            if (group == null) {
                group = new QuestionBankGroup();
                group.setBatchId(item.getBatchId());
                group.setGroupUid("manual_" + UUID.randomUUID().toString().replace("-", "").substring(0, 16));
                group.setQuestionType(item.getQuestionType());
                group.setBookVersion(item.getBookVersion());
                group.setGrade(item.getGrade());
                group.setSemester(item.getSemester());
                group.setUnitCode(item.getUnitCode());
                group.setExamScene(item.getExamScene());
                group.setStatus("active");
            }
            if (request.getSharedStem() != null) group.setSharedStem(blankToNull(request.getSharedStem()));
            if (request.getMaterial() != null) group.setMaterial(blankToNull(request.getMaterial()));
            group.setBookVersion(item.getBookVersion());
            group.setGrade(item.getGrade());
            group.setSemester(item.getSemester());
            group.setUnitCode(item.getUnitCode());
            group.setExamScene(item.getExamScene());
            group = groupRepository.save(group);
            item.setGroupId(group.getId());
        }

        QuestionBankItem saved = itemRepository.save(item);
        if (request.getOptions() != null) {
            optionRepository.deleteByQuestionId(saved.getId());
            List<QuestionBankOption> rows = new ArrayList<>();
            for (int i = 0; i < request.getOptions().size(); i += 1) {
                QuestionBankOptionPayload raw = request.getOptions().get(i);
                if (raw == null || safe(raw.getKey()).isBlank() || safe(raw.getText()).isBlank()) continue;
                QuestionBankOption option = new QuestionBankOption();
                option.setQuestionId(saved.getId());
                option.setOptionKey(raw.getKey().trim());
                option.setOptionText(raw.getText().trim());
                option.setSortOrder(raw.getSortOrder() == null ? i : raw.getSortOrder());
                rows.add(option);
            }
            if (!rows.isEmpty()) optionRepository.saveAll(rows);
        }
        return toQuestionDetail(saved);
    }

    @Override
    @Transactional
    public void deleteQuestion(Long id) {
        QuestionBankItem item = itemRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Question not found"));
        Long groupId = item.getGroupId();
        optionRepository.deleteByQuestionId(id);
        itemRepository.deleteById(id);
        if (groupId != null && itemRepository.countByGroupId(groupId) == 0) {
            groupRepository.deleteById(groupId);
        }
    }

    private QuestionBankImportBatchView toBatchView(QuestionBankImportBatch row) {
        QuestionBankImportBatchView view = new QuestionBankImportBatchView();
        view.setId(row.getId());
        view.setBatchCode(row.getBatchCode());
        view.setSourceType(row.getSourceType());
        view.setSourceFile(row.getSourceFile());
        view.setParserVersion(row.getParserVersion());
        view.setBookVersion(row.getBookVersion());
        view.setGrade(row.getGrade());
        view.setSemester(row.getSemester());
        view.setUnitCode(row.getUnitCode());
        view.setImportStatus(row.getImportStatus());
        view.setOverwriteMode(row.getOverwriteMode());
        view.setTotalCount(row.getTotalCount());
        view.setSuccessCount(row.getSuccessCount());
        view.setFailedCount(row.getFailedCount());
        view.setCreatedBy(row.getCreatedBy());
        view.setCreatedAt(row.getCreatedAt());
        view.setUpdatedAt(row.getUpdatedAt());
        return view;
    }

    private QuestionBankQuestionSummaryView toQuestionSummary(QuestionBankItem row) {
        QuestionBankQuestionSummaryView view = new QuestionBankQuestionSummaryView();
        view.setId(row.getId());
        view.setQuestionUid(row.getQuestionUid());
        view.setQuestionType(row.getQuestionType());
        view.setStem(row.getStem());
        view.setBookVersion(row.getBookVersion());
        view.setGrade(row.getGrade());
        view.setSemester(row.getSemester());
        view.setUnitCode(row.getUnitCode());
        view.setExamScene(row.getExamScene());
        view.setGroupId(row.getGroupId());
        view.setStatus(row.getStatus());
        view.setSourceFile(row.getSourceFile());
        view.setUpdatedAt(row.getUpdatedAt());
        return view;
    }

    private QuestionBankQuestionDetailView toQuestionDetail(QuestionBankItem row) {
        QuestionBankQuestionDetailView view = new QuestionBankQuestionDetailView();
        view.setId(row.getId());
        view.setQuestionUid(row.getQuestionUid());
        view.setBatchId(row.getBatchId());
        view.setGroupId(row.getGroupId());
        view.setQuestionType(row.getQuestionType());
        view.setQuestionNo(row.getQuestionNo());
        view.setStem(row.getStem());
        view.setAnswerJson(row.getAnswerJson());
        view.setAnswer(parseJson(row.getAnswerJson()));
        view.setAnalysis(row.getAnalysis());
        view.setDifficulty(row.getDifficulty());
        view.setKnowledgeTagsJson(row.getKnowledgeTagsJson());
        view.setKnowledgeTags(parseJson(row.getKnowledgeTagsJson()));
        view.setSourceType(row.getSourceType());
        view.setSourceFile(row.getSourceFile());
        view.setParserVersion(row.getParserVersion());
        view.setBookVersion(row.getBookVersion());
        view.setGrade(row.getGrade());
        view.setSemester(row.getSemester());
        view.setUnitCode(row.getUnitCode());
        view.setExamScene(row.getExamScene());
        view.setStatus(row.getStatus());
        view.setRemarks(row.getRemarks());
        view.setCreatedBy(row.getCreatedBy());
        view.setCreatedAt(row.getCreatedAt());
        view.setUpdatedAt(row.getUpdatedAt());
        if (row.getGroupId() != null) {
            groupRepository.findById(row.getGroupId()).ifPresent(group -> {
                view.setGroupUid(group.getGroupUid());
                view.setSharedStem(group.getSharedStem());
                view.setMaterial(group.getMaterial());
            });
        }
        view.setOptions(optionRepository.findByQuestionIdOrderBySortOrderAscIdAsc(row.getId()).stream()
                .sorted(Comparator.comparing(QuestionBankOption::getSortOrder, Comparator.nullsLast(Integer::compareTo)))
                .map(this::toOptionView)
                .toList());
        return view;
    }

    private QuestionBankOptionView toOptionView(QuestionBankOption row) {
        QuestionBankOptionView view = new QuestionBankOptionView();
        view.setId(row.getId());
        view.setKey(row.getOptionKey());
        view.setText(row.getOptionText());
        view.setSortOrder(row.getSortOrder());
        return view;
    }

    private List<QuestionBankOptionPayload> parseOptionPayloads(JsonNode node) {
        List<QuestionBankOptionPayload> rows = new ArrayList<>();
        if (node == null || !node.isArray()) return rows;
        for (int i = 0; i < node.size(); i += 1) {
            JsonNode item = node.get(i);
            if (item == null || item.isNull()) continue;
            QuestionBankOptionPayload payload = new QuestionBankOptionPayload();
            payload.setKey(blankToNull(nodeText(item, "key")));
            payload.setText(blankToNull(nodeText(item, "text")));
            payload.setSortOrder(i);
            rows.add(payload);
        }
        return rows;
    }

    private boolean requiresOptions(String questionType) {
        String type = safe(questionType).toLowerCase(Locale.ROOT);
        return type.contains("choice") || type.contains("reading") || type.contains("cloze");
    }

    private String nodeText(JsonNode node, String field) {
        if (node == null || field == null || !node.has(field) || node.get(field).isNull()) return null;
        return safe(node.get(field).asText());
    }

    private String requireNodeText(JsonNode node, String field, String message) {
        String value = blankToNull(nodeText(node, field));
        if (value == null) throw new RuntimeException(message);
        return value;
    }

    private String writeJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize json", e);
        }
    }

    private Object parseJson(String json) {
        if (json == null || json.isBlank()) return null;
        try {
            return objectMapper.readValue(json, Object.class);
        } catch (JsonProcessingException e) {
            return json;
        }
    }

    private void addEquals(List<Predicate> predicates, jakarta.persistence.criteria.CriteriaBuilder cb, jakarta.persistence.criteria.Path<String> path, String value) {
        if (!safe(value).isBlank()) predicates.add(cb.equal(path, value.trim()));
    }

    private String requireText(String value, String message) {
        String text = blankToNull(value);
        if (text == null) throw new RuntimeException(message);
        return text;
    }

    private String defaultIfBlank(String value, String fallback) {
        return safe(value).isBlank() ? safe(fallback).trim() : value.trim();
    }

    private String blankToNull(String value) {
        String text = safe(value).trim();
        return text.isEmpty() ? null : text;
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private void appendError(QuestionBankImportResult result, String error) {
        if (result.getErrors().size() < 20) {
            result.getErrors().add(error);
        }
    }

    private String sha256Hex(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(safe(text).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            return null;
        }
    }

    private static class SkipImportException extends RuntimeException {
        private SkipImportException(String message) {
            super(message);
        }
    }
}
