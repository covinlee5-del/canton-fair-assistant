import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDbForTests } from '../../src/data/db';
import { CopyRepository } from '../../src/data/copy-repository';
import { createCopy, deleteCopy, listCopies, setDefaultCopy, validateCopyInput } from '../../src/services/copy-service';

const input = { name: '英文开场', content: 'Hello, may I help you?', language: 'en' as const, scenario: 'GENERAL' as const, tags: ['intro'] };

beforeEach(async () => { await resetDbForTests(); });

describe('阶段 4 文案服务', () => {
  it('拒绝空内容并规范化标签', () => {
    expect(validateCopyInput({ ...input, content: ' ' }).ok).toBe(false);
    const result = validateCopyInput({ ...input, tags: [' intro ', 'intro', ''] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.tags).toEqual(['intro']);
  });

  it('创建、设默认、列表与删除', async () => {
    const repo = new CopyRepository();
    const created = await createCopy(repo, input);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const selected = await setDefaultCopy(repo, created.value.id);
    expect(selected.ok && selected.value.isDefault).toBe(true);
    const listed = await listCopies(repo);
    expect(listed.ok && listed.value).toHaveLength(1);
    const removed = await deleteCopy(repo, created.value.id);
    expect(removed.ok).toBe(true);
    const empty = await listCopies(repo);
    expect(empty.ok && empty.value).toHaveLength(0);
  });
});
