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
    <div className="card border-emerald-200 bg-emerald-50">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
        <h3 className="font-semibold text-emerald-800">{title}</h3>
      </div>

      {extra && <div className="mb-4">{extra}</div>}

      <div className="space-y-3">
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-emerald-700 font-medium">
              Proof ({result.proof.length} bytes)
            </span>
            <button
              onClick={copyProof}
              className="text-xs text-emerald-600 hover:text-emerald-800 flex items-center gap-1"
            >
              {copied ? (
                <>
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z" />
                    <path d="M6 3a2 2 0 00-2 2v11a2 2 0 002 2h8a2 2 0 002-2V5a2 2 0 00-2-2 3 3 0 01-3 3H9a3 3 0 01-3-3z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>
          <div className="relative">
            <code
              className={`block text-xs bg-white rounded p-2 break-all text-gray-700 border border-emerald-200 ${
                expanded ? '' : 'line-clamp-2'
              }`}
            >
              {result.proof}
            </code>
            {result.proof.length > 100 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-emerald-600 hover:text-emerald-800 mt-1"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>

        <div>
          <div className="text-xs text-emerald-700 font-medium mb-1">
            Public Inputs ({result.public_inputs.length})
          </div>
          <div className="space-y-1">
            {result.public_inputs.map((input, i) => (
              <code
                key={i}
                className="block text-xs bg-white rounded p-2 break-all text-gray-700 border border-emerald-200"
              >
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
    <div className="card border-primary-200 bg-primary-50">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        <div>
          <div className="font-medium text-primary-800">{message}</div>
          <div className="text-xs text-primary-600">
            This may take a few seconds...
          </div>
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
    <div className="card border-red-200 bg-red-50">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
          <svg
            className="w-5 h-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h3 className="font-semibold text-red-800">Proof Failed</h3>
      </div>
      <p className="text-sm text-red-700 mb-3">{error}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-danger text-sm">
          Try Again
        </button>
      )}
    </div>
  );
}
