// 异步状态 Hook：加载数据并暴露 reload。
// loader 通过 ref 保持最新引用，避免依赖项误触发；触发时机由调用方提供的 deps 控制。

import { useCallback, useEffect, useRef, useState } from 'react';
import { toAppError } from '../../../shared/utils/result';
import type { AppError, Result } from '../../../shared/types/base';

export interface AsyncState<T> {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: T | null;
  error: AppError | null;
}

export function useAsyncState<T>(
  loader: () => Promise<Result<T>>,
  deps: readonly unknown[],
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    status: 'idle',
    data: null,
    error: null,
  });
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const run = useCallback(() => {
    let cancelled = false;
    setState((s) => ({ ...s, status: 'loading' }));
    loaderRef
      .current()
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setState({ status: 'success', data: res.value, error: null });
        } else {
          setState({ status: 'error', data: null, error: res.error });
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setState({ status: 'error', data: null, error: toAppError(cause) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const cleanup = run();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps]);

  return { ...state, reload: run };
}
