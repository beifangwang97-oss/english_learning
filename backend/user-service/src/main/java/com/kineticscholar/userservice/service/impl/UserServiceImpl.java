package com.kineticscholar.userservice.service.impl;

import com.kineticscholar.userservice.model.User;
import com.kineticscholar.userservice.repository.TextbookVersionTagRepository;
import com.kineticscholar.userservice.repository.UserRepository;
import com.kineticscholar.userservice.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.nio.charset.Charset;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

@Service
public class UserServiceImpl implements UserService {
    private static final Charset GBK = Charset.forName("GBK");
    private static final int[] CHINESE_INITIAL_BOUNDARIES = {
            1601, 1637, 1833, 2078, 2274, 2302, 2433, 2594, 2787, 3106, 3212,
            3472, 3635, 3722, 3730, 3858, 4027, 4086, 4390, 4558, 4684, 4925, 5249, 5600
    };
    private static final char[] CHINESE_INITIALS = {
            'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J', 'K', 'L', 'M',
            'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'W', 'X', 'Y', 'Z'
    };

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private TextbookVersionTagRepository textbookVersionTagRepository;

    @Override
    public User register(User user) {
        prepareAccountIdentity(user, null);
        validateBusinessRules(user);
        if (userRepository.existsByUsername(user.getUsername())) {
            throw new RuntimeException("Username already exists");
        }

        String rawPassword = user.getLoginPassword();
        if (rawPassword == null || rawPassword.isBlank()) {
            rawPassword = user.getPasswordHash();
        }
        if (rawPassword == null || rawPassword.isBlank()) {
            throw new RuntimeException("Password is required");
        }

        user.setLoginPassword(rawPassword);
        user.setPasswordHash(passwordEncoder.encode(rawPassword));
        return userRepository.save(user);
    }

    @Override
    public Optional<User> login(String username, String password) {
        Optional<User> user = userRepository.findByUsername(username);
        if (user.isPresent() && passwordEncoder.matches(password, user.get().getPasswordHash())) {
            User u = user.get();
            if (!u.isActive()) {
                throw new RuntimeException("Account is disabled");
            }
            LocalDate today = LocalDate.now();
            if (u.getExpireDate() == null || today.isAfter(u.getExpireDate())) {
                throw new RuntimeException("Account has expired");
            }
            u.setOnlineStatus(1);
            u.setLastActiveAt(LocalDateTime.now());
            userRepository.save(u);
            return user;
        }
        return Optional.empty();
    }

    @Override
    public Optional<User> getUserById(Long id) {
        return userRepository.findById(id);
    }

    @Override
    public Optional<User> getUserByUsername(String username) {
        return userRepository.findByUsername(username);
    }

    @Override
    public List<User> getAllUsers() {
        return userRepository.findAll();
    }

    @Override
    public List<User> getUsersByRole(String role) {
        return userRepository.findAll().stream()
                .filter(user -> user.getRole().equals(role))
                .toList();
    }

    @Override
    public User updateUser(Long id, User user) {
        Optional<User> existingUser = userRepository.findById(id);
        if (existingUser.isEmpty()) {
            throw new RuntimeException("User not found");
        }

        User updatedUser = existingUser.get();
        String targetRole = user.getRole() != null && !user.getRole().isBlank() ? user.getRole() : updatedUser.getRole();

        if (!"student".equalsIgnoreCase(targetRole)
                && user.getUsername() != null
                && !user.getUsername().isBlank()
                && !user.getUsername().equals(updatedUser.getUsername())) {
            if (userRepository.existsByUsername(user.getUsername())) {
                throw new RuntimeException("Username already exists");
            }
            updatedUser.setUsername(user.getUsername());
        }
        if (user.getName() != null) {
            updatedUser.setName(user.getName());
        }
        if (user.getRole() != null && !user.getRole().isBlank()) {
            updatedUser.setRole(user.getRole());
        }
        if (user.getLoginPassword() != null && !user.getLoginPassword().isBlank()) {
            updatedUser.setLoginPassword(user.getLoginPassword());
            updatedUser.setPasswordHash(passwordEncoder.encode(user.getLoginPassword()));
        }
        if (user.getAvatar() != null) {
            updatedUser.setAvatar(user.getAvatar());
        }
        if (user.getPhone() != null) {
            updatedUser.setPhone(user.getPhone());
        }
        if (user.getStoreName() != null) {
            updatedUser.setStoreName(user.getStoreName());
        }
        if (user.getExpireDate() != null) {
            updatedUser.setExpireDate(user.getExpireDate());
        }
        if (user.isActive() != updatedUser.isActive()) {
            updatedUser.setActive(user.isActive());
        }
        if ("student".equalsIgnoreCase(updatedUser.getRole())) {
            if (user.getTextbookVersion() != null) {
                updatedUser.setTextbookVersion(user.getTextbookVersion());
            }
            if (user.getGrade() != null) {
                updatedUser.setGrade(user.getGrade());
            }
        } else {
            updatedUser.setTextbookVersion(null);
            updatedUser.setGrade(null);
        }

        prepareAccountIdentity(updatedUser, updatedUser.getId());
        validateBusinessRules(updatedUser);

        return userRepository.save(updatedUser);
    }

    @Override
    public void deleteUser(Long id) {
        userRepository.deleteById(id);
    }

    @Override
    public boolean isUserActive(String username) {
        Optional<User> user = userRepository.findByUsername(username);
        return user.isPresent() && user.get().isActive();
    }

    @Override
    public void markOnline(String username) {
        userRepository.findByUsername(username).ifPresent(user -> {
            user.setOnlineStatus(1);
            user.setLastActiveAt(LocalDateTime.now());
            userRepository.save(user);
        });
    }

    @Override
    public void markOffline(String username) {
        userRepository.findByUsername(username).ifPresent(user -> {
            user.setOnlineStatus(0);
            user.setLastActiveAt(LocalDateTime.now());
            userRepository.save(user);
        });
    }

    @Override
    public long countOnlineByRole(String role) {
        return userRepository.countByRoleAndOnlineStatus(role, 1);
    }

    private void prepareAccountIdentity(User user, Long currentUserId) {
        if (user == null || user.getRole() == null) {
            return;
        }
        if ("teacher".equalsIgnoreCase(user.getRole())) {
            normalizeTeacherIdentity(user);
            return;
        }
        if ("student".equalsIgnoreCase(user.getRole())) {
            String generatedLoginId = generateStudentLoginId(user, currentUserId);
            user.setUsername(generatedLoginId);
        }
    }

    private void normalizeTeacherIdentity(User user) {
        String username = safeTrim(user.getUsername());
        String phone = safeTrim(user.getPhone());

        if (username.isBlank() && !phone.isBlank()) {
            user.setUsername(phone);
            username = phone;
        }
        if (phone.isBlank() && !username.isBlank()) {
            user.setPhone(username);
            phone = username;
        }
        if (!username.isBlank()) {
            user.setPhone(username);
        }
    }

    private void validateBusinessRules(User user) {
        if (user == null || user.getRole() == null) {
            return;
        }
        if ("teacher".equalsIgnoreCase(user.getRole())) {
            validateTeacherRules(user);
            return;
        }
        if ("student".equalsIgnoreCase(user.getRole())) {
            validateStudentRules(user);
        }
    }

    private void validateTeacherRules(User user) {
        if (safeTrim(user.getUsername()).isBlank() || !user.getUsername().matches("^1\\d{10}$")) {
            throw new RuntimeException("Teacher username must be a valid 11-digit mobile number");
        }
        if (user.getName() == null || user.getName().isBlank()) {
            throw new RuntimeException("Name is required");
        }
        if (user.getLoginPassword() == null || user.getLoginPassword().isBlank()) {
            throw new RuntimeException("Password is required");
        }
        if (safeTrim(user.getStoreName()).isBlank()) {
            throw new RuntimeException("Store is required");
        }
        if (user.getExpireDate() == null) {
            throw new RuntimeException("Expire date is required");
        }
    }

    private void validateStudentRules(User user) {
        if (safeTrim(user.getUsername()).isBlank()) {
            throw new RuntimeException("Student login id generation failed");
        }
        if (user.getName() == null || user.getName().isBlank()) {
            throw new RuntimeException("Name is required");
        }
        if (user.getLoginPassword() == null || user.getLoginPassword().isBlank()) {
            throw new RuntimeException("Password is required");
        }
        if (safeTrim(user.getPhone()).isBlank()) {
            throw new RuntimeException("Contact is required");
        }
        if (safeTrim(user.getStoreName()).isBlank()) {
            throw new RuntimeException("Store is required");
        }
        if (user.getExpireDate() == null) {
            throw new RuntimeException("Expire date is required");
        }
        String textbookVersion = user.getTextbookVersion() == null ? "" : user.getTextbookVersion().trim();
        if (textbookVersion.isBlank()) {
            throw new RuntimeException("Textbook version is required");
        }
        if (!textbookVersionTagRepository.existsByName(textbookVersion)) {
            throw new RuntimeException("Invalid textbook version");
        }
        user.setTextbookVersion(textbookVersion);
        if (user.getGrade() == null || user.getGrade().isBlank()) {
            throw new RuntimeException("Grade is required");
        }
    }

    private String generateStudentLoginId(User user, Long currentUserId) {
        String storePart = deriveStoreSuffix(user.getStoreName());
        String contactPart = deriveContactTail(user.getPhone());
        String initialsPart = extractNameInitials(user.getName());
        String base = (storePart + contactPart + initialsPart).toUpperCase();
        if (base.isBlank()) {
            base = "000000X";
        }
        String candidate = base;
        int suffix = 1;
        while (usernameTakenByOtherUser(candidate, currentUserId)) {
            candidate = base + String.format("%02d", suffix++);
        }
        return candidate;
    }

    private boolean usernameTakenByOtherUser(String username, Long currentUserId) {
        return userRepository.findByUsername(username)
                .map(user -> !Objects.equals(user.getId(), currentUserId))
                .orElse(false);
    }

    private String deriveStoreSuffix(String storeName) {
        String normalized = safeTrim(storeName);
        String digits = normalized.replaceAll("\\D", "");
        if (!digits.isBlank()) {
            return digits.length() <= 3 ? String.format("%03d", Integer.parseInt(digits)) : digits.substring(digits.length() - 3);
        }
        String alnum = normalized.replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        if (alnum.isBlank()) return "000";
        return alnum.length() <= 3 ? String.format("%3s", alnum).replace(' ', '0') : alnum.substring(alnum.length() - 3);
    }

    private String deriveContactTail(String contact) {
        String normalized = safeTrim(contact).replaceAll("[^A-Za-z0-9]", "").toUpperCase();
        if (normalized.isBlank()) return "0000";
        if (normalized.length() >= 4) {
            return normalized.substring(normalized.length() - 4);
        }
        return String.format("%4s", normalized).replace(' ', '0');
    }

    private String extractNameInitials(String name) {
        String normalized = safeTrim(name);
        if (normalized.isBlank()) return "X";

        StringBuilder initials = new StringBuilder();
        boolean asciiSegmentStarted = false;
        for (int i = 0; i < normalized.length() && initials.length() < 3; i++) {
            char ch = normalized.charAt(i);
            if (Character.isWhitespace(ch) || isCommonSeparator(ch)) {
                asciiSegmentStarted = false;
                continue;
            }
            if (isAsciiLetter(ch)) {
                if (!asciiSegmentStarted) {
                    initials.append(Character.toUpperCase(ch));
                }
                asciiSegmentStarted = true;
                continue;
            }
            asciiSegmentStarted = false;
            if (Character.UnicodeScript.of(ch) == Character.UnicodeScript.HAN) {
                initials.append(extractChineseInitial(ch));
            }
        }
        return initials.isEmpty() ? "X" : initials.toString();
    }

    private boolean isCommonSeparator(char ch) {
        return ch == '-' || ch == '_' || ch == '·' || ch == '.' || ch == '•';
    }

    private boolean isAsciiLetter(char ch) {
        return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z');
    }

    private char extractChineseInitial(char ch) {
        try {
            byte[] bytes = String.valueOf(ch).getBytes(GBK);
            if (bytes.length < 2) {
                return 'X';
            }
            int secPos = (bytes[0] & 0xFF) - 160;
            int secCode = (bytes[1] & 0xFF) - 160;
            int position = secPos * 100 + secCode;
            for (int i = CHINESE_INITIAL_BOUNDARIES.length - 1; i >= 0; i--) {
                if (position >= CHINESE_INITIAL_BOUNDARIES[i]) {
                    return CHINESE_INITIALS[i];
                }
            }
        } catch (Exception ignored) {
        }
        return 'X';
    }

    private String safeTrim(String value) {
        return value == null ? "" : value.trim();
    }
}
