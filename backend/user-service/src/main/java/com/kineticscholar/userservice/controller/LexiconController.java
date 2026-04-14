package com.kineticscholar.userservice.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kineticscholar.userservice.model.LexiconEntry;
import com.kineticscholar.userservice.model.LexiconMeaning;
import com.kineticscholar.userservice.model.Store;
import com.kineticscholar.userservice.model.TextbookScopeTag;
import com.kineticscholar.userservice.model.TextbookVersionTag;
import com.kineticscholar.userservice.model.User;
import com.kineticscholar.userservice.repository.LexiconEntryRepository;
import com.kineticscholar.userservice.repository.GradeTagRepository;
import com.kineticscholar.userservice.repository.SemesterTagRepository;
import com.kineticscholar.userservice.repository.StoreRepository;
import com.kineticscholar.userservice.repository.TextbookScopeTagRepository;
import com.kineticscholar.userservice.repository.TextbookVersionTagRepository;
import com.kineticscholar.userservice.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@RestController
@RequestMapping("/api/lexicon")
public class LexiconController {

    private static final String WORD = "word";
    private static final String PHRASE = "phrase";
    private static final Pattern SLASH_PHONETIC = Pattern.compile("/[^/]+/");
    private static final Pattern BRACKET_PHONETIC = Pattern.compile("\\[([^\\]]+)]");
    private static final List<String> DEFAULT_TEXTBOOK_GRADES = List.of(
            "三年级", "四年级", "五年级", "六年级", "七年级", "八年级", "九年级", "高一", "高二", "高三"
    );
    private static final List<String> DEFAULT_GRADE_SEMESTERS = List.of("上册", "下册");

    @Autowired
    private LexiconEntryRepository entryRepository;
    @Autowired
    private TextbookVersionTagRepository textbookVersionTagRepository;
    @Autowired
    private GradeTagRepository gradeTagRepository;
    @Autowired
    private SemesterTagRepository semesterTagRepository;
    @Autowired
    private TextbookScopeTagRepository textbookScopeTagRepository;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private StoreRepository storeRepository;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @GetMapping("/options")
    public ResponseEntity<?> getOptions(@RequestParam(value = "type", required = false) String type) {
        try {
            ensureDefaultScopesForExistingTextbooks();
            List<TextbookScopeTag> scopes = textbookScopeTagRepository.findAll();
            Set<String> scopeBooks = new TreeSet<>();
            Set<String> scopeGrades = new LinkedHashSet<>();
            Set<String> scopeSemesters = new LinkedHashSet<>();
            for (TextbookScopeTag scope : scopes) {
                String b = safeStr(scope.getTextbookVersion());
                String g = safeStr(scope.getGrade());
                String s = safeStr(scope.getSemester());
                if (!b.isBlank()) scopeBooks.add(b);
                if (!g.isBlank()) scopeGrades.add(g);
                if (!s.isBlank()) scopeSemesters.add(s);
            }

            List<String> bookVersions = !scopeBooks.isEmpty()
                    ? new ArrayList<>(scopeBooks)
                    : textbookVersionTagRepository.findAll().stream()
                    .map(TextbookVersionTag::getName)
                    .filter(v -> !safeStr(v).isBlank())
                    .sorted()
                    .toList();

            Map<String, Integer> gradeOrder = new LinkedHashMap<>();
            gradeTagRepository.findAll().forEach(g -> gradeOrder.put(
                    safeStr(g.getName()),
                    Optional.ofNullable(g.getSortOrder()).orElse(999)
            ));
            List<String> grades = !scopeGrades.isEmpty()
                    ? scopeGrades.stream()
                    .sorted(Comparator.comparingInt(g -> gradeOrder.getOrDefault(g, 999)))
                    .toList()
                    : gradeTagRepository.findAll().stream()
                    .sorted(Comparator.comparingInt(g -> Optional.ofNullable(g.getSortOrder()).orElse(999)))
                    .map(g -> g.getName())
                    .toList();

            Map<String, Integer> semesterOrder = new LinkedHashMap<>();
            semesterTagRepository.findAll().forEach(s -> semesterOrder.put(
                    safeStr(s.getName()),
                    Optional.ofNullable(s.getSortOrder()).orElse(999)
            ));
            List<String> semesters = !scopeSemesters.isEmpty()
                    ? scopeSemesters.stream()
                    .sorted(Comparator.comparingInt(s -> semesterOrder.getOrDefault(s, 999)))
                    .toList()
                    : semesterTagRepository.findAll().stream()
                    .sorted(Comparator.comparingInt(s -> Optional.ofNullable(s.getSortOrder()).orElse(999)))
                    .map(s -> s.getName())
                    .toList();
            Map<String, Object> data = new HashMap<>();
            data.put("bookVersions", bookVersions);
            data.put("grades", grades);
            data.put("semesters", semesters);
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/task-tree")
    public ResponseEntity<?> getTaskTree(
            @RequestParam(value = "bookVersions", required = false) String bookVersionsRaw,
            @RequestParam(value = "grades", required = false) String gradesRaw
    ) {
        try {
            Set<String> filterBookVersions = parseCsvQuery(bookVersionsRaw);
            Set<String> filterGrades = parseCsvQuery(gradesRaw);

            List<LexiconEntry> entries = entryRepository.findByTypeIn(List.of(WORD, PHRASE));
            Map<String, Integer> gradeOrder = new HashMap<>();
            gradeTagRepository.findAll().forEach(tag -> gradeOrder.put(
                    safeStr(tag.getName()),
                    Optional.ofNullable(tag.getSortOrder()).orElse(999)
            ));
            Map<String, Integer> semesterOrder = new HashMap<>();
            semesterTagRepository.findAll().forEach(tag -> semesterOrder.put(
                    safeStr(tag.getName()),
                    Optional.ofNullable(tag.getSortOrder()).orElse(999)
            ));

            Map<String, Map<String, Map<String, Set<String>>>> grouped = new TreeMap<>();
            for (LexiconEntry entry : entries) {
                String bv = safeStr(entry.getBookVersion());
                String grade = safeStr(entry.getGrade());
                String semester = safeStr(entry.getSemester());
                String unit = safeStr(entry.getUnit());
                if (bv.isBlank() || grade.isBlank() || semester.isBlank() || unit.isBlank()) continue;
                if (!filterBookVersions.isEmpty() && !filterBookVersions.contains(bv)) continue;
                if (!filterGrades.isEmpty() && !filterGrades.contains(grade)) continue;
                grouped
                        .computeIfAbsent(bv, k -> new HashMap<>())
                        .computeIfAbsent(grade, k -> new HashMap<>())
                        .computeIfAbsent(semester, k -> new TreeSet<>(this::compareUnit))
                        .add(unit);
            }

            List<Map<String, Object>> tree = new ArrayList<>();
            for (var bvEntry : grouped.entrySet()) {
                List<Map<String, Object>> grades = new ArrayList<>();
                var gradeEntries = new ArrayList<>(bvEntry.getValue().entrySet());
                gradeEntries.sort(Comparator.comparingInt(e -> gradeOrder.getOrDefault(e.getKey(), 999)));
                for (var gradeEntry : gradeEntries) {
                    List<Map<String, Object>> semesters = new ArrayList<>();
                    var semesterEntries = new ArrayList<>(gradeEntry.getValue().entrySet());
                    semesterEntries.sort(Comparator.comparingInt(e -> semesterOrder.getOrDefault(e.getKey(), 999)));
                    for (var semesterEntry : semesterEntries) {
                        List<String> units = new ArrayList<>(semesterEntry.getValue());
                        units.sort(this::compareUnit);
                        if (units.isEmpty()) continue;
                        Map<String, Object> semData = new LinkedHashMap<>();
                        semData.put("semester", semesterEntry.getKey());
                        semData.put("units", units);
                        semesters.add(semData);
                    }
                    if (semesters.isEmpty()) continue;
                    Map<String, Object> gradeData = new LinkedHashMap<>();
                    gradeData.put("grade", gradeEntry.getKey());
                    gradeData.put("semesters", semesters);
                    grades.add(gradeData);
                }
                if (grades.isEmpty()) continue;
                Map<String, Object> bookData = new LinkedHashMap<>();
                bookData.put("bookVersion", bvEntry.getKey());
                bookData.put("grades", grades);
                tree.add(bookData);
            }

            return new ResponseEntity<>(Map.of("tree", tree), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping("/tags/textbook-versions")
    public ResponseEntity<?> createTextbookVersion(@RequestBody Map<String, String> body) {
        try {
            String name = safeStr(body.get("name"));
            if (name.isBlank()) {
                throw new RuntimeException("教材版本不能为空");
            }
            if (!textbookVersionTagRepository.existsByName(name)) {
                TextbookVersionTag tag = new TextbookVersionTag();
                tag.setName(name);
                textbookVersionTagRepository.save(tag);
            }
            bootstrapDefaultScopes(name);
            return new ResponseEntity<>(Map.of("name", name), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/tags/textbook-scopes")
    public ResponseEntity<?> getTextbookScopes() {
        try {
            ensureDefaultScopesForExistingTextbooks();
            List<TextbookScopeTag> scopes = textbookScopeTagRepository.findAll();
            Map<String, Map<String, List<String>>> grouped = new TreeMap<>();
            for (TextbookScopeTag scope : scopes) {
                String book = safeStr(scope.getTextbookVersion());
                String grade = safeStr(scope.getGrade());
                String semester = safeStr(scope.getSemester());
                if (book.isBlank() || grade.isBlank() || semester.isBlank()) continue;
                grouped.computeIfAbsent(book, k -> new HashMap<>())
                        .computeIfAbsent(grade, k -> new ArrayList<>());
                List<String> semesters = grouped.get(book).get(grade);
                if (!semesters.contains(semester)) semesters.add(semester);
            }

            Map<String, Integer> gradeOrder = gradeTagRepository.findAll().stream()
                    .collect(LinkedHashMap::new,
                            (m, g) -> m.put(safeStr(g.getName()), Optional.ofNullable(g.getSortOrder()).orElse(999)),
                            LinkedHashMap::putAll);
            Map<String, Integer> semesterOrder = semesterTagRepository.findAll().stream()
                    .collect(LinkedHashMap::new,
                            (m, s) -> m.put(safeStr(s.getName()), Optional.ofNullable(s.getSortOrder()).orElse(999)),
                            LinkedHashMap::putAll);

            List<Map<String, Object>> tree = new ArrayList<>();
            for (var bookEntry : grouped.entrySet()) {
                List<Map<String, Object>> grades = new ArrayList<>();
                var gradeEntries = new ArrayList<>(bookEntry.getValue().entrySet());
                gradeEntries.sort(Comparator.comparingInt(e -> gradeOrder.getOrDefault(e.getKey(), 999)));
                for (var gradeEntry : gradeEntries) {
                    List<String> semesters = new ArrayList<>(gradeEntry.getValue());
                    semesters.sort(Comparator.comparingInt(s -> semesterOrder.getOrDefault(s, 999)));
                    Map<String, Object> gradeRow = new LinkedHashMap<>();
                    gradeRow.put("grade", gradeEntry.getKey());
                    gradeRow.put("semesters", semesters);
                    grades.add(gradeRow);
                }
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("bookVersion", bookEntry.getKey());
                row.put("grades", grades);
                tree.add(row);
            }

            List<String> grades = gradeTagRepository.findAll().stream()
                    .sorted(Comparator.comparingInt(g -> Optional.ofNullable(g.getSortOrder()).orElse(999)))
                    .map(g -> safeStr(g.getName()))
                    .filter(v -> !v.isBlank())
                    .toList();
            List<String> semesters = semesterTagRepository.findAll().stream()
                    .sorted(Comparator.comparingInt(s -> Optional.ofNullable(s.getSortOrder()).orElse(999)))
                    .map(s -> safeStr(s.getName()))
                    .filter(v -> !v.isBlank())
                    .toList();

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("tree", tree);
            data.put("grades", grades);
            data.put("semesters", semesters);
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping("/tags/textbook-scopes/textbooks")
    public ResponseEntity<?> createTextbookScopeTextbook(@RequestBody Map<String, String> body) {
        try {
            String bookVersion = safeStr(body.get("name"));
            if (bookVersion.isBlank()) throw new RuntimeException("教材版本不能为空");
            if (!textbookVersionTagRepository.existsByName(bookVersion)) {
                TextbookVersionTag tag = new TextbookVersionTag();
                tag.setName(bookVersion);
                textbookVersionTagRepository.save(tag);
            }
            bootstrapDefaultScopes(bookVersion);
            return new ResponseEntity<>(Map.of("message", "created", "name", bookVersion), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PutMapping("/tags/textbook-scopes/textbooks/rename")
    public ResponseEntity<?> renameTextbookScopeTextbook(@RequestBody Map<String, String> body) {
        try {
            String oldName = safeStr(body.get("oldName"));
            String newName = safeStr(body.get("newName"));
            if (oldName.isBlank() || newName.isBlank()) throw new RuntimeException("教材版本名称不能为空");
            if (oldName.equals(newName)) return new ResponseEntity<>(Map.of("message", "unchanged"), HttpStatus.OK);

            TextbookVersionTag tag = textbookVersionTagRepository.findByName(oldName)
                    .orElseThrow(() -> new RuntimeException("原教材版本不存在"));
            if (textbookVersionTagRepository.existsByName(newName)) {
                throw new RuntimeException("目标教材版本已存在");
            }
            tag.setName(newName);
            textbookVersionTagRepository.save(tag);

            List<TextbookScopeTag> scopes = textbookScopeTagRepository.findByTextbookVersionOrderByGradeAscSemesterAsc(oldName);
            for (TextbookScopeTag scope : scopes) {
                scope.setTextbookVersion(newName);
            }
            if (!scopes.isEmpty()) textbookScopeTagRepository.saveAll(scopes);

            int entryUpdated = 0;
            List<LexiconEntry> entries = entryRepository.findAll();
            for (LexiconEntry entry : entries) {
                if (oldName.equals(safeStr(entry.getBookVersion()))) {
                    entry.setBookVersion(newName);
                    entryUpdated += 1;
                }
            }
            if (entryUpdated > 0) entryRepository.saveAll(entries);

            int userUpdated = 0;
            List<User> users = userRepository.findAll();
            for (User user : users) {
                if (oldName.equals(safeStr(user.getTextbookVersion()))) {
                    user.setTextbookVersion(newName);
                    userUpdated += 1;
                }
            }
            if (userUpdated > 0) userRepository.saveAll(users);

            int storeUpdated = 0;
            List<Store> stores = storeRepository.findAll();
            for (Store store : stores) {
                String perms = safeStr(store.getTextbookPermissions());
                if (perms.isBlank()) continue;
                List<String> values = parseCsvQuery(perms).stream().toList();
                boolean changed = false;
                List<String> next = new ArrayList<>();
                for (String v : values) {
                    if (oldName.equals(v)) {
                        next.add(newName);
                        changed = true;
                    } else {
                        next.add(v);
                    }
                }
                if (changed) {
                    store.setTextbookPermissions(String.join(",", new LinkedHashSet<>(next)));
                    storeUpdated += 1;
                }
            }
            if (storeUpdated > 0) storeRepository.saveAll(stores);

            Map<String, Object> data = new LinkedHashMap<>();
            data.put("message", "renamed");
            data.put("oldName", oldName);
            data.put("newName", newName);
            data.put("updatedEntries", entryUpdated);
            data.put("updatedUsers", userUpdated);
            data.put("updatedStores", storeUpdated);
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping("/tags/textbook-scopes/grades")
    public ResponseEntity<?> addTextbookScopeGrade(@RequestBody Map<String, String> body) {
        try {
            String bookVersion = safeStr(body.get("bookVersion"));
            String grade = safeStr(body.get("grade"));
            if (bookVersion.isBlank() || grade.isBlank()) throw new RuntimeException("教材版本和年级不能为空");
            ensureTagExists(bookVersion, grade, "上册");
            for (String semester : DEFAULT_GRADE_SEMESTERS) {
                if (!textbookScopeTagRepository.existsByTextbookVersionAndGradeAndSemester(bookVersion, grade, semester)) {
                    TextbookScopeTag scope = new TextbookScopeTag();
                    scope.setTextbookVersion(bookVersion);
                    scope.setGrade(grade);
                    scope.setSemester(semester);
                    textbookScopeTagRepository.save(scope);
                }
            }
            return new ResponseEntity<>(Map.of("message", "created", "bookVersion", bookVersion, "grade", grade), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @DeleteMapping("/tags/textbook-scopes/grades")
    @Transactional
    public ResponseEntity<?> deleteTextbookScopeGrade(
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade
    ) {
        try {
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            Map<String, Object> usage = collectScopeUsage(bv, g, null);
            boolean blocked = Boolean.TRUE.equals(usage.get("blocked"));
            if (blocked) {
                return new ResponseEntity<>(Map.of("error", "当前标签有占用，禁止删除", "usage", usage), HttpStatus.CONFLICT);
            }
            textbookScopeTagRepository.deleteByTextbookVersionAndGrade(bv, g);
            return new ResponseEntity<>(Map.of("message", "deleted", "bookVersion", bv, "grade", g), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping("/tags/textbook-scopes/semesters")
    public ResponseEntity<?> addTextbookScopeSemester(@RequestBody Map<String, String> body) {
        try {
            String bookVersion = safeStr(body.get("bookVersion"));
            String grade = safeStr(body.get("grade"));
            String semester = normalizeSemesterTag(body.get("semester"));
            if (bookVersion.isBlank() || grade.isBlank() || semester.isBlank()) {
                throw new RuntimeException("教材版本、年级、册数不能为空");
            }
            ensureTagExists(bookVersion, grade, semester);
            if (!textbookScopeTagRepository.existsByTextbookVersionAndGradeAndSemester(bookVersion, grade, semester)) {
                TextbookScopeTag scope = new TextbookScopeTag();
                scope.setTextbookVersion(bookVersion);
                scope.setGrade(grade);
                scope.setSemester(semester);
                textbookScopeTagRepository.save(scope);
            }
            return new ResponseEntity<>(Map.of("message", "created"), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @DeleteMapping("/tags/textbook-scopes/semesters")
    @Transactional
    public ResponseEntity<?> deleteTextbookScopeSemester(
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester
    ) {
        try {
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);
            Map<String, Object> usage = collectScopeUsage(bv, g, s);
            boolean blocked = Boolean.TRUE.equals(usage.get("blocked"));
            if (blocked) {
                return new ResponseEntity<>(Map.of("error", "当前标签有占用，禁止删除", "usage", usage), HttpStatus.CONFLICT);
            }
            textbookScopeTagRepository.deleteByTextbookVersionAndGradeAndSemester(bv, g, s);
            return new ResponseEntity<>(Map.of("message", "deleted"), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @DeleteMapping("/tags/textbook-scopes/textbooks")
    @Transactional
    public ResponseEntity<?> deleteTextbookScopeTextbook(@RequestParam("bookVersion") String bookVersion) {
        try {
            String bv = safeStr(bookVersion);
            if (bv.isBlank()) throw new RuntimeException("教材版本不能为空");
            Map<String, Object> usage = collectScopeUsage(bv, null, null);
            boolean blocked = Boolean.TRUE.equals(usage.get("blocked"));
            if (blocked) {
                return new ResponseEntity<>(Map.of("error", "当前教材版本有占用，禁止删除", "usage", usage), HttpStatus.CONFLICT);
            }
            textbookScopeTagRepository.deleteByTextbookVersion(bv);
            textbookVersionTagRepository.findByName(bv).ifPresent(textbookVersionTagRepository::delete);
            return new ResponseEntity<>(Map.of("message", "deleted", "bookVersion", bv), HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping("/tags/cleanup")
    public ResponseEntity<?> cleanupTagsAndTestData() {
        try {
            List<String> canonicalGrades = DEFAULT_TEXTBOOK_GRADES;
            List<String> canonicalSemesters = List.of("上册", "下册", "全册");

            gradeTagRepository.deleteByNameNotIn(canonicalGrades);
            for (int i = 0; i < canonicalGrades.size(); i++) {
                String name = canonicalGrades.get(i);
                var found = gradeTagRepository.findByName(name);
                if (found.isPresent()) {
                    if (!Objects.equals(found.get().getSortOrder(), i + 1)) {
                        found.get().setSortOrder(i + 1);
                        gradeTagRepository.save(found.get());
                    }
                } else {
                    var tag = new com.kineticscholar.userservice.model.GradeTag();
                    tag.setName(name);
                    tag.setSortOrder(i + 1);
                    gradeTagRepository.save(tag);
                }
            }

            semesterTagRepository.deleteByNameNotIn(canonicalSemesters);
            for (int i = 0; i < canonicalSemesters.size(); i++) {
                String name = canonicalSemesters.get(i);
                var found = semesterTagRepository.findByName(name);
                if (found.isPresent()) {
                    if (!Objects.equals(found.get().getSortOrder(), i + 1)) {
                        found.get().setSortOrder(i + 1);
                        semesterTagRepository.save(found.get());
                    }
                } else {
                    var tag = new com.kineticscholar.userservice.model.SemesterTag();
                    tag.setName(name);
                    tag.setSortOrder(i + 1);
                    semesterTagRepository.save(tag);
                }
            }

            Set<String> textbookCandidates = new LinkedHashSet<>();
            textbookVersionTagRepository.findAll().forEach(t -> textbookCandidates.add(safeStr(t.getName())));
            userRepository.findAll().forEach(u -> textbookCandidates.add(safeStr(u.getTextbookVersion())));
            entryRepository.findAll().forEach(e -> textbookCandidates.add(safeStr(e.getBookVersion())));
            textbookCandidates.add("人教版");

            Set<String> normalizedTextbooks = new LinkedHashSet<>();
            for (String candidate : textbookCandidates) {
                String normalized = normalizeTextbookVersion(candidate);
                if (!normalized.isBlank()) {
                    normalizedTextbooks.add(normalized);
                }
            }
            if (normalizedTextbooks.isEmpty()) {
                normalizedTextbooks.add("人教版");
            }

            textbookVersionTagRepository.deleteByNameNotIn(normalizedTextbooks);
            for (String name : normalizedTextbooks) {
                if (!textbookVersionTagRepository.existsByName(name)) {
                    TextbookVersionTag tag = new TextbookVersionTag();
                    tag.setName(name);
                    textbookVersionTagRepository.save(tag);
                }
            }

            List<User> users = userRepository.findAll();
            boolean userChanged = false;
            for (User user : users) {
                String oldTv = safeStr(user.getTextbookVersion());
                String oldGrade = safeStr(user.getGrade());
                String newTv = normalizeTextbookVersion(oldTv);
                String newGrade = normalizeGrade(oldGrade);
                if (!newTv.isBlank() && !newTv.equals(oldTv)) {
                    user.setTextbookVersion(newTv);
                    userChanged = true;
                }
                if (!newGrade.isBlank() && !newGrade.equals(oldGrade)) {
                    user.setGrade(newGrade);
                    userChanged = true;
                }
            }
            if (userChanged) {
                userRepository.saveAll(users);
            }

            Map<String, Object> result = new HashMap<>();
            result.put("textbookVersions", normalizedTextbooks.stream().sorted().toList());
            result.put("grades", canonicalGrades);
            result.put("semesters", canonicalSemesters);
            result.put("message", "cleaned");
            return new ResponseEntity<>(result, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/items")
    public ResponseEntity<?> getItems(
            @RequestParam("type") String type,
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester
    ) {
        try {
            String normalizedType = normalizeType(type);
            List<LexiconEntry> entries = entryRepository.findByTypeAndBookVersionAndGradeAndSemesterOrderByUnitAscIdAsc(
                    normalizedType,
                    safeStr(bookVersion),
                    safeStr(grade),
                    normalizeSemesterTag(semester)
            );

            List<Map<String, Object>> items = entries.stream()
                    .sorted((a, b) -> compareUnit(safeStr(a.getUnit()), safeStr(b.getUnit())))
                    .map(this::toItemResponse)
                    .toList();

            Set<String> units = new LinkedHashSet<>();
            for (Map<String, Object> item : items) {
                String unit = safeStr(item.get("unit"));
                if (!unit.isBlank()) {
                    units.add(unit);
                }
            }

            Map<String, Object> data = new HashMap<>();
            data.put("file", "db://lexicon_entries");
            data.put("units", units.stream().sorted(this::compareUnit).toList());
            data.put("items", items);
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/items/count")
    public ResponseEntity<?> getItemsCount(
            @RequestParam("type") String type,
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester
    ) {
        try {
            String normalizedType = normalizeType(type);
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);
            List<LexiconEntry> entries = entryRepository.findByTypeAndBookVersionAndGradeAndSemesterOrderByUnitAscIdAsc(
                    normalizedType, bv, g, s
            );

            Map<String, Object> data = new HashMap<>();
            data.put("type", normalizedType);
            data.put("bookVersion", bv);
            data.put("grade", g);
            data.put("semester", s);
            data.put("count", entries.size());
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/learning/summary")
    public ResponseEntity<?> getLearningSummary(
            @RequestParam("type") String type,
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester,
            @RequestParam("unit") String unit
    ) {
        try {
            String normalizedType = normalizeType(type);
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);
            String u = safeStr(unit);
            if (u.isBlank()) throw new RuntimeException("unit is required");

            List<Object[]> groupRows = entryRepository.countByGroup(normalizedType, bv, g, s, u);
            List<Map<String, Object>> groups = new ArrayList<>();
            int total = 0;
            for (Object[] row : groupRows) {
                Integer groupNo = row[0] == null ? 0 : ((Number) row[0]).intValue();
                Integer count = row[1] == null ? 0 : ((Number) row[1]).intValue();
                if (groupNo <= 0 || count <= 0) continue;
                total += count;
                Map<String, Object> gRow = new LinkedHashMap<>();
                gRow.put("groupNo", groupNo);
                gRow.put("count", count);
                groups.add(gRow);
            }
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("type", normalizedType);
            data.put("bookVersion", bv);
            data.put("grade", g);
            data.put("semester", s);
            data.put("unit", u);
            data.put("groups", groups);
            data.put("total", total);
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/learning/items")
    public ResponseEntity<?> getLearningItems(
            @RequestParam("type") String type,
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester,
            @RequestParam("unit") String unit,
            @RequestParam("groupNo") Integer groupNo
    ) {
        try {
            String normalizedType = normalizeType(type);
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);
            String u = safeStr(unit);
            if (u.isBlank()) throw new RuntimeException("unit is required");
            if (groupNo == null || groupNo <= 0) throw new RuntimeException("groupNo must be positive");

            List<LexiconEntry> rows = entryRepository.findByTypeAndBookVersionAndGradeAndSemesterAndUnitAndGroupNoOrderByIdAsc(
                    normalizedType, bv, g, s, u, groupNo
            );

            List<Map<String, Object>> items = rows.stream().map(this::toItemResponse).toList();
            Map<String, Object> data = new LinkedHashMap<>();
            data.put("type", normalizedType);
            data.put("bookVersion", bv);
            data.put("grade", g);
            data.put("semester", s);
            data.put("unit", u);
            data.put("groupNo", groupNo);
            data.put("items", items);
            data.put("count", items.size());
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PutMapping("/items")
    public ResponseEntity<?> saveItems(
            @RequestParam("type") String type,
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester,
            @RequestBody List<Map<String, Object>> items
    ) {
        try {
            String normalizedType = normalizeType(type);
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);
            ensureTagExists(bv, g, s);

            List<LexiconEntry> existing = entryRepository.findByTypeAndBookVersionAndGradeAndSemesterOrderByUnitAscIdAsc(
                    normalizedType, bv, g, s
            );
            if (!existing.isEmpty()) {
                entryRepository.deleteAll(existing);
            }

            List<LexiconEntry> toSave = new ArrayList<>();
            for (Map<String, Object> raw : items) {
                toSave.add(mapToEntity(raw, normalizedType, bv, g, s, false));
            }
            entryRepository.saveAll(toSave);

            Map<String, Object> data = new HashMap<>();
            data.put("message", "saved");
            data.put("file", "db://lexicon_entries");
            data.put("count", toSave.size());
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @DeleteMapping("/items")
    public ResponseEntity<?> deleteItems(
            @RequestParam("type") String type,
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester
    ) {
        try {
            String normalizedType = normalizeType(type);
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);

            List<LexiconEntry> existing = entryRepository.findByTypeAndBookVersionAndGradeAndSemesterOrderByUnitAscIdAsc(
                    normalizedType, bv, g, s
            );
            int entryCount = existing.size();
            int meaningCount = existing.stream()
                    .mapToInt(e -> e.getMeanings() == null ? 0 : e.getMeanings().size())
                    .sum();
            if (!existing.isEmpty()) {
                entryRepository.deleteAll(existing);
            }

            Map<String, Object> data = new HashMap<>();
            data.put("message", "deleted");
            data.put("type", normalizedType);
            data.put("bookVersion", bv);
            data.put("grade", g);
            data.put("semester", s);
            data.put("deletedEntries", entryCount);
            data.put("deletedMeanings", meaningCount);
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/items/delete-preview")
    public ResponseEntity<?> deleteItemsPreview(
            @RequestParam("type") String type,
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester
    ) {
        try {
            String normalizedType = normalizeType(type);
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);

            List<LexiconEntry> existing = entryRepository.findByTypeAndBookVersionAndGradeAndSemesterOrderByUnitAscIdAsc(
                    normalizedType, bv, g, s
            );
            int entryCount = existing.size();
            int meaningCount = existing.stream()
                    .mapToInt(e -> e.getMeanings() == null ? 0 : e.getMeanings().size())
                    .sum();

            Map<String, Object> data = new HashMap<>();
            data.put("message", "preview");
            data.put("type", normalizedType);
            data.put("bookVersion", bv);
            data.put("grade", g);
            data.put("semester", s);
            data.put("deletedEntries", entryCount);
            data.put("deletedMeanings", meaningCount);
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping(value = "/proofread", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> proofreadJsonl(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "type", required = false) String type
    ) {
        try {
            String normalizedType = (type == null || type.isBlank()) ? null : normalizeType(type);
            ParseResult parseResult = parseJsonl(file, normalizedType, true);
            Map<String, Object> data = new HashMap<>();
            data.put("items", parseResult.items);
            data.put("stats", parseResult.stats);
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> importJsonl(
            @RequestParam("file") MultipartFile file,
            @RequestParam("type") String type,
            @RequestParam("bookVersion") String bookVersion,
            @RequestParam("grade") String grade,
            @RequestParam("semester") String semester,
            @RequestParam(value = "proofread", required = false, defaultValue = "true") boolean proofread,
            @RequestParam(value = "overwrite", required = false, defaultValue = "false") boolean overwrite
    ) {
        try {
            String normalizedType = normalizeType(type);
            String bv = safeStr(bookVersion);
            String g = safeStr(grade);
            String s = normalizeSemesterTag(semester);
            ensureTagExists(bv, g, s);
            ParseResult parseResult = parseJsonl(file, normalizedType, proofread);

            if (overwrite) {
                List<LexiconEntry> existing = entryRepository.findByTypeAndBookVersionAndGradeAndSemesterOrderByUnitAscIdAsc(
                        normalizedType, bv, g, s
                );
                if (!existing.isEmpty()) {
                    entryRepository.deleteAll(existing);
                }
            }

            List<LexiconEntry> entities = new ArrayList<>();
            for (Map<String, Object> item : parseResult.items) {
                entities.add(mapToEntity(item, normalizedType, bv, g, s, false));
            }
            entryRepository.saveAll(entities);

            Map<String, Object> data = new HashMap<>();
            data.put("message", "imported");
            data.put("count", entities.size());
            data.put("proofread", proofread);
            data.put("stats", parseResult.stats);
            return new ResponseEntity<>(data, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @GetMapping("/audio")
    public ResponseEntity<?> getAudio(@RequestParam("path") String audioPath) {
        try {
            if (audioPath == null || audioPath.isBlank()) {
                return new ResponseEntity<>(Map.of("error", "path is required"), HttpStatus.BAD_REQUEST);
            }
            String filename = Paths.get(audioPath.replace("\\", "/")).getFileName().toString();
            Path audioFile = audioDir().resolve(filename).normalize();
            if (!audioFile.startsWith(audioDir()) || !Files.exists(audioFile)) {
                return new ResponseEntity<>(Map.of("error", "Audio not found"), HttpStatus.NOT_FOUND);
            }
            Resource resource = new FileSystemResource(audioFile);
            return ResponseEntity.ok()
                    .header(HttpHeaders.CACHE_CONTROL, "public, max-age=604800")
                    .contentType(MediaType.parseMediaType("audio/mpeg"))
                    .body(resource);
        } catch (Exception e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    private ParseResult parseJsonl(MultipartFile file, String forcedType, boolean proofread) throws IOException {
        if (file == null || file.isEmpty()) {
            throw new RuntimeException("文件不能为空");
        }
        List<Map<String, Object>> items = new ArrayList<>();
        Map<String, Integer> stats = new HashMap<>();
        stats.put("lineCount", 0);
        stats.put("parsedCount", 0);
        stats.put("phoneticFixed", 0);
        stats.put("posFixed", 0);

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(file.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                stats.put("lineCount", stats.get("lineCount") + 1);
                if (line.isBlank()) continue;
                Map<String, Object> raw = objectMapper.readValue(line, new TypeReference<>() {});
                String detectedType = forcedType == null ? normalizeType(safeStr(raw.get("type"))) : forcedType;
                Map<String, Object> normalized = normalizeItem(raw, detectedType, proofread, stats);
                items.add(normalized);
            }
        }
        stats.put("parsedCount", items.size());
        return new ParseResult(items, stats);
    }

    private Map<String, Object> normalizeItem(
            Map<String, Object> raw,
            String type,
            boolean proofread,
            Map<String, Integer> stats
    ) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", safeStr(raw.get("id")).isBlank() ? UUID.randomUUID().toString().replace("-", "").substring(0, 10) : safeStr(raw.get("id")));
        item.put("word", safeStr(raw.get("word")));

        String phoneticRaw = safeStr(raw.get("phonetic"));
        String phoneticNormalized = proofread ? normalizePhonetic(phoneticRaw) : phoneticRaw;
        if (proofread && !Objects.equals(phoneticRaw, phoneticNormalized) && !phoneticRaw.isBlank()) {
            stats.put("phoneticFixed", stats.get("phoneticFixed") + 1);
        }
        item.put("phonetic", phoneticNormalized);

        item.put("unit", safeStr(raw.get("unit")).isBlank() ? "Unit 1" : safeStr(raw.get("unit")));
        item.put("group_no", parseNullablePositiveInt(raw.get("group_no")));
        item.put("type", type);
        item.put("book_version", safeStr(raw.get("book_version")));
        item.put("grade", safeStr(raw.get("grade")));
        item.put("semester", safeStr(raw.get("semester")));

        List<Map<String, Object>> meanings = new ArrayList<>();
        Object rawMeanings = raw.get("meanings");
        if (rawMeanings instanceof List<?> list) {
            for (Object obj : list) {
                if (!(obj instanceof Map<?, ?> rawMap)) continue;
                String posRaw = safeStr(rawMap.get("pos"));
                String posNormalized = proofread ? normalizePos(posRaw) : posRaw;
                if (proofread && !Objects.equals(posRaw, posNormalized) && !posRaw.isBlank()) {
                    stats.put("posFixed", stats.get("posFixed") + 1);
                }
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("pos", posNormalized);
                m.put("meaning", safeStr(rawMap.get("meaning")));
                m.put("example", safeStr(rawMap.get("example")));
                m.put("example_zh", safeStr(rawMap.get("example_zh")));
                m.put("example_audio", safeStr(rawMap.get("example_audio")));
                meanings.add(m);
            }
        }
        if (meanings.isEmpty()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("pos", type.equals(WORD) ? "" : "phrase");
            m.put("meaning", "");
            m.put("example", "");
            m.put("example_zh", "");
            m.put("example_audio", "");
            meanings.add(m);
        }
        item.put("meanings", meanings);
        item.put("word_audio", safeStr(raw.get("word_audio")));
        item.put("phrase_audio", safeStr(raw.get("phrase_audio")));
        return item;
    }

    private LexiconEntry mapToEntity(
            Map<String, Object> item,
            String type,
            String bookVersion,
            String grade,
            String semester,
            boolean useEmbeddedMeta
    ) {
        LexiconEntry entry = new LexiconEntry();
        entry.setEntryUid(safeStr(item.get("id")).isBlank() ? UUID.randomUUID().toString().replace("-", "").substring(0, 10) : safeStr(item.get("id")));
        entry.setType(type);
        entry.setWord(safeStr(item.get("word")));
        entry.setPhonetic(safeStr(item.get("phonetic")));
        entry.setUnit(safeStr(item.get("unit")).isBlank() ? "Unit 1" : safeStr(item.get("unit")));
        entry.setGroupNo(parseNullablePositiveInt(item.get("group_no")));
        entry.setBookVersion(useEmbeddedMeta ? safeStr(item.get("book_version")) : bookVersion);
        entry.setGrade(useEmbeddedMeta ? safeStr(item.get("grade")) : grade);
        entry.setSemester(useEmbeddedMeta ? safeStr(item.get("semester")) : semester);
        entry.setWordAudio(safeStr(item.get("word_audio")));
        entry.setPhraseAudio(safeStr(item.get("phrase_audio")));

        List<LexiconMeaning> meanings = new ArrayList<>();
        Object rawMeanings = item.get("meanings");
        if (rawMeanings instanceof List<?> list) {
            for (int i = 0; i < list.size(); i++) {
                Object obj = list.get(i);
                if (!(obj instanceof Map<?, ?> m)) continue;
                LexiconMeaning meaning = new LexiconMeaning();
                meaning.setEntry(entry);
                meaning.setSortOrder(i);
                meaning.setPos(normalizePos(safeStr(m.get("pos"))));
                meaning.setMeaning(safeStr(m.get("meaning")));
                meaning.setExample(safeStr(m.get("example")));
                meaning.setExampleZh(safeStr(m.get("example_zh")));
                meaning.setExampleAudio(safeStr(m.get("example_audio")));
                meanings.add(meaning);
            }
        }
        if (meanings.isEmpty()) {
            LexiconMeaning m = new LexiconMeaning();
            m.setEntry(entry);
            m.setSortOrder(0);
            m.setPos(type.equals(WORD) ? "" : "phrase");
            m.setMeaning("");
            m.setExample("");
            m.setExampleZh("");
            m.setExampleAudio("");
            meanings.add(m);
        }
        entry.setMeanings(meanings);
        return entry;
    }

    private Map<String, Object> toItemResponse(LexiconEntry e) {
        Map<String, Object> item = new LinkedHashMap<>();
        item.put("id", safeStr(e.getEntryUid()));
        item.put("word", safeStr(e.getWord()));
        item.put("phonetic", safeStr(e.getPhonetic()));
        item.put("unit", safeStr(e.getUnit()));
        item.put("group_no", e.getGroupNo());
        item.put("type", safeStr(e.getType()));
        item.put("book_version", safeStr(e.getBookVersion()));
        item.put("grade", safeStr(e.getGrade()));
        item.put("semester", safeStr(e.getSemester()));
        item.put("word_audio", safeStr(e.getWordAudio()));
        item.put("phrase_audio", safeStr(e.getPhraseAudio()));
        List<Map<String, Object>> meanings = new ArrayList<>();
        for (LexiconMeaning m : e.getMeanings()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pos", normalizePos(safeStr(m.getPos())));
            row.put("meaning", safeStr(m.getMeaning()));
            row.put("example", safeStr(m.getExample()));
            row.put("example_zh", safeStr(m.getExampleZh()));
            row.put("example_audio", safeStr(m.getExampleAudio()));
            meanings.add(row);
        }
        item.put("meanings", meanings);
        return item;
    }

    private String normalizeType(String type) {
        String t = safeStr(type).toLowerCase(Locale.ROOT);
        if (!WORD.equals(t) && !PHRASE.equals(t)) {
            throw new RuntimeException("type must be word or phrase");
        }
        return t;
    }

    private String normalizePhonetic(String value) {
        String s = safeStr(value);
        if (s.isBlank()) return "";
        Matcher slashMatcher = SLASH_PHONETIC.matcher(s);
        if (slashMatcher.find()) {
            return slashMatcher.group();
        }
        Matcher bracketMatcher = BRACKET_PHONETIC.matcher(s);
        if (bracketMatcher.find()) {
            return "/" + bracketMatcher.group(1).trim() + "/";
        }
        String cleaned = s
                .replace("（", "")
                .replace("）", "")
                .replace("【", "")
                .replace("】", "")
                .replace("[", "")
                .replace("]", "")
                .replaceAll("^[a-zA-Z.\\s]+", "")
                .trim();
        if (cleaned.isBlank()) cleaned = s.trim();
        cleaned = cleaned.replace("/", "").trim();
        if (cleaned.isBlank()) return "";
        return "/" + cleaned + "/";
    }

    private String normalizePos(String value) {
        String v = safeStr(value).toLowerCase(Locale.ROOT).replace(".", "").trim();
        if (v.isBlank()) return "";
        Map<String, String> posMap = Map.ofEntries(
                Map.entry("noun", "n."),
                Map.entry("n", "n."),
                Map.entry("verb", "v."),
                Map.entry("v", "v."),
                Map.entry("adjective", "adj."),
                Map.entry("adj", "adj."),
                Map.entry("adverb", "adv."),
                Map.entry("adv", "adv."),
                Map.entry("numeral", "num."),
                Map.entry("num", "num."),
                Map.entry("pronoun", "pron."),
                Map.entry("pron", "pron."),
                Map.entry("preposition", "prep."),
                Map.entry("prep", "prep."),
                Map.entry("conjunction", "conj."),
                Map.entry("conj", "conj."),
                Map.entry("interjection", "int."),
                Map.entry("int", "int."),
                Map.entry("article", "art."),
                Map.entry("art", "art."),
                Map.entry("aux", "aux."),
                Map.entry("auxiliary", "aux."),
                Map.entry("phrase", "phrase")
        );
        return posMap.getOrDefault(v, v.endsWith(".") ? v : (v + "."));
    }

    private String normalizeTextbookVersion(String value) {
        String s = safeStr(value);
        if (s.isBlank()) return "";
        String upper = s.toUpperCase(Locale.ROOT);
        if (upper.equals("PEP") || s.contains("人教")) return "人教版";
        if (upper.equals("FLTRP") || s.contains("外研")) return "外研版";
        if (upper.equals("SHJ") || s.contains("沪教")) return "沪教版";
        if (s.contains("?")) return "";
        if (!s.matches("^[\\p{IsHan}A-Za-z0-9（）()·\\-\\s]{1,40}$")) return "";
        return s;
    }

    private String normalizeGrade(String value) {
        String s = safeStr(value);
        if (s.isBlank()) return "";
        List<String> grades = List.of("一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "七年级", "八年级", "九年级", "高一", "高二", "高三");
        for (String g : grades) {
            if (s.contains(g)) return g;
        }
        return "";
    }

    private Set<String> parseCsvQuery(String raw) {
        if (raw == null || raw.isBlank()) return new LinkedHashSet<>();
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(v -> !v.isEmpty())
                .collect(LinkedHashSet::new, LinkedHashSet::add, LinkedHashSet::addAll);
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

    private Integer parseNullablePositiveInt(Object value) {
        String s = safeStr(value);
        if (s.isBlank()) return null;
        try {
            int n = Integer.parseInt(s);
            return n > 0 ? n : null;
        } catch (Exception ignore) {
            return null;
        }
    }

    private void ensureDefaultScopesForExistingTextbooks() {
        List<String> textbooks = textbookVersionTagRepository.findAll().stream()
                .map(TextbookVersionTag::getName)
                .map(this::safeStr)
                .filter(v -> !v.isBlank())
                .toList();
        for (String textbook : textbooks) {
            // Only bootstrap when a textbook has no scope rows at all.
            // Do not auto-recreate deleted semesters for existing grades.
            List<TextbookScopeTag> existing = textbookScopeTagRepository.findByTextbookVersionOrderByGradeAscSemesterAsc(textbook);
            if (existing.isEmpty()) {
                bootstrapDefaultScopes(textbook);
            }
        }
    }

    private void bootstrapDefaultScopes(String textbookVersion) {
        for (String grade : DEFAULT_TEXTBOOK_GRADES) {
            for (String semester : DEFAULT_GRADE_SEMESTERS) {
                if (!textbookScopeTagRepository.existsByTextbookVersionAndGradeAndSemester(textbookVersion, grade, semester)) {
                    TextbookScopeTag scope = new TextbookScopeTag();
                    scope.setTextbookVersion(textbookVersion);
                    scope.setGrade(grade);
                    scope.setSemester(semester);
                    textbookScopeTagRepository.save(scope);
                }
            }
        }
    }

    private Map<String, Object> collectScopeUsage(String bookVersion, String grade, String semester) {
        String bv = safeStr(bookVersion);
        String g = safeStr(grade);
        String s = normalizeSemesterTag(semester);

        List<LexiconEntry> lexiconMatches = entryRepository.findAll().stream()
                .filter(e -> bv.isBlank() || bv.equals(safeStr(e.getBookVersion())))
                .filter(e -> g.isBlank() || g.equals(safeStr(e.getGrade())))
                .filter(e -> s.isBlank() || s.equals(normalizeSemesterTag(e.getSemester())))
                .toList();

        // Users/stores are scoped by textbook+grade only. When deleting a specific semester tag,
        // do not block by user/store mappings, otherwise it causes false positives.
        boolean strictSemesterMode = !s.isBlank();
        List<User> userMatches = strictSemesterMode ? List.of() : userRepository.findAll().stream()
                .filter(u -> bv.isBlank() || bv.equals(safeStr(u.getTextbookVersion())))
                .filter(u -> g.isBlank() || g.equals(safeStr(u.getGrade())))
                .filter(u -> !"admin".equalsIgnoreCase(safeStr(u.getRole())))
                .toList();

        List<Map<String, Object>> users = new ArrayList<>();
        for (User u : userMatches) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("id", u.getId());
            row.put("name", safeStr(u.getName()));
            row.put("role", safeStr(u.getRole()));
            row.put("storeCode", safeStr(u.getStoreName()));
            row.put("textbookVersion", safeStr(u.getTextbookVersion()));
            row.put("grade", safeStr(u.getGrade()));
            users.add(row);
        }

        List<Store> storeMatches = strictSemesterMode ? List.of() : storeRepository.findAll().stream()
                .filter(store -> {
                    Set<String> textbooks = parseCsvQuery(store.getTextbookPermissions());
                    Set<String> grades = parseCsvQuery(store.getGradePermissions());
                    boolean textbookHit = bv.isBlank() || textbooks.contains(bv);
                    boolean gradeHit = g.isBlank() || grades.contains(g);
                    return textbookHit && gradeHit;
                })
                .toList();
        List<Map<String, Object>> stores = new ArrayList<>();
        for (Store st : storeMatches) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("storeCode", safeStr(st.getStoreCode()));
            row.put("storeName", safeStr(st.getStoreName()));
            stores.add(row);
        }

        long wordCount = lexiconMatches.stream().filter(e -> WORD.equals(safeStr(e.getType()))).count();
        long phraseCount = lexiconMatches.stream().filter(e -> PHRASE.equals(safeStr(e.getType()))).count();
        boolean blocked = !lexiconMatches.isEmpty() || !userMatches.isEmpty() || !storeMatches.isEmpty();

        Map<String, Object> usage = new LinkedHashMap<>();
        usage.put("bookVersion", bv);
        usage.put("grade", g);
        usage.put("semester", s);
        usage.put("wordLexiconCount", wordCount);
        usage.put("phraseLexiconCount", phraseCount);
        usage.put("userCount", users.size());
        usage.put("users", users);
        usage.put("storeCount", stores.size());
        usage.put("stores", stores);
        usage.put("blocked", blocked);
        usage.put("note", "任务占用明细将在后续版本补充到该校验中");
        return usage;
    }

    private String safeStr(Object value) {
        return value == null ? "" : String.valueOf(value).trim();
    }

    private String normalizeSemesterTag(String value) {
        String s = safeStr(value);
        if (s.equals("全一册") || s.equals("全册")) {
            return "全册";
        }
        return s;
    }

    private void ensureTagExists(String bookVersion, String grade, String semester) {
        if (!textbookVersionTagRepository.existsByName(bookVersion)) {
            throw new RuntimeException("非法教材版本标签: " + bookVersion);
        }
        if (!gradeTagRepository.existsByName(grade)) {
            throw new RuntimeException("非法年级标签: " + grade);
        }
        if (!semesterTagRepository.existsByName(semester)) {
            throw new RuntimeException("非法册数标签: " + semester);
        }
    }

    private Path audioDir() {
        return Paths.get(System.getProperty("user.dir"))
                .toAbsolutePath()
                .normalize()
                .resolve("..")
                .resolve("..")
                .resolve("tool")
                .resolve("audio")
                .normalize();
    }

    private record ParseResult(List<Map<String, Object>> items, Map<String, Integer> stats) {}
}

