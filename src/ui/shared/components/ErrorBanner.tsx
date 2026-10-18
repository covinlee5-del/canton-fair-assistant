import type { AppError } from '../../../shared/types/base';
import { Button } from './Button';

interface ErrorBannerProps {
  error: AppError | null;
  onRetry?: () => void;
}

export function ErrorBanner({ error, onRetry }: ErrorBannerProps) {
  if (!error) return null;
  return (
    <div className="error-banner" role="alert">
      <div className="error-message">{error.message}</div>
      {error.detail ? (
        <details>
          <summary>开发调试信息</summary>
          <pre>{error.detail}</pre>
        </details>
      ) : null}
      {onRetry ? (
        <div className="row" style={{ marginTop: 8 }}>
          <Button onClick={onRetry}>重试</Button>
        </div>
      ) : null}
    </div>
  );
}
