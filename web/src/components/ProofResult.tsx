import { useState } from 'react';
import type { ProofResult as ProofResultType } from '../types';

interface ProofResultProps {
  result: ProofResultType;
  title?: string;
  extra?: React.ReactNode;
}

export function ProofResult({ result, title = 'Proof Generated', extra }: ProofResultProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyProof = async () => {
    await navigator.clipboard.writeText(result.proof);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="proof-result success">
      <div className="proof-status">
        <span className="proof-status-icon text-success">[OK]</span>
        <span className="text-success">{title}</span>
      </div>

      {extra && <div className="mb-2">{extra}</div>}

      <div className="col">
        <div>
          <div className="row-between mb-1">
            <span className="text-small text-muted">
              PROOF ({result.proof.length} bytes)
            </span>
            <button onClick={copyProof} className="btn btn-secondary btn-small">
              {copied ? '[COPIED]' : '[COPY]'}
            </button>
          </div>
          <div>
            <code
              className={`text-small text-break ${expanded ? '' : ''}`}
              style={{
                display: 'block',
                maxHeight: expanded ? 'none' : '3em',
                overflow: 'hidden',
              }}
            >
              {result.proof}
            </code>
            {result.proof.length > 100 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="btn btn-secondary btn-small mt-1"
              >
                {expanded ? '[LESS]' : '[MORE]'}
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="text-small text-muted mb-1">
            PUBLIC INPUTS ({result.public_inputs.length})
          </div>
          <div className="col">
            {result.public_inputs.map((input, i) => (
              <code key={i} className="text-small text-break" style={{ background: 'var(--bg-secondary)', padding: '0.25rem 0.5ch' }}>
                [{i}] {input}
              </code>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

interface ProofLoadingProps {
  message?: string;
}

export function ProofLoading({ message = 'Generating proof...' }: ProofLoadingProps) {
  return (
    <div className="card-simple" style={{ background: 'var(--accent-subdued)' }}>
      <div className="row">
        <span className="loading text-accent">[...]</span>
        <div>
          <div className="text-accent">{message}</div>
          <div className="text-small text-muted">This may take a few seconds...</div>
        </div>
      </div>
    </div>
  );
}

interface ProofErrorProps {
  error: string;
  onRetry?: () => void;
}

export function ProofError({ error, onRetry }: ProofErrorProps) {
  return (
    <div className="proof-result error">
      <div className="proof-status">
        <span className="proof-status-icon text-error">[ERR]</span>
        <span className="text-error">Proof Failed</span>
      </div>
      <p className="text-small mb-2">{error}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn btn-danger btn-small">
          [TRY AGAIN]
        </button>
      )}
    </div>
  );
}
