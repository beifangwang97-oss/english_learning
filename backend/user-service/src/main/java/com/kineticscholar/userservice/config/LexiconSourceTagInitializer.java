package com.kineticscholar.userservice.config;

import com.kineticscholar.userservice.repository.LexiconEntryRepository;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
public class LexiconSourceTagInitializer {

    private final LexiconEntryRepository lexiconEntryRepository;

    public LexiconSourceTagInitializer(LexiconEntryRepository lexiconEntryRepository) {
        this.lexiconEntryRepository = lexiconEntryRepository;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void backfillSourceTags() {
        lexiconEntryRepository.backfillMissingSourceTags("current_book");
    }
}
