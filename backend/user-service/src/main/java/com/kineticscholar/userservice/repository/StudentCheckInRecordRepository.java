package com.kineticscholar.userservice.repository;

import com.kineticscholar.userservice.model.StudentCheckInRecord;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.List;

public interface StudentCheckInRecordRepository extends JpaRepository<StudentCheckInRecord, Long> {
    boolean existsByUserIdAndCheckInDate(Long userId, LocalDate checkInDate);
    List<StudentCheckInRecord> findByUserIdAndCheckInDateBetweenOrderByCheckInDateAsc(Long userId, LocalDate startDate, LocalDate endDate);
    List<StudentCheckInRecord> findByUserIdOrderByCheckInDateDesc(Long userId);
}
