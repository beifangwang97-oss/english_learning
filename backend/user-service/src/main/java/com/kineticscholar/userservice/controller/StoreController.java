package com.kineticscholar.userservice.controller;

import com.kineticscholar.userservice.model.Store;
import com.kineticscholar.userservice.repository.StoreRepository;
import com.kineticscholar.userservice.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api")
public class StoreController {
    private static final String STORE_CODE_PATTERN = "^ST_INIT_\\d{3}$";
    private static final String STORE_NAME_PATTERN = "^[\\p{IsHan}0-9（）()·\\-\\s]{2,30}$";

    @Autowired
    private StoreRepository storeRepository;

    @Autowired
    private UserRepository userRepository;

    @GetMapping("/stores")
    public ResponseEntity<?> getAllStores() {
        List<Map<String, Object>> stores = storeRepository.findAll().stream()
                .sorted(Comparator.comparing(Store::getStoreCode))
                .map(this::toStoreResponse)
                .toList();
        return new ResponseEntity<>(stores, HttpStatus.OK);
    }

    @PostMapping("/stores")
    public ResponseEntity<?> createStore(@RequestBody Map<String, Object> body) {
        try {
            String storeName = normalizedString(body.get("storeName"));
            if (storeName == null || storeName.isBlank()) {
                throw new RuntimeException("storeName is required");
            }
            validateStoreNameFormat(storeName);

            Store store = new Store();
            String storeCode = generateNextStoreCode();
            store.setStoreCode(storeCode);
            store.setStoreName(storeName);
            store.setTeacherMax(parsePositiveInt(body.get("teacherMax"), 10));
            store.setStudentMax(parsePositiveInt(body.get("studentMax"), 200));
            List<String> textbookPermissions = parseValues(body.get("textbookPermissions"));
            List<String> gradePermissions = parseValues(body.get("gradePermissions"));
            List<List<String>> normalizedPermissions = normalizePermissionPair(textbookPermissions, gradePermissions);
            store.setTextbookPermissions(joinValues(normalizedPermissions.get(0)));
            store.setGradePermissions(joinValues(normalizedPermissions.get(1)));

            Store saved = storeRepository.save(store);
            return new ResponseEntity<>(toStoreResponse(saved), HttpStatus.CREATED);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @DeleteMapping("/stores/{storeCode}")
    public ResponseEntity<?> deleteStore(@PathVariable String storeCode) {
        try {
            Optional<Store> optional = storeRepository.findByStoreCode(storeCode);
            if (optional.isEmpty()) {
                throw new RuntimeException("Store not found");
            }
            long boundUsers = userRepository.countByStoreName(storeCode);
            if (boundUsers > 0) {
                throw new RuntimeException("Store has bound users, cannot delete");
            }
            storeRepository.delete(optional.get());
            return new ResponseEntity<>(Map.of("message", "deleted", "storeCode", storeCode), HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PutMapping("/stores/{storeCode}")
    public ResponseEntity<?> updateStore(
            @PathVariable String storeCode,
            @RequestBody Map<String, Object> body
    ) {
        try {
            validateStoreCodeFormat(storeCode);
            Optional<Store> optional = storeRepository.findByStoreCode(storeCode);
            if (optional.isEmpty()) {
                throw new RuntimeException("Store not found");
            }
            Store store = optional.get();

            String storeName = normalizedString(body.get("storeName"));
            if (storeName != null && !storeName.isBlank()) {
                validateStoreNameFormat(storeName);
                store.setStoreName(storeName);
            }
            if (body.containsKey("teacherMax")) {
                store.setTeacherMax(parsePositiveInt(body.get("teacherMax"), store.getTeacherMax()));
            }
            if (body.containsKey("studentMax")) {
                store.setStudentMax(parsePositiveInt(body.get("studentMax"), store.getStudentMax()));
            }
            if (body.containsKey("textbookPermissions") || body.containsKey("gradePermissions")) {
                List<String> textbookPermissions = body.containsKey("textbookPermissions")
                        ? parseValues(body.get("textbookPermissions"))
                        : parseValues(store.getTextbookPermissions());
                List<String> gradePermissions = body.containsKey("gradePermissions")
                        ? parseValues(body.get("gradePermissions"))
                        : parseValues(store.getGradePermissions());
                List<List<String>> normalizedPermissions = normalizePermissionPair(textbookPermissions, gradePermissions);
                store.setTextbookPermissions(joinValues(normalizedPermissions.get(0)));
                store.setGradePermissions(joinValues(normalizedPermissions.get(1)));
            }

            Store saved = storeRepository.save(store);
            return new ResponseEntity<>(toStoreResponse(saved), HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    private void bootstrapStoresFromUsersIfEmpty() {
        if (storeRepository.count() > 0) {
            return;
        }
        Set<String> storeNames = userRepository.findAll().stream()
                .map(u -> u.getStoreName() == null ? "" : u.getStoreName().trim())
                .filter(v -> !v.isEmpty())
                .collect(Collectors.toCollection(LinkedHashSet::new));
        int idx = 1;
        for (String name : storeNames) {
            Store store = new Store();
            store.setStoreCode(String.format("ST_INIT_%03d", idx++));
            store.setStoreName(name);
            store.setTeacherMax(10);
            store.setStudentMax(200);
            store.setTextbookPermissions("");
            store.setGradePermissions("");
            storeRepository.save(store);
        }
    }

    private Map<String, Object> toStoreResponse(Store store) {
        Map<String, Object> data = new HashMap<>();
        data.put("id", store.getId());
        data.put("storeCode", store.getStoreCode());
        data.put("storeName", store.getStoreName());
        data.put("teacherMax", store.getTeacherMax());
        data.put("studentMax", store.getStudentMax());
        List<List<String>> normalizedPermissions = normalizePermissionPair(
                parseValues(store.getTextbookPermissions()),
                parseValues(store.getGradePermissions())
        );
        data.put("textbookPermissions", normalizedPermissions.get(0));
        data.put("gradePermissions", normalizedPermissions.get(1));
        data.put("createdAt", store.getCreatedAt());
        data.put("updatedAt", store.getUpdatedAt());
        return data;
    }

    private Integer parsePositiveInt(Object value, Integer fallback) {
        if (value == null) return fallback;
        try {
            int parsed = Integer.parseInt(String.valueOf(value));
            return Math.max(0, parsed);
        } catch (Exception e) {
            return fallback;
        }
    }

    private String normalizedString(Object value) {
        if (value == null) return null;
        return String.valueOf(value).trim();
    }

    private List<String> parseValues(Object raw) {
        if (raw == null) return new ArrayList<>();
        if (raw instanceof List<?> list) {
            return list.stream()
                    .map(String::valueOf)
                    .map(String::trim)
                    .filter(v -> !v.isEmpty())
                    .distinct()
                    .toList();
        }
        String s = String.valueOf(raw).trim();
        if (s.isEmpty()) return new ArrayList<>();
        return Arrays.stream(s.split(","))
                .map(String::trim)
                .filter(v -> !v.isEmpty())
                .distinct()
                .toList();
    }

    private String joinValues(List<String> values) {
        return String.join(",", values == null ? List.of() : values);
    }

    private void normalizeLegacyStoreNames() {
        Map<String, String> mapping = Map.of(
                "HQ", "上海总部门店",
                "Xuhui", "上海徐汇门店",
                "Pudong", "上海浦东门店",
                "Jingan", "上海静安门店"
        );
        boolean changed = false;
        List<Store> stores = storeRepository.findAll();
        for (Store store : stores) {
            String current = store.getStoreName() == null ? "" : store.getStoreName().trim();
            if (mapping.containsKey(current)) {
                store.setStoreName(mapping.get(current));
                changed = true;
            }
        }
        if (changed) {
            storeRepository.saveAll(stores);
        }
    }

    private String generateNextStoreCode() {
        int max = storeRepository.findAll().stream()
                .map(Store::getStoreCode)
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(code -> code.matches(STORE_CODE_PATTERN))
                .map(code -> Integer.parseInt(code.substring("ST_INIT_".length())))
                .max(Integer::compareTo)
                .orElse(0);
        return String.format("ST_INIT_%03d", max + 1);
    }

    private void validateStoreCodeFormat(String storeCode) {
        if (storeCode == null || !storeCode.matches(STORE_CODE_PATTERN)) {
            throw new RuntimeException("storeCode format must be ST_INIT_###");
        }
    }

    private void validateStoreNameFormat(String storeName) {
        if (storeName == null || !storeName.matches(STORE_NAME_PATTERN)) {
            throw new RuntimeException("storeName must be Chinese and 2-30 chars");
        }
    }

    private List<List<String>> normalizePermissionPair(List<String> textbookPermissions, List<String> gradePermissions) {
        List<String> textbooks = textbookPermissions == null ? new ArrayList<>() : new ArrayList<>(textbookPermissions);
        List<String> grades = gradePermissions == null ? new ArrayList<>() : new ArrayList<>(gradePermissions);
        // 权限必须“教材+年级”同时存在才生效；只配置一侧时按“无权限”处理。
        if (textbooks.isEmpty() || grades.isEmpty()) {
            return List.of(new ArrayList<>(), new ArrayList<>());
        }
        return List.of(textbooks, grades);
    }
}
