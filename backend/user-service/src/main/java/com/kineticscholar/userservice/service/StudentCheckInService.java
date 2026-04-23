package com.kineticscholar.userservice.service;

import com.kineticscholar.userservice.model.StudentCheckInCalendarView;

public interface StudentCheckInService {
    StudentCheckInCalendarView getCalendarView(Long userId, int year, int month);
    StudentCheckInCalendarView checkInToday(Long userId);
}
