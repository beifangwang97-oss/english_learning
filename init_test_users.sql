-- 初始化测试账号的 SQL 脚本

-- 删除现有的测试账号
DELETE FROM users WHERE username IN ('student', 'teacher', 'admin');

-- 插入学生账号
INSERT INTO users (username, password_hash, role, name, avatar, is_active, created_at, updated_at)
VALUES (
    'student',
    '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
    'student',
    '张三 (Zhang San)',
    'https://example.com/student-avatar.jpg',
    true,
    NOW(),
    NOW()
);

-- 插入教师账号
INSERT INTO users (username, password_hash, role, name, avatar, is_active, created_at, updated_at)
VALUES (
    'teacher',
    '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
    'teacher',
    'Sarah Jenkins',
    'https://example.com/teacher-avatar.jpg',
    true,
    NOW(),
    NOW()
);

-- 插入管理员账号
INSERT INTO users (username, password_hash, role, name, avatar, is_active, created_at, updated_at)
VALUES (
    'admin',
    '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW',
    'admin',
    'Admin User',
    'https://example.com/admin-avatar.jpg',
    true,
    NOW(),
    NOW()
);

-- 注意：密码哈希值是 '123' 的 BCrypt 加密结果
