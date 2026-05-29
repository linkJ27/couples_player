# Git 工作流

## 仓库状态

本地仓库目录：

```text
E:\Code\couples_player
```

默认分支：

```text
main
```

预期远程仓库：

```text
origin https://github.com/linkJ27/couples_player.git
```

当前远程仓库需要在 GitHub 上先创建。创建后可直接推送：

```powershell
git push -u origin main
```

## 分支策略

`main` 保持可运行、可打包或至少文档一致。功能开发使用短分支：

```text
feature/desktop-shell
feature/player-adapter
feature/signaling-service
feature/file-matcher
feature/sync-engine
feature/playlist
feature/reactions
```

修复使用：

```text
fix/<short-description>
```

实验性方案使用：

```text
spike/<topic>
```

## 提交规则

提交信息使用简短动词短语：

```text
Add desktop shell
Implement room join flow
Define playback sync schema
Fix subtitle offset persistence
```

每个提交尽量只包含一个意图：

- 文档和代码分开提交。
- 机械格式化和行为变更分开提交。
- 依赖升级和功能变更分开提交。

## 开发节奏

每个功能分支至少包含：

1. 设计或任务说明。
2. 实现代码。
3. 本地验证命令。
4. 必要的测试。

合并前检查：

```powershell
git status --short --branch
git diff --stat main...
```

## 远程创建方式

如果安装了 GitHub CLI：

```powershell
gh repo create linkJ27/couples_player --private --source . --remote origin --push
```

如果不用 GitHub CLI：

1. 在 GitHub 创建私有仓库 `couples_player`。
2. owner 选择 `linkJ27`。
3. 不要勾选初始化 README、`.gitignore` 或 license。
4. 回到本地执行：

```powershell
git push -u origin main
```

