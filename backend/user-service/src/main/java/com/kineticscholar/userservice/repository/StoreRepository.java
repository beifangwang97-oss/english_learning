package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.Store;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface StoreRepository extends JpaRepository<Store, Long> {
    boolean existsByStoreCode(String storeCode);
    Optional<Store> findByStoreCode(String storeCode);
}
