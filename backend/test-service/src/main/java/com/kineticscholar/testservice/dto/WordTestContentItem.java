package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class WordTestContentItem {
    private String entryId;
    private String sourceTag;
    private String word;
    private String phonetic;
    private String meaning;
    private String pos;
    private String wordAudio;
}
