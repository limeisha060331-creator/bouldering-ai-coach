## 1. 清理

- [x] 1.1 `lib/parse-analysis.ts`：从 `./types` 的导入里去掉 `BoulderGrade`
- [x] 1.2 根目录 `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` 无输出

## 2. 让检查可持续

- [x] 2.1 根 `package.json` 增加 `"check:unused": "tsc --noEmit --noUnusedLocals --noUnusedParameters"`
- [x] 2.2 `desktop/package.json` 增加同名脚本
- [x] 2.3 根与 desktop 各跑一次 `npm run check:unused`，均为空（exit 0）

## 3. 验证

- [x] 3.1 `desktop` 的 `npm test` 与基线一致：143 通过 / 1 既有失败（`analysis-db` 的 IndexedDB 用例，改动前即失败，与本次无关）
- [x] 3.2 `git diff` 只有一行导入改动 + 两个脚本
- [x] 3.3 `openspec validate remove-unused-code` 通过并归档

## 后续（不在本次范围）

- [ ] 4.1 修 `tests/unit/analysis-db.test.ts > patch 不存在的记录会抛错` 这个既有失败
- [ ] 4.2 根目录 `npm run lint` 的 15 个既有 error 单独立项修
- [ ] 4.3 把 `check:unused` 接进 CI（本仓目前没有 workflow）
