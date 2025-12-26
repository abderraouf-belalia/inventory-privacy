import type { InventorySlot } from '../types';
import { MAX_ITEM_SLOTS, ITEM_NAMES } from '../types';
import { ItemSlot, EmptySlot } from './ItemSlot';

interface InventoryCardProps {
  title: string;
  slots: InventorySlot[];
  commitment?: string | null;
  blinding?: string;
  showBlinding?: boolean;
  onSlotClick?: (index: number, slot: InventorySlot) => void;
  onEmptyClick?: () => void;
  selectedSlot?: number;
  hideContents?: boolean;
}

export function InventoryCard({
  title,
  slots,
  commitment,
  blinding,
  showBlinding = false,
  onSlotClick,
  onEmptyClick,
  selectedSlot,
  hideContents = false,
}: InventoryCardProps) {
  const emptyCount = MAX_ITEM_SLOTS - slots.length;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-gray-900">{title}</h3>
        {commitment && (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                clipRule="evenodd"
              />
            </svg>
            Private
          </span>
        )}
      </div>

      {hideContents ? (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {Array.from({ length: MAX_ITEM_SLOTS }).map((_, i) => (
            <div
              key={i}
              className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center"
            >
              <svg
                className="w-6 h-6 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {slots.map((slot, i) => (
            <ItemSlot
              key={`${slot.item_id}-${i}`}
              item_id={slot.item_id}
              quantity={slot.quantity}
              onClick={onSlotClick ? () => onSlotClick(i, slot) : undefined}
              selected={selectedSlot === i}
            />
          ))}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <EmptySlot
              key={`empty-${i}`}
              onClick={i === 0 ? onEmptyClick : undefined}
            />
          ))}
        </div>
      )}

      {commitment && (
        <div className="pt-4 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Commitment (Public)</div>
          <code className="block text-xs bg-gray-100 rounded p-2 break-all text-gray-700">
            {commitment}
          </code>
        </div>
      )}

      {showBlinding && blinding && (
        <div className="pt-3">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                clipRule="evenodd"
              />
              <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
            </svg>
            Blinding Factor (Secret)
          </div>
          <code className="block text-xs bg-red-50 rounded p-2 break-all text-red-700 border border-red-200">
            {blinding}
          </code>
        </div>
      )}

      {slots.length > 0 && !hideContents && (
        <div className="pt-3 mt-3 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-2">Contents</div>
          <div className="flex flex-wrap gap-2">
            {slots.map((slot, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs"
              >
                <span className="font-medium">
                  {ITEM_NAMES[slot.item_id] || `Item #${slot.item_id}`}:
                </span>
                <span>{slot.quantity}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
