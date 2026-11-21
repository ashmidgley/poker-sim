import type { TableViewModel } from '@/game/tableView';
import { formatMoney } from '@/lib/format';
import { PlayingCard } from './PlayingCard';
import { SeatView } from './SeatView';

/**
 * Seats sit on an ellipse. The human (seat 0) is at the bottom; higher seat
 * numbers continue clockwise (bottom -> left -> top -> right).
 */
function position(index: number, count: number, rx: number, ry: number) {
  const angle = Math.PI / 2 + (index * 2 * Math.PI) / count;
  return { left: `${50 + rx * Math.cos(angle)}%`, top: `${50 + ry * Math.sin(angle)}%` };
}

export function TableView({ view, roomy = false }: { view: TableViewModel; roomy?: boolean }) {
  const count = view.seats.length;
  return (
    <div className={`relative mx-auto ${roomy ? 'mt-10 mb-8 sm:mt-12 sm:mb-10' : ''} h-[56svh] min-h-[340px] w-full max-w-5xl sm:h-auto sm:min-h-0 sm:aspect-[16/10]`}>
      {/* Felt */}
      <div className="absolute inset-[11%_4%] rounded-[50%] border-[10px] border-felt-edge bg-[radial-gradient(ellipse_at_center,#1f7a45_0%,#14532d_70%)] shadow-[inset_0_0_40px_rgba(0,0,0,0.5)] sm:inset-[10%_8%]" />

      {/* Board and pot */}
      <div className="absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
        <div className="flex min-h-14 gap-1 sm:min-h-20">
          {view.board.map((c) => (
            <PlayingCard key={c} card={c} size="lg" />
          ))}
        </div>
        {view.potTotal > 0 && (
          <div className="rounded-full bg-black/40 px-3 py-0.5 font-mono text-xs text-white sm:text-sm">
            Pot {formatMoney(view.potTotal)}
          </div>
        )}
        {view.pots.length > 1 && (
          <div className="flex flex-wrap justify-center gap-1 text-[10px] text-white/80 sm:text-xs">
            {view.pots.map((p, i) => (
              <span key={i} className="rounded bg-black/30 px-1.5">
                {i === 0 ? 'Main' : `Side ${i}`} {formatMoney(p.amount)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Bets in front of seats */}
      {view.seats.map((s, i) => {
        const bet = view.bets.get(s.seat);
        if (!bet) return null;
        return (
          <div
            key={`bet-${s.seat}`}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-accent/60 bg-black/50 px-2 font-mono text-[11px] text-accent sm:text-xs"
            style={position(i, count, 26, 23)}
          >
            {formatMoney(bet)}
          </div>
        );
      })}

      {/* Seats */}
      {view.seats.map((s, i) => (
        <div key={s.seat} className="absolute -translate-x-1/2 -translate-y-1/2" style={position(i, count, 42, 41)}>
          <SeatView m={s} />
        </div>
      ))}
    </div>
  );
}
