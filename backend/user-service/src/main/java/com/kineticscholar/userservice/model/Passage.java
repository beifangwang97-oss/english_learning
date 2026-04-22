package com.kineticscholar.userservice.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Entity
@Table(
        name = "passages",
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_passage_uid", columnNames = {"passage_uid"}),
                @UniqueConstraint(name = "uk_passage_scope_target", columnNames = {
                        "book_version", "grade", "semester", "unit_name", "section", "label"
                })
        },
        indexes = {
                @Index(name = "idx_passage_scope", columnList = "book_version,grade,semester"),
                @Index(name = "idx_passage_scope_unit", columnList = "book_version,grade,semester,unit_name")
        }
)
public class Passage {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "passage_uid", nullable = false, length = 64)
    private String passageUid;

    @Column(nullable = false, length = 20)
    private String type;

    @Column(name = "unit_name", nullable = false, length = 50)
    private String unitName;

    @Column(name = "unit_no")
    private Integer unitNo;

    @Column(name = "is_starter", nullable = false)
    private boolean starter;

    @Column(nullable = false, length = 20)
    private String section;

    @Column(nullable = false, length = 100)
    private String label;

    @Column(name = "labels_text", columnDefinition = "text")
    private String labelsText;

    @Column(name = "display_label", length = 100)
    private String displayLabel;

    @Column(name = "task_kind", length = 100)
    private String taskKind;

    @Column(name = "target_id", nullable = false, length = 100)
    private String targetId;

    @Column(nullable = false, length = 255)
    private String title;

    @Column(name = "passage_text_en", nullable = false, columnDefinition = "text")
    private String passageTextEn;

    @Column(name = "source_pages", nullable = false, columnDefinition = "text")
    private String sourcePages;

    @Column(name = "matched_labels_text", columnDefinition = "text")
    private String matchedLabelsText;

    @Column(name = "source_line")
    private Integer sourceLine;

    @Column(name = "raw_scope_line", columnDefinition = "text")
    private String rawScopeLine;

    @Column(name = "book_version", nullable = false, length = 100)
    private String bookVersion;

    @Column(nullable = false, length = 50)
    private String grade;

    @Column(nullable = false, length = 20)
    private String semester;

    @Column(name = "source_file", length = 255)
    private String sourceFile;

    @OneToMany(mappedBy = "passage", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("sentenceNo ASC, id ASC")
    private List<PassageSentence> sentences = new ArrayList<>();

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
