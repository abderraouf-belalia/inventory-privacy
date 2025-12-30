import type { InventorySlot } from '../types';
import { MAX_DISPLAY_ITEMS, ITEM_NAMES } from '../types';
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
  // Show a few empty slots for visual indication (max 4)
  const emptyCount = Math.min(4, MAX_DISPLAY_ITEMS - slots.length);

  return (
    <div className="card">
      <div className="card-header">
        <div className="card-header-left"></div>
        <span className="card-title">{title || 'INVENTORY'}</span>
        <div className="card-header-right"></div>
      </div>
      <div className="card-body">
        {commitment && (
          <div className="badge badge-success mb-2">[PRIVATE]</div>
        )}

        {hideContents ? (
          <div className="grid grid-4 mb-2">
            {Array.from({ length: Math.min(16, slots.length || 8) }).map((_, i) => (
              <div key={i} className="item-slot empty">
                <span className="text-muted">?</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-4 mb-2">
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
          <div className="mt-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
            <div className="text-small text-muted mb-1">COMMITMENT (PUBLIC)</div>
            <code className="text-break text-small">{commitment}</code>
          </div>
        )}

        {showBlinding && blinding && (
          <div className="mt-2">
            <div className="text-small text-error mb-1">[SECRET] BLINDING FACTOR</div>
            <code className="text-break text-small" style={{ background: 'rgba(218, 30, 40, 0.1)' }}>
              {blinding}
            </code>
          </div>
        )}

        {slots.length > 0 && !hideContents && (
          <div className="mt-2" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
            <div className="text-small text-muted mb-1">CONTENTS</div>
            <div className="row">
              {slots.map((slot, i) => (
                <span key={i} className="badge">
                  {ITEM_NAMES[slot.item_id] || `Item #${slot.item_id}`}: {slot.quantity}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
