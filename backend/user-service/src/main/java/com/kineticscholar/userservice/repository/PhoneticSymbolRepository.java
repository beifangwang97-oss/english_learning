package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.PhoneticSymbol;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface PhoneticSymbolRepository extends JpaRepository<PhoneticSymbol, Long> {
    List<PhoneticSymbol> findAllByOrderByCategoryAscPhonemeUidAscIdAsc();

    Optional<PhoneticSymbol> findByPhonemeUid(String phonemeUid);

    boolean existsByPhonemeUid(String phonemeUid);

    boolean existsByPhonetic(String phonetic);

    long countByCategory(String category);

    void deleteByPhonemeUid(String phonemeUid);
}
