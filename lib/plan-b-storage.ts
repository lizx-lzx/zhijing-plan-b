// A and B share a public hostname, but must never share browser-side state.
export function planBStorageKey(name: string) {
  return `zhijing-plan-b:${process.env.NEXT_PUBLIC_BASE_PATH || "/zhijing"}:${name}`;
}
