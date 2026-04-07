package com.kineticscholar.userservice.service.impl;

import com.kineticscholar.userservice.model.User;
import com.kineticscholar.userservice.repository.TextbookVersionTagRepository;
import com.kineticscholar.userservice.repository.UserRepository;
import com.kineticscholar.userservice.service.UserService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;
import java.util.Locale;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Service
public class UserServiceImpl implements UserService {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private TextbookVersionTagRepository textbookVersionTagRepository;

    @Override
    public User register(User user) {
        normalizeAccountIdentity(user);
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
        if (user.isPresent()) {
            if (passwordEncoder.matches(password, user.get().getPasswordHash())) {
                User u = user.get();
                if (!u.isActive()) {
                    throw new RuntimeException("Account is disabled");
                }
                LocalDate today = LocalDate.now();
                if (u.getExpireDate() == null || today.isAfter(u.getExpireDate())) {
                    throw new RuntimeException("Account has expired");
                }
                if (u.getOnlineStatus() != null && u.getOnlineStatus() == 1) {
                    throw new RuntimeException("Account already online, please logout from other device first");
                }
                u.setOnlineStatus(1);
                u.setLastActiveAt(LocalDateTime.now());
                userRepository.save(u);
                return user;
            }
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
        if (user.getUsername() != null && !user.getUsername().isBlank()
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
        if (user.getTextbookVersion() != null) {
            updatedUser.setTextbookVersion(user.getTextbookVersion());
        }
        if (user.getGrade() != null) {
            updatedUser.setGrade(user.getGrade());
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

        // Keep username and phone consistent for student/teacher accounts.
        normalizeAccountIdentity(updatedUser);
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

    private void normalizeAccountIdentity(User user) {
        if (user == null || user.getRole() == null) {
            return;
        }
        if ("student".equalsIgnoreCase(user.getRole()) || "teacher".equalsIgnoreCase(user.getRole())) {
            String username = user.getUsername();
            String phone = user.getPhone();

            if ((username == null || username.isBlank()) && phone != null && !phone.isBlank()) {
                user.setUsername(phone);
                username = phone;
            }
            if ((phone == null || phone.isBlank()) && username != null && !username.isBlank()) {
                user.setPhone(username);
                phone = username;
            }
            if (username != null && !username.isBlank()) {
                user.setPhone(username);
            }
        }
    }

    private void validateBusinessRules(User user) {
        if (user == null || user.getRole() == null) {
            return;
        }
        if ("student".equalsIgnoreCase(user.getRole()) || "teacher".equalsIgnoreCase(user.getRole())) {
            if (user.getUsername() == null || !user.getUsername().matches("^1\\d{10}$")) {
                throw new RuntimeException("Username must be a valid 11-digit mobile number");
            }
            if (user.getName() == null || user.getName().isBlank()) {
                throw new RuntimeException("Name is required");
            }
            if (user.getLoginPassword() == null || user.getLoginPassword().isBlank()) {
                throw new RuntimeException("Password is required");
            }
            if (user.getStoreName() == null || user.getStoreName().isBlank()) {
                throw new RuntimeException("Store is required");
            }
            if (user.getExpireDate() == null) {
                throw new RuntimeException("Expire date is required");
            }
        }
        if ("student".equalsIgnoreCase(user.getRole())) {
            String normalizedVersion = normalizeTextbookVersion(user.getTextbookVersion());
            if (normalizedVersion.isBlank()) {
                throw new RuntimeException("Textbook version is required");
            }
            if (!textbookVersionTagRepository.existsByName(normalizedVersion)) {
                throw new RuntimeException("Invalid textbook version");
            }
            user.setTextbookVersion(normalizedVersion);
            if (user.getGrade() == null || user.getGrade().isBlank()) {
                throw new RuntimeException("Grade is required");
            }
        }
    }

    private String normalizeTextbookVersion(String value) {
        if (value == null) return "";
        String s = value.trim();
        if (s.isBlank()) return "";
        String upper = s.toUpperCase(Locale.ROOT);
        if ("PEP".equals(upper) || s.contains("人教")) return "人教版";
        if ("FLTRP".equals(upper) || s.contains("外研")) return "外研版";
        if ("SHJ".equals(upper) || s.contains("沪教")) return "沪教版";
        return s;
    }
}
