package com.kineticscholar.userservice.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kineticscholar.userservice.model.Passage;
import com.kineticscholar.userservice.model.PassageSentence;
import com.kineticscholar.userservice.repository.PassageRepository;
import com.kineticscholar.userservice.repository.TextbookScopeTagRepository;
import com.kineticscholar.userservice.repository.TextbookVersionTagRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;

@RestController
@RequestMapping("/api/lexicon/passages")
public class PassageController {

    private static final String PASSAGE = "passage";

    @Autowired
    private PassageRepository passageRepository;
    @Autowired
    private TextbookScopeTagRepository textbookScopeTagRepository;
    @Autowired
    private TextbookVersionTagRepository textbookVersionTagRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @GetMapping
    public ResponseEntity<?> getPassages(
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester
    ) {
        try {
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);
            List<Passage> rows = passageRepository.findByBookVersionAndGradeAndSemesterOrderByUnitNameAscSectionAscLabelAscIdAsc(
                    bv, g, s
            );

            Set<String> units = new TreeSet<>(this::compareUnit);
            List<Map<String, Object>> items = new ArrayList<>();
            for (Passage passage : rows) {
                units.add(safeStr(passage.getUnitName()));
                items.add(toPassageResponse(passage));
            }

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("file", "db://passages");
            data.put("units", new ArrayList<>(units));
            data.put("items", items);
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/count")
    public ResponseEntity<?> getPassagesCount(
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester
    ) {
        try {
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);
            long count = passageRepository.countByBookVersionAndGradeAndSemester(bv, g, s);
            return new ResponseEntity<>(Map.of(
                    "bookVersion", bv,
                    "grade", g,
                    "semester", s,
                    "count", count
            ), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping
    @Transactional
    public ResponseEntity<?> createPassage(@RequestBody Map<String, Object> payload) {
        try {
            String bv = safeStr(payload.get("book_version"));
            String g = safeStr(payload.get("grade"));
            String s = normalizeSemesterTag(payload.get("semester"));
            ensureScopeExists(bv, g, s);

            Passage passage = mapToPassageEntity(payload, bv, g, s, false);
            Passage saved = passageRepository.save(passage);
            return new ResponseEntity<>(Map.of(
                    "message", "created",
                    "item", toPassageResponse(saved)
            ), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PutMapping("/{passageUid}")
    @Transactional
    public ResponseEntity<?> updatePassage(
            @PathVariable("passageUid") String passageUid,
            @RequestBody Map<String, Object> payload
    ) {
        try {
            String uid = safeStr(passageUid);
            Passage existing = passageRepository.findByPassageUid(uid)
                    .orElseThrow(() -> new RuntimeException("课文不存在"));

            String bv = safeStr(payload.get("book_version"));
            if (bv.isBlank()) bv = safeStr(existing.getBookVersion());
            String g = safeStr(payload.get("grade"));
            if (g.isBlank()) g = safeStr(existing.getGrade());
            String s = normalizeSemesterTag(payload.get("semester"));
            if (s.isBlank()) s = normalizeSemesterTag(existing.getSemester());
            ensureScopeExists(bv, g, s);

            applyPassagePatch(existing, payload, bv, g, s);
            Passage saved = passageRepository.save(existing);
            return new ResponseEntity<>(Map.of(
                    "message", "updated",
                    "item", toPassageResponse(saved)
            ), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @DeleteMapping("/{passageUid}")
    @Transactional
    public ResponseEntity<?> deletePassage(@PathVariable("passageUid") String passageUid) {
        try {
            String uid = safeStr(passageUid);
            Passage existing = passageRepository.findByPassageUid(uid)
                    .orElseThrow(() -> new RuntimeException("课文不存在"));
            passageRepository.delete(existing);
            return new ResponseEntity<>(Map.of("message", "deleted", "passageUid", uid), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @DeleteMapping("/scope")
    @Transactional
    public ResponseEntity<?> deleteScopePassages(
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester
    ) {
        try {
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);
            long count = passageRepository.countByBookVersionAndGradeAndSemester(bv, g, s);
            if (count <= 0) {
                return new ResponseEntity<>(Map.of(
                        "message", "当前范围没有可删除课文",
                        "bookVersion", bv,
                        "grade", g,
                        "semester", s,
                        "count", 0
                ), HttpStatus.OK);
            }
            passageRepository.deleteByBookVersionAndGradeAndSemester(bv, g, s);
            return new ResponseEntity<>(Map.of(
                    "message", "deleted",
                    "bookVersion", bv,
                    "grade", g,
                    "semester", s,
                    "count", count
            ), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping("/import")
    @Transactional
    public ResponseEntity<?> importPassageJsonl(
            @RequestParam("file") MultipartFile file,
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester,
            @RequestParam(value = "overwrite", defaultValue = "false") boolean overwrite
    ) {
        try {
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);
            ensureScopeExists(bv, g, s);

            long exists = passageRepository.countByBookVersionAndGradeAndSemester(bv, g, s);
            if (exists > 0 && !overwrite) {
                return new ResponseEntity<>(Map.of(
                        "error", "该教材范围已有课文数据，请先删除后导入",
                        "count", exists
                ), HttpStatus.CONFLICT);
            }
            if (exists > 0) {
                passageRepository.deleteByBookVersionAndGradeAndSemester(bv, g, s);
            }

            ParseResult parsed = parseJsonl(file, bv, g, s);
            passageRepository.saveAll(parsed.rows());

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("message", "imported");
            data.put("count", parsed.rows().size());
            data.put("bookVersion", bv);
            data.put("grade", g);
            data.put("semester", s);
            data.put("lineCount", parsed.lineCount());
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    private ParseResult parseJsonl(MultipartFile file, String bookVersion, String grade, String semester) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new RuntimeException("文件不能为空");
        }
        List<Passage> rows = new ArrayList<>();
        int lineCount = 0;
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                lineCount += 1;
                line = stripBom(line);
                if (line.isBlank()) continue;
                Map<String, Object> raw = objectMapper.readValue(line, new TypeReference<>() {});
                Passage row = mapToPassageEntity(raw, bookVersion, grade, semester, true);
                rows.add(row);
            }
        }
        return new ParseResult(rows, lineCount);
    }

    private String stripBom(String value) {
        if (value == null || value.isEmpty()) return value;
        return value.charAt(0) == '\uFEFF' ? value.substring(1) : value;
    }

    private Passage mapToPassageEntity(
            Map<String, Object> item,
            String bookVersion,
            String grade,
            String semester,
            boolean importMode
    ) {
        Passage passage = new Passage();
        passage.setPassageUid(resolvePassageUid(item));
        passage.setType(PASSAGE);
        passage.setUnitName(safeStr(item.get("unit")).isBlank() ? "Unit 1" : safeStr(item.get("unit")));
        passage.setUnitNo(parsePositiveInt(item.get("unit_no")));
        passage.setStarter(parseBoolean(item.get("is_starter")));
        passage.setSection(safeStr(item.get("section")).isBlank() ? "A" : safeStr(item.get("section")));
        passage.setLabel(safeStr(item.get("label")).isBlank() ? "1a" : safeStr(item.get("label")));
        passage.setLabelsText(writeStringList(item.get("labels")));
        passage.setDisplayLabel(safeStr(item.get("display_label")));
        passage.setTaskKind(safeStr(item.get("task_kind")));
        passage.setTargetId(resolveTargetId(item, passage.getUnitName(), passage.getSection(), passage.getLabel()));
        passage.setTitle(safeStr(item.get("title")));
        passage.setPassageTextEn(safeStr(item.get("passage_text")));
        if (passage.getPassageTextEn().isBlank()) {
            throw new RuntimeException("课文英文内容不能为空");
        }
        passage.setSourcePages(joinSourcePages(item.get("source_pages")));
        passage.setMatchedLabelsText(writeStringList(item.get("matched_labels")));
        passage.setSourceLine(parsePositiveInt(item.get("source_line")));
        passage.setRawScopeLine(safeStrKeepNewline(item.get("raw_scope_line")));
        passage.setBookVersion(bookVersion);
        passage.setGrade(grade);
        passage.setSemester(semester);
        passage.setSourceFile(importMode ? safeStr(item.get("_source_file")) : safeStr(item.get("source_file")));

        List<PassageSentence> sentences = parseSentences(item.get("sentences"), passage);
        if (sentences.isEmpty()) {
            throw new RuntimeException("课文句子不能为空");
        }
        passage.setSentences(sentences);
        return passage;
    }

    private void applyPassagePatch(
            Passage existing,
            Map<String, Object> payload,
            String bookVersion,
            String grade,
            String semester
    ) {
        existing.setBookVersion(bookVersion);
        existing.setGrade(grade);
        existing.setSemester(semester);

        String uid = safeStr(payload.get("id"));
        if (!uid.isBlank()) existing.setPassageUid(uid);

        String unit = safeStr(payload.get("unit"));
        if (!unit.isBlank()) existing.setUnitName(unit);
        if (payload.containsKey("unit_no")) existing.setUnitNo(parsePositiveInt(payload.get("unit_no")));
        if (payload.containsKey("is_starter")) existing.setStarter(parseBoolean(payload.get("is_starter")));
        String section = safeStr(payload.get("section"));
        if (!section.isBlank()) existing.setSection(section);
        String label = safeStr(payload.get("label"));
        if (!label.isBlank()) existing.setLabel(label);
        if (payload.containsKey("labels")) existing.setLabelsText(writeStringList(payload.get("labels")));
        if (payload.containsKey("display_label")) existing.setDisplayLabel(safeStr(payload.get("display_label")));
        if (payload.containsKey("task_kind")) existing.setTaskKind(safeStr(payload.get("task_kind")));

        existing.setTargetId(resolveTargetId(payload, existing.getUnitName(), existing.getSection(), existing.getLabel()));
        existing.setTitle(safeStr(payload.get("title")));

        String passageText = safeStr(payload.get("passage_text"));
        if (!passageText.isBlank()) existing.setPassageTextEn(passageText);

        if (payload.containsKey("source_pages")) {
            existing.setSourcePages(joinSourcePages(payload.get("source_pages")));
        }
        if (payload.containsKey("matched_labels")) existing.setMatchedLabelsText(writeStringList(payload.get("matched_labels")));
        if (payload.containsKey("source_line")) existing.setSourceLine(parsePositiveInt(payload.get("source_line")));
        if (payload.containsKey("raw_scope_line")) existing.setRawScopeLine(safeStrKeepNewline(payload.get("raw_scope_line")));

        String sourceFile = safeStr(payload.get("source_file"));
        if (!sourceFile.isBlank()) existing.setSourceFile(sourceFile);

        if (payload.containsKey("sentences")) {
            List<PassageSentence> next = parseSentences(payload.get("sentences"), existing);
            if (next.isEmpty()) throw new RuntimeException("课文句子不能为空");
            existing.getSentences().clear();
            existing.getSentences().addAll(next);
        }
    }

    private List<PassageSentence> parseSentences(Object raw, Passage passage) {
        List<PassageSentence> rows = new ArrayList<>();
        if (!(raw instanceof List<?> list)) return rows;
        String passageText = safeStrKeepNewline(passage.getPassageTextEn()).replace("\r\n", "\n");
        int searchCursor = 0;
        List<SentenceSpan> spans = new ArrayList<>();
        List<Integer> providedParagraphNos = new ArrayList<>();
        List<Integer> providedSentenceNos = new ArrayList<>();
        List<Integer> providedNewlineAfters = new ArrayList<>();
        List<Boolean> providedParagraphEnds = new ArrayList<>();
        int idx = 0;
        for (Object obj : list) {
            if (!(obj instanceof Map<?, ?> m)) continue;
            String en = safeStr(m.get("en"));
            String zh = safeStr(m.get("zh"));
            String audio = safeStr(m.get("audio"));
            if (en.isBlank() && zh.isBlank() && audio.isBlank()) continue;
            if (en.isBlank() || zh.isBlank()) {
                throw new RuntimeException("句子英文和译文必须一一对应且不能为空");
            }
            PassageSentence sentence = new PassageSentence();
            sentence.setPassage(passage);
            sentence.setSentenceNo(idx);
            sentence.setSentenceEn(en);
            sentence.setSentenceZh(zh);
            sentence.setSentenceAudio(audio);
            rows.add(sentence);

            int start = locateSentenceStart(passageText, en, searchCursor);
            int end = start >= 0 ? start + en.length() : -1;
            if (end > searchCursor) searchCursor = end;
            spans.add(new SentenceSpan(start, end));
            providedParagraphNos.add(parsePositiveInt(m.get("paragraph_no")));
            providedSentenceNos.add(parsePositiveInt(m.get("sentence_no_in_paragraph")));
            providedNewlineAfters.add(parseNonNegativeInt(m.get("newline_after")));
            providedParagraphEnds.add(parseNullableBool(m.get("is_paragraph_end")));
            idx += 1;
        }

        int autoParagraphNo = 1;
        int autoSentenceNo = 1;
        for (int i = 0; i < rows.size(); i += 1) {
            PassageSentence cur = rows.get(i);
            Integer providedNewlineAfter = providedNewlineAfters.get(i);
            int newlineAfter = providedNewlineAfter != null
                    ? Math.min(2, providedNewlineAfter)
                    : inferNewlineAfter(spans, passageText, i);
            cur.setNewlineAfter(newlineAfter);

            Integer paragraphNo = providedParagraphNos.get(i);
            if (paragraphNo == null) paragraphNo = autoParagraphNo;
            Integer sentenceNoInParagraph = providedSentenceNos.get(i);
            if (sentenceNoInParagraph == null) sentenceNoInParagraph = autoSentenceNo;
            cur.setParagraphNo(paragraphNo);
            cur.setSentenceNoInParagraph(sentenceNoInParagraph);

            Boolean explicitEnd = providedParagraphEnds.get(i);
            boolean computedEnd = (i == rows.size() - 1) || newlineAfter >= 2;
            cur.setParagraphEnd(explicitEnd != null ? explicitEnd : computedEnd);

            if (newlineAfter >= 2) {
                autoParagraphNo = paragraphNo + 1;
                autoSentenceNo = 1;
            } else {
                autoParagraphNo = paragraphNo;
                autoSentenceNo = sentenceNoInParagraph + 1;
            }
        }
        return rows;
    }

    private Map<String, Object> toPassageResponse(Passage p) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", safeStr(p.getPassageUid()));
        row.put("type", safeStr(p.getType()));
        row.put("unit", safeStr(p.getUnitName()));
        row.put("unit_no", p.getUnitNo());
        row.put("is_starter", p.isStarter());
        row.put("section", safeStr(p.getSection()));
        row.put("label", safeStr(p.getLabel()));
        row.put("labels", readStringList(p.getLabelsText()));
        row.put("display_label", safeStr(p.getDisplayLabel()));
        row.put("task_kind", safeStr(p.getTaskKind()));
        row.put("target_id", safeStr(p.getTargetId()));
        row.put("title", safeStr(p.getTitle()));
        row.put("passage_text", safeStr(p.getPassageTextEn()));
        row.put("source_pages", parseSourcePagesAsList(p.getSourcePages()));
        row.put("matched_labels", readStringList(p.getMatchedLabelsText()));
        row.put("source_line", p.getSourceLine());
        row.put("raw_scope_line", safeStrKeepNewline(p.getRawScopeLine()));
        row.put("book_version", safeStr(p.getBookVersion()));
        row.put("grade", safeStr(p.getGrade()));
        row.put("semester", safeStr(p.getSemester()));
        row.put("source_file", safeStr(p.getSourceFile()));

        List<Map<String, Object>> sentenceRows = new ArrayList<>();
        List<PassageSentence> ordered = new ArrayList<>(p.getSentences());
        ordered.sort(Comparator.comparingInt(s -> Optional.ofNullable(s.getSentenceNo()).orElse(0)));
        for (PassageSentence sentence : ordered) {
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("en", safeStr(sentence.getSentenceEn()));
            s.put("zh", safeStr(sentence.getSentenceZh()));
            s.put("audio", safeStr(sentence.getSentenceAudio()));
            s.put("paragraph_no", Optional.ofNullable(sentence.getParagraphNo()).orElse(1));
            s.put("sentence_no_in_paragraph", Optional.ofNullable(sentence.getSentenceNoInParagraph()).orElse(1));
            s.put("newline_after", Optional.ofNullable(sentence.getNewlineAfter()).orElse(0));
            s.put("is_paragraph_end", Boolean.TRUE.equals(sentence.getParagraphEnd()));
            sentenceRows.add(s);
        }
        row.put("sentences", sentenceRows);
        row.put("sentence_count", sentenceRows.size());
        return row;
    }

    private String resolvePassageUid(Map<String, Object> item) {
        String uid = safeStr(item.get("id"));
        if (!uid.isBlank()) return uid;
        return UUID.randomUUID().toString().replace("-", "").substring(0, 12);
    }

    private String resolveTargetId(Map<String, Object> item, String unit, String section, String label) {
        String targetId = safeStr(item.get("target_id"));
        if (!targetId.isBlank()) return targetId;
        return String.format("%s Section %s %s", safeStr(unit), safeStr(section), safeStr(label)).trim();
    }

    private List<Integer> parseSourcePagesAsList(String sourcePages) {
        String raw = safeStr(sourcePages);
        if (raw.isBlank()) return List.of();
        List<Integer> pages = new ArrayList<>();
        for (String part : raw.split(",")) {
            String s = safeStr(part);
            if (s.isBlank()) continue;
            try {
                pages.add(Integer.parseInt(s));
            } catch (Exception ignore) {
                // ignore bad page token
            }
        }
        return pages;
    }

    private String joinSourcePages(Object raw) {
        if (!(raw instanceof List<?> list)) return "";
        List<String> pages = new ArrayList<>();
        for (Object page : list) {
            String p = safeStr(page);
            if (p.isBlank()) continue;
            pages.add(p);
        }
        return String.join(",", pages);
    }

    private void ensureScopeExists(String bookVersion, String grade, String semester) {
        if (safeStr(bookVersion).isBlank() || safeStr(grade).isBlank() || safeStr(semester).isBlank()) {
            throw new RuntimeException("教材版本、年级、册数不能为空");
        }
        if (!textbookVersionTagRepository.existsByName(bookVersion)) {
            throw new RuntimeException("教材版本不存在: " + bookVersion);
        }
        if (!textbookScopeTagRepository.existsByTextbookVersionAndGradeAndSemester(bookVersion, grade, semester)) {
            throw new RuntimeException("该教材/年级/册数组合未在教材管理中配置");
        }
    }

    private String normalizeSemesterTag(Object value) {
        String s = safeStr(value);
        if (s.equals("全一册") || s.equals("全册")) return "全册";
        return s;
    }

    private int compareUnit(String a, String b) {
        Integer an = parseUnitNo(a);
        Integer bn = parseUnitNo(b);
        if (an != null && bn != null) return Integer.compare(an, bn);
        return a.compareToIgnoreCase(b);
    }

    private Integer parseUnitNo(String unit) {
        String s = safeStr(unit);
        if (s.isBlank()) return null;
        String digits = s.replaceAll("[^0-9]", "");
        if (digits.isBlank()) return null;
        try {
            return Integer.parseInt(digits);
        } catch (Exception e) {
            return null;
        }
    }

    private int locateSentenceStart(String passageText, String sentence, int fromCursor) {
        String target = sentence == null ? "" : sentence.trim();
        if (target.isBlank()) return -1;
        int from = Math.max(0, Math.min(fromCursor, passageText.length()));
        int at = passageText.indexOf(target, from);
        if (at >= 0) return at;
        return passageText.indexOf(target);
    }

    private int inferNewlineAfter(List<SentenceSpan> spans, String passageText, int idx) {
        if (idx >= spans.size() - 1) return 0;
        SentenceSpan cur = spans.get(idx);
        SentenceSpan next = spans.get(idx + 1);
        if (cur.end() < 0 || next.start() < 0 || next.start() < cur.end()) return 0;
        String gap = passageText.substring(cur.end(), next.start());
        if (gap.contains("\n\n")) return 2;
        if (gap.contains("\n")) return 1;
        return 0;
    }

    private Integer parsePositiveInt(Object value) {
        try {
            if (value == null) return null;
            int v = Integer.parseInt(String.valueOf(value).trim());
            return v > 0 ? v : null;
        } catch (Exception e) {
            return null;
        }
    }

    private Integer parseNonNegativeInt(Object value) {
        try {
            if (value == null) return null;
            int v = Integer.parseInt(String.valueOf(value).trim());
            return v >= 0 ? v : null;
        } catch (Exception e) {
            return null;
        }
    }

    private Boolean parseNullableBool(Object value) {
        if (value == null) return null;
        if (value instanceof Boolean b) return b;
        String s = String.valueOf(value).trim().toLowerCase(Locale.ROOT);
        if ("true".equals(s) || "1".equals(s)) return true;
        if ("false".equals(s) || "0".equals(s)) return false;
        return null;
    }

    private boolean parseBoolean(Object value) {
        Boolean parsed = parseNullableBool(value);
        return parsed != null && parsed;
    }

    private String writeStringList(Object value) {
        if (!(value instanceof List<?> list)) return "";
        List<String> rows = new ArrayList<>();
        for (Object item : list) {
            String s = safeStr(item);
            if (!s.isBlank()) rows.add(s);
        }
        if (rows.isEmpty()) return "";
        try {
            return objectMapper.writeValueAsString(rows);
        } catch (Exception e) {
            throw new RuntimeException("failed to serialize string list");
        }
    }

    private List<String> readStringList(String raw) {
        String text = safeStr(raw);
        if (text.isBlank()) return List.of();
        try {
            return objectMapper.readValue(text, new TypeReference<>() {});
        } catch (Exception e) {
            return List.of();
        }
    }

    private String safeStrKeepNewline(Object value) {
        return value == null ? "" : String.valueOf(value);
    }

    private String safeStr(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private record SentenceSpan(int start, int end) {}
    private record ParseResult(List<Passage> rows, int lineCount) {}
}
