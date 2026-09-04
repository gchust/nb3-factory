# NocoBase 3 Verification Repair

前一次实现没有通过工厂验证。请直接检查当前工作区并修复根因，不要回滚已经正确完成的业务功能。

仍须遵守原任务的所有约束，尤其是：不得修改 `.github/`、`.npmrc`、`.gitmodules`，不得执行任何 Git 发布操作，也不得通过删除测试、降低校验强度或伪造结果来让验证通过。

## 原始任务

<original-task>
{{ORIGINAL_TASK}}
</original-task>

## 验证日志（末尾最多 60000 字符）

```text
{{VERIFY_LOG}}
```

日志可能包含 Agent Browser 登录后的实际操作报告和复现步骤。请根据可观察到的 UI/API 缺陷修复代码；不得篡改浏览器报告或测试证据。修复后重新运行与失败相关的检查，并说明修改与验证结果。
