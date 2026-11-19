import { ORDER_STATUSES, type OrderStatus } from '../common/constants/shop';

// Statuses an admin can set with PATCH /orders/:id/status.
// `cancelled` is NOT here on purpose: cancelling is a different operation (it also returns the
// stock) and has its own route, POST /orders/:id/cancel.
export const PATCHABLE_STATUSES = ['processing', 'shipped', 'delivered'] as const;
export type PatchableStatus = (typeof PATCHABLE_STATUSES)[number];

// Statuses an order can be cancelled from. Once it is shipped it cannot be cancelled
// (returns are out of scope for now). `delivered` and `cancelled` are final.
export const CANCELLABLE_STATUSES = [
  'pending',
  'processing',
] as const satisfies readonly OrderStatus[];

// from -> the only status that PATCH can move it to. Steps are never skipped.
const NEXT_STATUS: Readonly<Partial<Record<OrderStatus, PatchableStatus>>> = {
  pending: 'processing',
  processing: 'shipped',
  shipped: 'delivered',
};

// Can an order in status `from` be moved to `to` by PATCH?
// The same status is not a transition. `cancelled` is never a PATCH target.
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return NEXT_STATUS[from] === to;
}

// Can an order in status `from` be cancelled?
export function canCancel(from: OrderStatus): boolean {
  return (CANCELLABLE_STATUSES as readonly OrderStatus[]).includes(from);
}

// All statuses from which `to` can be reached by PATCH. It goes into the database condition,
// so that checking the current status and changing it is ONE atomic operation.
export function statusesThatCanMoveTo(to: PatchableStatus): OrderStatus[] {
  return ORDER_STATUSES.filter((from) => canTransition(from, to));
}
