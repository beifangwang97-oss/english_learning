package com.kineticscholar.userservice.service;

import com.kineticscholar.userservice.model.User;
import java.util.List;
import java.util.Optional;

public interface UserService {
    User register(User user);
    Optional<User> login(String username, String password);
    Optional<User> getUserById(Long id);
    Optional<User> getUserByUsername(String username);
    List<User> getAllUsers();
    List<User> getUsersByRole(String role);
    User updateUser(Long id, User user);
    void deleteUser(Long id);
    boolean isUserActive(String username);
    void markOnline(String username);
    void markOffline(String username);
    long countOnlineByRole(String role);
}
