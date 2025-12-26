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
  size = 'md',
  onClick,
  selected,
}: ItemSlotProps) {
  const sizeClasses = {
    sm: 'w-12 h-12 text-xs',
    md: 'w-16 h-16 text-sm',
    lg: 'w-20 h-20 text-base',
  };

  const colorClass = ITEM_COLORS[item_id] || 'bg-gray-300';
  const name = ITEM_NAMES[item_id] || `Item #${item_id}`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`
        ${sizeClasses[size]}
        relative rounded-lg border-2 transition-all
        ${selected ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-200'}
        ${onClick ? 'cursor-pointer hover:border-primary-300' : 'cursor-default'}
        flex flex-col items-center justify-center gap-1
        bg-white
      `}
      title={`${name}: ${quantity}`}
    >
      <div className={`w-6 h-6 rounded ${colorClass}`} />
      {showQuantity && (
        <span className="font-medium text-gray-700">{quantity}</span>
      )}
    </button>
  );
}

interface EmptySlotProps {
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

export function EmptySlot({ size = 'md', onClick }: EmptySlotProps) {
  const sizeClasses = {
    sm: 'w-12 h-12',
    md: 'w-16 h-16',
    lg: 'w-20 h-20',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`
        ${sizeClasses[size]}
        rounded-lg border-2 border-dashed border-gray-200
        ${onClick ? 'cursor-pointer hover:border-gray-300 hover:bg-gray-50' : 'cursor-default'}
        flex items-center justify-center
        transition-all
      `}
    >
      {onClick && (
        <svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
      )}
    </button>
  );
}
