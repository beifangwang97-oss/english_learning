package com.kineticscholar.userservice.service.impl;

import com.kineticscholar.userservice.model.StudentCheckInCalendarView;
import com.kineticscholar.userservice.model.StudentCheckInRecord;
import com.kineticscholar.userservice.repository.StudentCheckInRecordRepository;
import com.kineticscholar.userservice.service.StudentCheckInService;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

@Service
public class StudentCheckInServiceImpl implements StudentCheckInService {

    private static final ZoneId SHANGHAI_ZONE = ZoneId.of("Asia/Shanghai");

    private final StudentCheckInRecordRepository studentCheckInRecordRepository;

    public StudentCheckInServiceImpl(StudentCheckInRecordRepository studentCheckInRecordRepository) {
        this.studentCheckInRecordRepository = studentCheckInRecordRepository;
    }

    @Override
    public StudentCheckInCalendarView getCalendarView(Long userId, int year, int month) {
        validateYearMonth(year, month);
        LocalDate today = LocalDate.now(SHANGHAI_ZONE);
        YearMonth targetMonth = YearMonth.of(year, month);
        LocalDate startDate = targetMonth.atDay(1);
        LocalDate endDate = targetMonth.atEndOfMonth();
        List<StudentCheckInRecord> monthRecords = studentCheckInRecordRepository
                .findByUserIdAndCheckInDateBetweenOrderByCheckInDateAsc(userId, startDate, endDate);
        List<Integer> checkedInDates = monthRecords.stream()
                .map(StudentCheckInRecord::getCheckInDate)
                .map(LocalDate::getDayOfMonth)
                .distinct()
                .toList();
        boolean todayCheckedIn = targetMonth.equals(YearMonth.from(today))
                && checkedInDates.contains(today.getDayOfMonth());
        int streakDays = calculateStreakDays(userId, today);
        return new StudentCheckInCalendarView(year, month, checkedInDates, todayCheckedIn, streakDays);
    }

    @Override
    public StudentCheckInCalendarView checkInToday(Long userId) {
        LocalDate today = LocalDate.now(SHANGHAI_ZONE);
        if (!studentCheckInRecordRepository.existsByUserIdAndCheckInDate(userId, today)) {
            StudentCheckInRecord record = new StudentCheckInRecord();
            record.setUserId(userId);
            record.setCheckInDate(today);
            try {
                studentCheckInRecordRepository.save(record);
            } catch (DataIntegrityViolationException ignored) {
                // Another request may have inserted the same day record first.
            }
        }
        return getCalendarView(userId, today.getYear(), today.getMonthValue());
    }

    private int calculateStreakDays(Long userId, LocalDate today) {
        List<StudentCheckInRecord> records = studentCheckInRecordRepository.findByUserIdOrderByCheckInDateDesc(userId);
        if (records.isEmpty()) {
            return 0;
        }
        Set<LocalDate> dates = records.stream()
                .map(StudentCheckInRecord::getCheckInDate)
                .collect(Collectors.toSet());
        if (!dates.contains(today)) {
            return 0;
        }
        int streak = 0;
        LocalDate cursor = today;
        while (dates.contains(cursor)) {
            streak++;
            cursor = cursor.minusDays(1);
        }
        return streak;
    }

    private void validateYearMonth(int year, int month) {
        if (year < 2000 || year > 2100) {
            throw new RuntimeException("Invalid year");
        }
        if (month < 1 || month > 12) {
            throw new RuntimeException("Invalid month");
        }
    }
}
