interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="flex items-start justify-between gap-3 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3"
    >
      <p className="text-sm text-danger">{message}</p>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-medium text-danger hover:underline"
        >
          Dismiss
        </button>
      )}
    </div>
  );
}
