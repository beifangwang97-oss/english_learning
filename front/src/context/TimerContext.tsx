import React, { createContext, useContext, useState } from 'react';

interface TimerContextType {
  startTime: Date | null;
  endTime: Date | null;
  startTimer: () => void;
  pauseTimer: () => void;
  resetTimer: () => void;
}

const TimerContext = createContext<TimerContextType | undefined>(undefined);

export const TimerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [endTime, setEndTime] = useState<Date | null>(null);

  const startTimer = React.useCallback(() => {
    setStartTime(new Date());
    setEndTime(null);
  }, []);

  const pauseTimer = React.useCallback(() => {
    setEndTime(new Date());
  }, []);

  const resetTimer = React.useCallback(() => {
    setStartTime(null);
    setEndTime(null);
  }, []);

  return (
    <TimerContext.Provider value={{ startTime, endTime, startTimer, pauseTimer, resetTimer }}>
      {children}
    </TimerContext.Provider>
  );
};

export const useTimer = () => {
  const context = useContext(TimerContext);
  if (context === undefined) {
    throw new Error('useTimer must be used within a TimerProvider');
  }
  return context;
};
