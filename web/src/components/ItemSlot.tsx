import { ITEM_NAMES, ITEM_COLORS } from '../types';

interface ItemSlotProps {
  item_id: number;
  quantity: number;
  showQuantity?: boolean;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  selected?: boolean;
}

export function ItemSlot({
  item_id,
  quantity,
  showQuantity = true,
  onClick,
  selected,
}: ItemSlotProps) {
  const colorClass = ITEM_COLORS[item_id] || 'bg-gray-300';
  const name = ITEM_NAMES[item_id] || `Item #${item_id}`;

  // Extract base color for terminal style
  const colorMap: Record<string, string> = {
    'bg-red-500': 'var(--color-red-60)',
    'bg-blue-500': 'var(--color-teal-60)',
    'bg-green-500': 'var(--color-neon-green-70)',
    'bg-yellow-500': 'var(--color-gold-30)',
    'bg-purple-500': '#9333ea',
  };
  const bgColor = colorMap[colorClass] || 'var(--fg-muted)';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`item-slot ${selected ? 'selected' : ''}`}
      title={`${name}: ${quantity}`}
    >
      <div
        className="item-slot-icon"
        style={{
          width: '1.5em',
          height: '1.5em',
          background: bgColor,
        }}
      />
      <span className="item-slot-name">{name.slice(0, 6)}</span>
      {showQuantity && (
        <span className="item-slot-qty">{quantity}</span>
      )}
    </button>
  );
}

interface EmptySlotProps {
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export function EmptySlot({ onClick }: EmptySlotProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`item-slot empty ${onClick ? '' : ''}`}
    >
      {onClick ? (
        <span className="text-muted">[+]</span>
      ) : (
        <span className="text-muted">-</span>
      )}
    </button>
  );
}
