package com.kineticscholar.testservice.controller;

import com.kineticscholar.testservice.model.LearningGroupProgress;
import com.kineticscholar.testservice.model.LearningSessionState;
import com.kineticscholar.testservice.repository.LearningGroupProgressRepository;
import com.kineticscholar.testservice.repository.LearningSessionStateRepository;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping({"/api", "/api/tests"})
public class LearningProgressController {

    private final LearningSessionStateRepository sessionRepo;
    private final LearningGroupProgressRepository progressRepo;

    public LearningProgressController(
            LearningSessionStateRepository sessionRepo,
            LearningGroupProgressRepository progressRepo
    ) {
        this.sessionRepo = sessionRepo;
        this.progressRepo = progressRepo;
    }

    @GetMapping("/learning/session")
    public ResponseEntity<?> getSession(
            @RequestParam Long userId,
            @RequestParam String unitId,
            @RequestParam String module
    ) {
        Optional<LearningSessionState> row = sessionRepo.findByUserIdAndUnitIdAndModule(userId, unitId, module);
        return new ResponseEntity<>(row.orElse(null), HttpStatus.OK);
    }

    @PutMapping("/learning/session")
    public ResponseEntity<?> upsertSession(@RequestBody Map<String, Object> body) {
        Long userId = parseLong(body.get("userId"));
        String unitId = safe(body.get("unitId"));
        String module = safe(body.get("module"));
        String stateJson = safe(body.get("stateJson"));

        if (userId == null || unitId.isEmpty() || module.isEmpty() || stateJson.isEmpty()) {
            return new ResponseEntity<>(Map.of("error", "userId, unitId, module, stateJson are required"), HttpStatus.BAD_REQUEST);
        }

        LearningSessionState row = sessionRepo.findByUserIdAndUnitIdAndModule(userId, unitId, module).orElseGet(LearningSessionState::new);
        row.setUserId(userId);
        row.setUnitId(unitId);
        row.setModule(module);
        row.setStateJson(stateJson);
        LearningSessionState saved = sessionRepo.save(row);
        return new ResponseEntity<>(saved, HttpStatus.OK);
    }

    @GetMapping("/learning/group-progress")
    public ResponseEntity<?> getGroupProgress(
            @RequestParam Long userId,
            @RequestParam String unitId,
            @RequestParam String module
    ) {
        List<LearningGroupProgress> rows = progressRepo.findByUserIdAndUnitIdAndModuleOrderByGroupNoAsc(userId, unitId, module);
        return new ResponseEntity<>(rows, HttpStatus.OK);
    }

    @PostMapping("/learning/group-progress/start")
    public ResponseEntity<?> startGroup(@RequestBody Map<String, Object> body) {
        Long userId = parseLong(body.get("userId"));
        String unitId = safe(body.get("unitId"));
        String module = safe(body.get("module"));
        Integer groupNo = parseInt(body.get("groupNo"));
        Integer itemTotal = parseInt(body.get("itemTotal"));

        if (userId == null || unitId.isEmpty() || module.isEmpty() || groupNo == null) {
            return new ResponseEntity<>(Map.of("error", "userId, unitId, module, groupNo are required"), HttpStatus.BAD_REQUEST);
        }

        LearningGroupProgress row = progressRepo.findByUserIdAndUnitIdAndModuleAndGroupNo(userId, unitId, module, groupNo)
                .orElseGet(LearningGroupProgress::new);
        row.setUserId(userId);
        row.setUnitId(unitId);
        row.setModule(module);
        row.setGroupNo(groupNo);
        if (row.getStartedAt() == null) {
            row.setStartedAt(LocalDateTime.now());
        }
        if (itemTotal != null && itemTotal >= 0) {
            row.setItemTotal(itemTotal);
        }
        LearningGroupProgress saved = progressRepo.save(row);
        return new ResponseEntity<>(saved, HttpStatus.OK);
    }

    @PostMapping("/learning/group-progress/complete")
    public ResponseEntity<?> completeGroup(@RequestBody Map<String, Object> body) {
        Long userId = parseLong(body.get("userId"));
        String unitId = safe(body.get("unitId"));
        String module = safe(body.get("module"));
        Integer groupNo = parseInt(body.get("groupNo"));
        Integer learnedCount = parseInt(body.get("learnedCount"));
        Integer itemTotal = parseInt(body.get("itemTotal"));

        if (userId == null || unitId.isEmpty() || module.isEmpty() || groupNo == null) {
            return new ResponseEntity<>(Map.of("error", "userId, unitId, module, groupNo are required"), HttpStatus.BAD_REQUEST);
        }

        LearningGroupProgress row = progressRepo.findByUserIdAndUnitIdAndModuleAndGroupNo(userId, unitId, module, groupNo)
                .orElseGet(LearningGroupProgress::new);
        row.setUserId(userId);
        row.setUnitId(unitId);
        row.setModule(module);
        row.setGroupNo(groupNo);
        if (row.getStartedAt() == null) {
            row.setStartedAt(LocalDateTime.now());
        }
        LocalDateTime now = LocalDateTime.now();
        row.setCompletedAt(now);
        int seconds = (int) java.time.Duration.between(row.getStartedAt(), now).getSeconds();
        row.setDurationSeconds(Math.max(0, seconds));
        if (itemTotal != null && itemTotal >= 0) row.setItemTotal(itemTotal);
        if (learnedCount != null && learnedCount >= 0) row.setLearnedCount(learnedCount);
        LearningGroupProgress saved = progressRepo.save(row);
        return new ResponseEntity<>(saved, HttpStatus.OK);
    }

    private String safe(Object v) {
        return v == null ? "" : String.valueOf(v).trim();
    }

    private Long parseLong(Object v) {
        try {
            if (v == null) return null;
            return Long.valueOf(String.valueOf(v).trim());
        } catch (Exception e) {
            return null;
        }
    }

    private Integer parseInt(Object v) {
        try {
            if (v == null) return null;
            return Integer.valueOf(String.valueOf(v).trim());
        } catch (Exception e) {
            return null;
        }
    }
}

