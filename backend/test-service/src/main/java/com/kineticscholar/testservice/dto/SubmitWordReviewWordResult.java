package com.kineticscholar.testservice.dto;

import lombok.Data;

@Data
public class SubmitWordReviewWordResult {
    private String entryId;
    private Boolean cardDone;
    private Boolean enToZhCorrect;
    private Boolean spellingCorrect;
    private Boolean zhToEnCorrect;
}
