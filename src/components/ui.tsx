import { useRef, useState, type ReactNode } from 'react';

export function FileDropzone({
  testId,
  accept,
  multiple = false,
  title,
  hint,
  buttonLabel = '파일 선택',
  onFiles,
}: {
  testId: string;
  accept: string;
  multiple?: boolean;
  title: string;
  hint: string;
  buttonLabel?: string;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handle(list: FileList | null) {
    if (!list || list.length === 0) return;
    onFiles(Array.from(list));
  }

  return (
    <>
      <input
        ref={inputRef}
        id={`${testId}-input`}
        className="file-input"
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(event) => {
          handle(event.target.files);
          // 같은 파일을 다시 골라도 change가 발생하도록 초기화한다.
          event.target.value = '';
        }}
        data-testid={`${testId}-input`}
      />
      <div
        className={`dropzone${dragOver ? ' dropzone-over' : ''}`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          handle(event.dataTransfer?.files ?? null);
        }}
        data-testid={`${testId}-dropzone`}
      >
        <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" className="drop-icon">
          <path
            d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <p className="drop-title">{title}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => inputRef.current?.click()}
          data-testid={`${testId}-select-button`}
        >
          {buttonLabel}
        </button>
        <p className="hint">{hint}</p>
      </div>
    </>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; testId: string; title?: string }[];
  onChange: (value: T) => void;
  hint?: ReactNode;
}) {
  return (
    <div className="control-group">
      <span className="field-label">{label}</span>
      <div className="segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`segment${value === option.value ? ' segment-active' : ''}`}
            aria-pressed={value === option.value}
            title={option.title}
            onClick={() => onChange(option.value)}
            data-testid={option.testId}
          >
            {option.label}
          </button>
        ))}
      </div>
      {hint ? <p className="hint">{hint}</p> : null}
    </div>
  );
}

export function RangeControl({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
  testId,
  scaleLeft,
  scaleRight,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
  testId: string;
  scaleLeft?: string;
  scaleRight?: string;
}) {
  return (
    <div className="control-group">
      <label className="field-label" htmlFor={testId}>
        {label} <span className="value-badge">{display}</span>
      </label>
      <input
        id={testId}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        data-testid={testId}
      />
      {scaleLeft || scaleRight ? (
        <div className="range-scale">
          <span>{scaleLeft}</span>
          <span>{scaleRight}</span>
        </div>
      ) : null}
    </div>
  );
}

export function ErrorAlert({ message, testId }: { message: string | null; testId: string }) {
  if (!message) return null;
  return (
    <p className="alert alert-error" role="alert" data-testid={testId}>
      {message}
    </p>
  );
}
