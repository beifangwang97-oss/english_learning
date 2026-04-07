package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.User;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface UserRepository extends JpaRepository<User, Long> {
    Optional<User> findByUsername(String username);
    boolean existsByUsername(String username);
    long countByStoreName(String storeName);
    long countByRoleAndOnlineStatus(String role, Integer onlineStatus);
    List<User> findByRoleAndOnlineStatus(String role, Integer onlineStatus);
}
