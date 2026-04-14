package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class WordReviewContentItem {
    private String entryId;
    private String word;
    private String phonetic;
    private String meaning;
    private String pos;
    private String wordAudio;
    private String sentence;
    private String sentenceCn;
    private String sentenceAudio;
}
