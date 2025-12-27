import { calculateUsedVolume, ITEM_VOLUMES } from '../types';
import type { InventorySlot } from '../types';

interface CapacityBarProps {
  slots: InventorySlot[];
  maxCapacity: number;
  className?: string;
}

export function CapacityBar({ slots, maxCapacity, className = '' }: CapacityBarProps) {
  const usedVolume = calculateUsedVolume(slots);

  if (maxCapacity === 0) {
    return (
      <div className={`text-small text-muted ${className}`}>
        No capacity limit
      </div>
    );
  }

  const percentage = Math.min((usedVolume / maxCapacity) * 100, 100);
  const remaining = maxCapacity - usedVolume;

  let barClass = '';
  let statusClass = '';
  if (percentage >= 90) {
    barClass = 'danger';
    statusClass = 'text-error';
  } else if (percentage >= 70) {
    barClass = 'warning';
    statusClass = 'text-warning';
  }

  return (
    <div className={`capacity-bar ${className}`}>
      <span className="capacity-label">CAPACITY</span>
      <div className="capacity-track">
        <div className={`capacity-fill ${barClass}`} style={{ width: `${percentage}%` }} />
      </div>
      <span className={`capacity-value ${statusClass}`}>
        {usedVolume}/{maxCapacity} ({remaining} free)
      </span>
    </div>
  );
}

interface CapacityPreviewProps {
  currentSlots: InventorySlot[];
  maxCapacity: number;
  itemId: number;
  amount: number;
  isDeposit: boolean;
}

export function CapacityPreview({
  currentSlots,
  maxCapacity,
  itemId,
  amount,
  isDeposit,
}: CapacityPreviewProps) {
  if (maxCapacity === 0) return null;

  const currentVolume = calculateUsedVolume(currentSlots);
  const volumeChange = (ITEM_VOLUMES[itemId] ?? 0) * amount;
  const newVolume = isDeposit
    ? currentVolume + volumeChange
    : currentVolume - volumeChange;

  const willExceed = isDeposit && newVolume > maxCapacity;

  return (
    <div className={`text-small ${willExceed ? 'alert alert-error' : 'alert alert-info'}`}>
      {isDeposit ? (
        <>
          <span>Volume after deposit: </span>
          <strong>{newVolume}</strong>
          <span> / {maxCapacity}</span>
          {willExceed && (
            <span className="text-error">
              {' '}(exceeds by {newVolume - maxCapacity})
            </span>
          )}
        </>
      ) : (
        <>
          <span>Volume after withdraw: </span>
          <strong>{Math.max(0, newVolume)}</strong>
          <span> / {maxCapacity}</span>
        </>
      )}
    </div>
  );
}
