package com.kineticscholar.userservice.config;

import com.kineticscholar.userservice.model.GradeTag;
import com.kineticscholar.userservice.model.SemesterTag;
import com.kineticscholar.userservice.model.TextbookVersionTag;
import com.kineticscholar.userservice.model.User;
import com.kineticscholar.userservice.repository.GradeTagRepository;
import com.kineticscholar.userservice.repository.SemesterTagRepository;
import com.kineticscholar.userservice.repository.TextbookVersionTagRepository;
import com.kineticscholar.userservice.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataInitializer implements CommandLineRunner {

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private PasswordEncoder passwordEncoder;
    @Autowired
    private TextbookVersionTagRepository textbookVersionTagRepository;
    @Autowired
    private GradeTagRepository gradeTagRepository;
    @Autowired
    private SemesterTagRepository semesterTagRepository;
    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Value("${app.seed-default-users:false}")
    private boolean seedDefaultUsers;

    @Override
    public void run(String... args) {
        ensureSchemaColumns();
        initGlobalTags();
        resetOnlineStatusToOffline();

        if (seedDefaultUsers) {
            upsertAdmin();
            upsertTeacher();
            upsertStudent();
        } else {
            cleanupLegacySeedUsers();
        }
    }

    private void ensureSchemaColumns() {
        jdbcTemplate.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS online_status integer NOT NULL DEFAULT 0");
        jdbcTemplate.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamp");
    }

    private void initGlobalTags() {
        String[] grades = {"一年级", "二年级", "三年级", "四年级", "五年级", "六年级", "七年级", "八年级", "九年级", "高一", "高二", "高三"};
        for (int i = 0; i < grades.length; i++) {
            String name = grades[i];
            if (!gradeTagRepository.existsByName(name)) {
                GradeTag tag = new GradeTag();
                tag.setName(name);
                tag.setSortOrder(i + 1);
                gradeTagRepository.save(tag);
            }
        }

        String[] semesters = {"上册", "下册", "全册"};
        for (int i = 0; i < semesters.length; i++) {
            String name = semesters[i];
            if (!semesterTagRepository.existsByName(name)) {
                SemesterTag tag = new SemesterTag();
                tag.setName(name);
                tag.setSortOrder(i + 1);
                semesterTagRepository.save(tag);
            }
        }

        if (!textbookVersionTagRepository.existsByName("人教版")) {
            TextbookVersionTag tag = new TextbookVersionTag();
            tag.setName("人教版");
            textbookVersionTagRepository.save(tag);
        }
    }

    private void resetOnlineStatusToOffline() {
        userRepository.findAll().forEach(u -> {
            u.setOnlineStatus(0);
            userRepository.save(u);
        });
    }

    private void cleanupLegacySeedUsers() {
        userRepository.findByUsername("student").ifPresent(userRepository::delete);
        userRepository.findByUsername("teacher").ifPresent(userRepository::delete);
    }

    private void upsertAdmin() {
        User admin = userRepository.findByUsername("admin").orElseGet(User::new);
        if (admin.getId() == null) {
            admin.setUsername("admin");
            admin.setActive(true);
        }
        admin.setName("Admin User");
        admin.setRole("admin");
        admin.setLoginPassword("123");
        admin.setPasswordHash(passwordEncoder.encode("123"));
        userRepository.save(admin);
    }

    private void upsertTeacher() {
        User teacher = userRepository.findByUsername("teacher").orElseGet(User::new);
        if (teacher.getId() == null) {
            teacher.setUsername("teacher");
            teacher.setActive(true);
        }
        teacher.setName("Teacher Seed");
        teacher.setRole("teacher");
        teacher.setLoginPassword("123");
        teacher.setPasswordHash(passwordEncoder.encode("123"));
        userRepository.save(teacher);
    }

    private void upsertStudent() {
        User student = userRepository.findByUsername("student").orElseGet(User::new);
        if (student.getId() == null) {
            student.setUsername("student");
            student.setActive(true);
        }
        student.setName("Student Seed");
        student.setRole("student");
        student.setLoginPassword("123");
        student.setPasswordHash(passwordEncoder.encode("123"));
        userRepository.save(student);
    }
}
