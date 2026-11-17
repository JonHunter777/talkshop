// For @Transform: trims strings before validation, leaves other types for the validators to reject
export const trimInput = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;
