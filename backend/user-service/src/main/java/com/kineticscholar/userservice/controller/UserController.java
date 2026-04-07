package com.kineticscholar.userservice.controller;

import com.kineticscholar.userservice.model.User;
import com.kineticscholar.userservice.service.SessionAuthException;
import com.kineticscholar.userservice.service.SessionAuthService;
import com.kineticscholar.userservice.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Objects;
import java.time.LocalDate;

@RestController
@RequestMapping("/api")
public class UserController {

    @Autowired
    private UserService userService;

    @Autowired
    private SessionAuthService sessionAuthService;

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody User user) {
        return registerInternal(user);
    }

    @PostMapping("/users/register")
    public ResponseEntity<?> registerFromAdmin(@RequestBody User user) {
        return registerInternal(user);
    }

    private ResponseEntity<?> registerInternal(User user) {
        try {
            normalizePasswordInput(user);
            User registeredUser = userService.register(user);
            return new ResponseEntity<>(toSafeUser(registeredUser), HttpStatus.CREATED);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping("/users/login")
    public ResponseEntity<?> login(@RequestBody Map<String, String> credentials, HttpServletRequest request) {
        return loginInternal(credentials, request);
    }

    @PostMapping("/login")
    public ResponseEntity<?> loginAlias(@RequestBody Map<String, String> credentials, HttpServletRequest request) {
        return loginInternal(credentials, request);
    }

    private ResponseEntity<?> loginInternal(Map<String, String> credentials, HttpServletRequest request) {
        String username = credentials.get("username");
        String password = credentials.get("password");

        // Backward-compatible normalization for legacy mock usernames like "student/123".
        if (username != null && username.contains("/")) {
            username = username.substring(0, username.indexOf('/'));
        }

        try {
            Optional<User> user = userService.login(username, password);
            if (user.isPresent()) {
                String token = sessionAuthService.issueLoginToken(
                        user.get(),
                        request == null ? null : request.getRemoteAddr(),
                        request == null ? null : request.getHeader("User-Agent")
                );
                Map<String, Object> response = new HashMap<>();
                response.put("token", token);
                response.put("user", toSafeUser(user.get()));
                return new ResponseEntity<>(response, HttpStatus.OK);
            }
        } catch (RuntimeException e) {
            String msg = e.getMessage() == null ? "" : e.getMessage();
            if ("Account is disabled".equals(msg)
                    || "Account has expired".equals(msg)
                    || "账号已停用".equals(msg)
                    || "账号已到期".equals(msg)) {
                return new ResponseEntity<>(Map.of("error", msg), HttpStatus.FORBIDDEN);
            }
            return new ResponseEntity<>(Map.of("error", msg), HttpStatus.CONFLICT);
        }

        return new ResponseEntity<>(Map.of("error", "Invalid username or password"), HttpStatus.UNAUTHORIZED);
    }

    @PostMapping("/users/logout")
    public ResponseEntity<?> logout(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        try {
            if (authHeader == null || !authHeader.startsWith("Bearer ")) {
                return new ResponseEntity<>(Map.of("error", "Missing or invalid Authorization header"), HttpStatus.UNAUTHORIZED);
            }
            String token = authHeader.substring(7);
            sessionAuthService.logoutByToken(token);
            return new ResponseEntity<>(Map.of("message", "logout success"), HttpStatus.OK);
        } catch (SessionAuthException e) {
            return authErrorResponse(e);
        }
    }

    @GetMapping("/users/me")
    public ResponseEntity<?> getCurrentUser(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        return getCurrentUserInternal(authHeader);
    }

    @GetMapping("/me")
    public ResponseEntity<?> getCurrentUserAlias(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        return getCurrentUserInternal(authHeader);
    }

    private ResponseEntity<?> getCurrentUserInternal(String authHeader) {
        try {
            User user = sessionAuthService.validateAuthorizationHeader(authHeader);
            return new ResponseEntity<>(toSafeUser(user), HttpStatus.OK);
        } catch (SessionAuthException e) {
            return authErrorResponse(e);
        }
    }

    @GetMapping("/users/session/validate")
    public ResponseEntity<?> validateSession(@RequestHeader(value = "Authorization", required = false) String authHeader) {
        try {
            User user = sessionAuthService.validateAuthorizationHeader(authHeader);
            return new ResponseEntity<>(Map.of(
                    "id", user.getId(),
                    "username", user.getUsername(),
                    "role", user.getRole()
            ), HttpStatus.OK);
        } catch (SessionAuthException e) {
            return authErrorResponse(e);
        }
    }

    @GetMapping("/users")
    public ResponseEntity<?> getAllUsers() {
        List<Map<String, Object>> users = userService.getAllUsers().stream()
                .map(this::toSafeUser)
                .toList();
        return new ResponseEntity<>(users, HttpStatus.OK);
    }

    @GetMapping("/users/{id}")
    public ResponseEntity<?> getUserById(@PathVariable Long id) {
        Optional<User> user = userService.getUserById(id);
        if (user.isPresent()) {
            return new ResponseEntity<>(toSafeUser(user.get()), HttpStatus.OK);
        }
        return new ResponseEntity<>(Map.of("error", "User not found"), HttpStatus.NOT_FOUND);
    }

    @GetMapping("/users/role/{role}")
    public ResponseEntity<?> getUsersByRole(@PathVariable String role) {
        List<Map<String, Object>> users = userService.getUsersByRole(role).stream()
                .map(this::toSafeUser)
                .toList();
        return new ResponseEntity<>(users, HttpStatus.OK);
    }

    @GetMapping("/users/online/count")
    public ResponseEntity<?> getOnlineCount(@RequestParam(value = "role", defaultValue = "student") String role) {
        long count = userService.countOnlineByRole(role);
        return new ResponseEntity<>(Map.of("role", role, "count", count), HttpStatus.OK);
    }

    @PutMapping("/users/{id}")
    public ResponseEntity<?> updateUser(@PathVariable Long id, @RequestBody User user) {
        try {
            normalizePasswordInput(user);
            User updatedUser = userService.updateUser(id, user);
            if (!isLoginAllowedNow(updatedUser)) {
                sessionAuthService.revokeAllSessionsByUserId(updatedUser.getId(), "ACCOUNT_STATE_CHANGED");
            }
            return new ResponseEntity<>(toSafeUser(updatedUser), HttpStatus.OK);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @DeleteMapping("/users/{id}")
    public ResponseEntity<?> deleteUser(@PathVariable Long id) {
        sessionAuthService.revokeAllSessionsByUserId(id, "ACCOUNT_DELETED");
        userService.deleteUser(id);
        return new ResponseEntity<>(HttpStatus.NO_CONTENT);
    }

    @GetMapping("/users/teacher/students")
    public ResponseEntity<?> getTeacherStoreStudents(
            @RequestHeader(value = "Authorization", required = false) String authHeader) {
        try {
            User teacher = requireTeacher(authHeader);
            String teacherStore = normalizeStore(teacher.getStoreName());
            List<Map<String, Object>> users = userService.getAllUsers().stream()
                    .filter(u -> "student".equalsIgnoreCase(u.getRole()))
                    .filter(u -> Objects.equals(normalizeStore(u.getStoreName()), teacherStore))
                    .map(this::toSafeUser)
                    .toList();
            return new ResponseEntity<>(users, HttpStatus.OK);
        } catch (SessionAuthException e) {
            return authErrorResponse(e);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping("/users/teacher/students")
    public ResponseEntity<?> createTeacherStoreStudent(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestBody User user) {
        try {
            User teacher = requireTeacher(authHeader);
            normalizePasswordInput(user);
            user.setRole("student");
            user.setStoreName(normalizeStore(teacher.getStoreName()));
            User created = userService.register(user);
            return new ResponseEntity<>(toSafeUser(created), HttpStatus.CREATED);
        } catch (SessionAuthException e) {
            return authErrorResponse(e);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PutMapping("/users/teacher/students/{id}")
    public ResponseEntity<?> updateTeacherStoreStudent(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable Long id,
            @RequestBody User user) {
        try {
            User teacher = requireTeacher(authHeader);
            Optional<User> targetOpt = userService.getUserById(id);
            if (targetOpt.isEmpty()) {
                return new ResponseEntity<>(Map.of("error", "User not found"), HttpStatus.NOT_FOUND);
            }
            User target = targetOpt.get();
            String teacherStore = normalizeStore(teacher.getStoreName());
            if (!"student".equalsIgnoreCase(target.getRole())) {
                return new ResponseEntity<>(Map.of("error", "Only student accounts can be edited"), HttpStatus.FORBIDDEN);
            }
            if (!Objects.equals(normalizeStore(target.getStoreName()), teacherStore)) {
                return new ResponseEntity<>(Map.of("error", "Cannot edit students outside your store"), HttpStatus.FORBIDDEN);
            }

            normalizePasswordInput(user);
            user.setRole("student");
            user.setStoreName(teacherStore);
            User updatedUser = userService.updateUser(id, user);
            if (!isLoginAllowedNow(updatedUser)) {
                sessionAuthService.revokeAllSessionsByUserId(updatedUser.getId(), "ACCOUNT_STATE_CHANGED");
            }
            return new ResponseEntity<>(toSafeUser(updatedUser), HttpStatus.OK);
        } catch (SessionAuthException e) {
            return authErrorResponse(e);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @DeleteMapping("/users/teacher/students/{id}")
    public ResponseEntity<?> deleteTeacherStoreStudent(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @PathVariable Long id) {
        try {
            User teacher = requireTeacher(authHeader);
            Optional<User> targetOpt = userService.getUserById(id);
            if (targetOpt.isEmpty()) {
                return new ResponseEntity<>(Map.of("error", "User not found"), HttpStatus.NOT_FOUND);
            }
            User target = targetOpt.get();
            String teacherStore = normalizeStore(teacher.getStoreName());
            if (!"student".equalsIgnoreCase(target.getRole())) {
                return new ResponseEntity<>(Map.of("error", "Only student accounts can be deleted"), HttpStatus.FORBIDDEN);
            }
            if (!Objects.equals(normalizeStore(target.getStoreName()), teacherStore)) {
                return new ResponseEntity<>(Map.of("error", "Cannot delete students outside your store"), HttpStatus.FORBIDDEN);
            }
            sessionAuthService.revokeAllSessionsByUserId(target.getId(), "ACCOUNT_DELETED");
            userService.deleteUser(id);
            return new ResponseEntity<>(HttpStatus.NO_CONTENT);
        } catch (SessionAuthException e) {
            return authErrorResponse(e);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    @PostMapping("/users/teacher/students/batch-delete")
    public ResponseEntity<?> batchDeleteTeacherStoreStudents(
            @RequestHeader(value = "Authorization", required = false) String authHeader,
            @RequestBody Map<String, List<Number>> body) {
        try {
            User teacher = requireTeacher(authHeader);
            List<Number> rawIds = body.get("userIds");
            if (rawIds == null || rawIds.isEmpty()) {
                return new ResponseEntity<>(Map.of("error", "userIds is required"), HttpStatus.BAD_REQUEST);
            }
            List<Long> userIds = rawIds.stream().map(Number::longValue).toList();
            String teacherStore = normalizeStore(teacher.getStoreName());
            for (Long id : userIds) {
                Optional<User> targetOpt = userService.getUserById(id);
                if (targetOpt.isEmpty()) {
                    return new ResponseEntity<>(Map.of("error", "User not found: " + id), HttpStatus.NOT_FOUND);
                }
                User target = targetOpt.get();
                if (!"student".equalsIgnoreCase(target.getRole())) {
                    return new ResponseEntity<>(Map.of("error", "Only student accounts can be deleted"), HttpStatus.FORBIDDEN);
                }
                if (!Objects.equals(normalizeStore(target.getStoreName()), teacherStore)) {
                    return new ResponseEntity<>(Map.of("error", "Cannot delete students outside your store"), HttpStatus.FORBIDDEN);
                }
            }
            userIds.forEach(id -> {
                sessionAuthService.revokeAllSessionsByUserId(id, "ACCOUNT_DELETED");
                userService.deleteUser(id);
            });
            return new ResponseEntity<>(Map.of("message", "Deleted " + userIds.size() + " students"), HttpStatus.OK);
        } catch (SessionAuthException e) {
            return authErrorResponse(e);
        } catch (RuntimeException e) {
            return new ResponseEntity<>(Map.of("error", e.getMessage()), HttpStatus.BAD_REQUEST);
        }
    }

    private User requireTeacher(String authHeader) {
        User teacher = sessionAuthService.validateAuthorizationHeader(authHeader);
        if (!"teacher".equalsIgnoreCase(teacher.getRole())) {
            throw new RuntimeException("Teacher role required");
        }
        if (normalizeStore(teacher.getStoreName()).isBlank()) {
            throw new RuntimeException("Teacher store is not configured");
        }
        return teacher;
    }

    private ResponseEntity<Map<String, Object>> authErrorResponse(SessionAuthException e) {
        Map<String, Object> body = new HashMap<>();
        body.put("error", e.getMessage());
        body.put("code", e.getCode());
        return new ResponseEntity<>(body, e.getStatus());
    }

    private String normalizeStore(String storeName) {
        return storeName == null ? "" : storeName.trim();
    }

    private boolean isLoginAllowedNow(User user) {
        if (user == null || !user.isActive()) {
            return false;
        }
        LocalDate today = LocalDate.now();
        return user.getExpireDate() != null && !today.isAfter(user.getExpireDate());
    }

    private Map<String, Object> toSafeUser(User user) {
        Map<String, Object> safeUser = new HashMap<>();
        safeUser.put("id", user.getId());
        safeUser.put("username", user.getUsername());
        safeUser.put("name", user.getName());
        safeUser.put("role", user.getRole());
        safeUser.put("loginPassword", user.getLoginPassword());
        safeUser.put("avatar", user.getAvatar());
        safeUser.put("phone", user.getPhone());
        safeUser.put("textbookVersion", user.getTextbookVersion());
        safeUser.put("grade", user.getGrade());
        safeUser.put("storeName", user.getStoreName());
        safeUser.put("expireDate", user.getExpireDate());
        safeUser.put("active", user.isActive());
        safeUser.put("onlineStatus", user.getOnlineStatus() == null ? 0 : user.getOnlineStatus());
        safeUser.put("lastActiveAt", user.getLastActiveAt());
        safeUser.put("createdAt", user.getCreatedAt());
        safeUser.put("updatedAt", user.getUpdatedAt());
        return safeUser;
    }

    private void normalizePasswordInput(User user) {
        if (user.getLoginPassword() == null || user.getLoginPassword().isBlank()) {
            user.setLoginPassword(user.getPasswordHash());
        }
    }
}
