import type { Card } from '@/engine';

const SUIT_SYMBOL: Record<string, string> = { c: '♣', d: '♦', h: '♥', s: '♠' };
const SUIT_NAME: Record<string, string> = { c: 'clubs', d: 'diamonds', h: 'hearts', s: 'spades' };
const RANK_NAME: Record<string, string> = { T: '10', J: 'jack', Q: 'queen', K: 'king', A: 'ace' };

type Size = 'sm' | 'md' | 'lg';

const SIZES: Record<Size, string> = {
  sm: 'h-9 w-6.5 text-[11px] rounded',
  md: 'h-12 w-9 text-sm rounded-md sm:h-14 sm:w-10 sm:text-base',
  lg: 'h-14 w-10 text-base rounded-md sm:h-20 sm:w-14 sm:text-xl',
};

export function PlayingCard({
  card,
  faceDown = false,
  size = 'md',
  dim = false,
  highlight = false,
}: {
  card?: Card;
  faceDown?: boolean;
  size?: Size;
  dim?: boolean;
  highlight?: boolean;
}) {
  if (faceDown || !card) {
    return (
      <div
        aria-label="Face-down card"
        className={`${SIZES[size]} border border-white/20 bg-[repeating-linear-gradient(45deg,#1e3a8a_0_4px,#1e40af_4px_8px)] shadow ${dim ? 'opacity-40' : ''}`}
      />
    );
  }
  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = card[1];
  const red = suit === 'h' || suit === 'd';
  return (
    <div
      aria-label={`${RANK_NAME[card[0]] ?? card[0]} of ${SUIT_NAME[suit]}`}
      className={`${SIZES[size]} flex flex-col items-center justify-center border bg-white font-semibold leading-none shadow ${
        red ? 'text-card-red' : 'text-card-black'
      } ${dim ? 'opacity-40' : ''} ${highlight ? 'border-accent ring-2 ring-accent' : 'border-black/20'}`}
    >
      <span>{rank}</span>
      <span>{SUIT_SYMBOL[suit]}</span>
    </div>
  );
}
