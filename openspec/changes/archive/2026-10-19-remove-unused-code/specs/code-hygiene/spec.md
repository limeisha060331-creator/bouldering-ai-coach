## ADDED Requirements

### Requirement: 仓库不保留未使用的类型导入

`lib/` 与 `app/` 下的 TypeScript 源码 SHALL 不包含未被引用的导入与类型引用。
这类残留 MUST 由编译器检查发现，而不是靠人工阅读。

#### Scenario: 未使用的类型导入使检查失败

- **WHEN** 有人从 `./types` 导入一个类型但没有在任何位置引用
- **THEN** 根目录运行 `npm run check:unused` 以非零退出码结束，并输出文件与行列号
- **AND** `desktop/` 目录下的同名脚本对桌面端代码给出同样的结论

#### Scenario: 清理后桌面端测试结果不退化

- **WHEN** 删掉一个未使用的类型导入后运行 `desktop` 的 `npm test`
- **THEN** 失败用例数量不增加。当前基线是 143 通过 / 1 既有失败
  （`tests/unit/analysis-db.test.ts > patch 不存在的记录会抛错`），那个失败与未使用导入无关
