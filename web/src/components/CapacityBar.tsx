import { calculateUsedVolume, ITEM_VOLUMES } from '../types';
import type { InventorySlot } from '../types';

interface CapacityBarProps {
  slots: InventorySlot[];
  maxCapacity: number;
  className?: string;
}

export function CapacityBar({ slots, maxCapacity, className = '' }: CapacityBarProps) {
  const usedVolume = calculateUsedVolume(slots);

  // If no capacity limit, don't show the bar
  if (maxCapacity === 0) {
    return (
      <div className={`text-sm text-gray-500 ${className}`}>
        No capacity limit
      </div>
    );
  }

  const percentage = Math.min((usedVolume / maxCapacity) * 100, 100);
  const remaining = maxCapacity - usedVolume;

  // Color based on usage level
  let barColor = 'bg-green-500';
  if (percentage >= 90) {
    barColor = 'bg-red-500';
  } else if (percentage >= 70) {
    barColor = 'bg-yellow-500';
  }

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex justify-between text-sm">
        <span className="text-gray-600">Capacity</span>
        <span className={percentage >= 90 ? 'text-red-600 font-medium' : 'text-gray-600'}>
          {usedVolume} / {maxCapacity} ({remaining} available)
        </span>
      </div>
      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full ${barColor} transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
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
    <div className={`text-sm p-2 rounded ${willExceed ? 'bg-red-100 text-red-700' : 'bg-blue-50 text-blue-700'}`}>
      {isDeposit ? (
        <>
          <span>Volume after deposit: </span>
          <span className="font-medium">{newVolume}</span>
          <span> / {maxCapacity}</span>
          {willExceed && (
            <span className="ml-2 text-red-600 font-medium">
              (exceeds capacity by {newVolume - maxCapacity})
            </span>
          )}
        </>
      ) : (
        <>
          <span>Volume after withdraw: </span>
          <span className="font-medium">{Math.max(0, newVolume)}</span>
          <span> / {maxCapacity}</span>
        </>
      )}
    </div>
  );
}
