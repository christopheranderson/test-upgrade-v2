import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({
  connect: vi.fn(), close: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), query: vi.fn(),
}));
vi.mock('mssql', () => ({ default: {
  ConnectionPool: class { connect = state.connect; close = state.close; },
  Transaction: class { begin = state.begin; commit = state.commit; rollback = state.rollback;
    request() { return { query: state.query }; } },
} }));
import { withOperationsLock, withSql } from '../src/sql.js';
beforeEach(() => {
  vi.resetAllMocks();
  for (const mock of Object.values(state)) mock.mockResolvedValue(undefined);
});
describe('SQL resource lifecycle', () => {
  it('closes its pool after success', async () => {
    expect(await withSql('test-only-token', async () => 42)).toBe(42);
    expect(state.connect).toHaveBeenCalledOnce();
    expect(state.close).toHaveBeenCalledOnce();
  });
  it('closes its pool if connecting or executing fails', async () => {
    state.connect.mockRejectedValueOnce(new Error('connect failed'));
    await expect(withSql('test-only-token', async () => 42)).rejects.toThrow('connect failed');
    expect(state.close).toHaveBeenCalledOnce();
    await expect(withSql('test-only-token', async () => { throw new Error('execute failed'); })).rejects.toThrow('execute failed');
    expect(state.close).toHaveBeenCalledTimes(2);
  });
  it('commits and releases the cross-instance lock after the managed write', async () => {
    const write = vi.fn(async () => 'saved');
    expect(await withOperationsLock('test-only-token', write)).toBe('saved');
    expect(state.query.mock.invocationCallOrder[0]).toBeLessThan(write.mock.invocationCallOrder[0]);
    expect(write.mock.invocationCallOrder[0]).toBeLessThan(state.commit.mock.invocationCallOrder[0]);
    expect(state.rollback).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });
  it('rolls back the lock transaction and propagates a write failure', async () => {
    await expect(withOperationsLock('test-only-token', async () => { throw new Error('write failed'); })).rejects.toThrow('write failed');
    expect(state.rollback).toHaveBeenCalledOnce();
    expect(state.commit).not.toHaveBeenCalled();
    expect(state.close).toHaveBeenCalledOnce();
  });
  it('does not execute a managed write when the lock cannot be acquired', async () => {
    state.query.mockRejectedValueOnce(new Error('workspace busy'));
    const write = vi.fn();
    await expect(withOperationsLock('test-only-token', write)).rejects.toThrow('workspace busy');
    expect(write).not.toHaveBeenCalled();
    expect(state.rollback).toHaveBeenCalledOnce();
  });
});
