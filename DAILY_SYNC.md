# 每日日志与 GitHub 同步流程

适用目录：`d:\zip`

## 每天收尾必做
1. 更新 `CODEX_LOG.md`，写明：
- 今日完成项
- 关键决策
- 风险与待办

2. 执行 Git 提交与推送：
```bash
git -C d:\zip status
git -C d:\zip add -A
git -C d:\zip commit -m "feat: <当日变更摘要>"
git -C d:\zip push
```

## 推荐提交信息模板
- `feat: ...` 新功能
- `fix: ...` 缺陷修复
- `refactor: ...` 重构
- `docs: ...` 文档更新
- `chore: ...` 工程维护

## 失败处理
- 认证失败：先完成 GitHub 登录或 PAT 配置，再重试 `git push`。
- 冲突失败：先 `git pull --rebase` 解决冲突，再 `git push`。
- 大文件失败：将大文件加入 `.gitignore`，移出暂存后重新提交。

## 发布前检查
- 关键页面文案为中文，且无乱码。
- 文本文件编码为 UTF-8（无 BOM）。
- 关键流程可用：登录、账号管理、权限变更生效。
