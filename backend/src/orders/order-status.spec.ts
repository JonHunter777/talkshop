import { ORDER_STATUSES, type OrderStatus } from '../common/constants/shop';
import {
  canCancel,
  canTransition,
  PATCHABLE_STATUSES,
  statusesThatCanMoveTo,
} from './order-status';

// The whole table of PATCH transitions: from -> the only allowed target.
// Every other pair of the 5 x 5 matrix must be rejected.
const ALLOWED: Record<OrderStatus, OrderStatus | null> = {
  pending: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
  delivered: null, // final
  cancelled: null, // final
};

describe('canTransition (the full 5 x 5 matrix)', () => {
  const pairs = ORDER_STATUSES.flatMap((from) => ORDER_STATUSES.map((to) => [from, to] as const));

  it.each(pairs)('%s -> %s', (from, to) => {
    expect(canTransition(from, to)).toBe(ALLOWED[from] === to);
  });

  it('allows exactly 3 transitions out of 25', () => {
    expect(pairs.filter(([from, to]) => canTransition(from, to))).toEqual([
      ['pending', 'processing'],
      ['processing', 'shipped'],
      ['shipped', 'delivered'],
    ]);
  });

  it.each(['delivered', 'cancelled'] as const)('%s is final: nothing leaves it', (from) => {
    expect(ORDER_STATUSES.some((to) => canTransition(from, to))).toBe(false);
  });

  it('never allows cancelled as a PATCH target (cancel has its own route)', () => {
    expect(ORDER_STATUSES.some((from) => canTransition(from, 'cancelled'))).toBe(false);
  });

  it('never goes back to pending and never repeats the same status', () => {
    expect(ORDER_STATUSES.some((from) => canTransition(from, 'pending'))).toBe(false);
    expect(ORDER_STATUSES.some((s) => canTransition(s, s))).toBe(false);
  });
});

describe('canCancel', () => {
  it.each([
    ['pending', true],
    ['processing', true],
    ['shipped', false],
    ['delivered', false],
    ['cancelled', false],
  ] as const)('%s: %s', (status, expected) => {
    expect(canCancel(status)).toBe(expected);
  });
});

describe('statusesThatCanMoveTo', () => {
  it.each([
    ['processing', ['pending']],
    ['shipped', ['processing']],
    ['delivered', ['shipped']],
  ] as const)('%s can be reached only from %j', (to, expected) => {
    expect(statusesThatCanMoveTo(to)).toEqual(expected);
  });

  it('agrees with canTransition for every patchable target', () => {
    for (const to of PATCHABLE_STATUSES) {
      for (const from of ORDER_STATUSES) {
        expect(statusesThatCanMoveTo(to).includes(from)).toBe(canTransition(from, to));
      }
    }
  });
});
