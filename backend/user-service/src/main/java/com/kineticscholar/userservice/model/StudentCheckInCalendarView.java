package com.kineticscholar.userservice.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class StudentCheckInCalendarView {
    private int year;
    private int month;
    private List<Integer> checkedInDates;
    private boolean todayCheckedIn;
    private int streakDays;
}
