// ---------------------------------------------------------------------------
// TimeoutTracker — fire-and-forget setTimeout の追跡用エイリアス。
//
// 内部実装は {@link ManagedTimers} に委譲する。`Set`-相当の handle 集合を保持し、
// `clearAll()` で一括 `clearTimeout` する小さなラッパー。
//
// 既存コード (GraphViewContainer.timers, PanelContext.timers) はそのまま動作させ、
// 新規 call-site でこの型名を参照したいケース向けに再エクスポートしている。
// ---------------------------------------------------------------------------
export { ManagedTimers as TimeoutTracker } from "./managed-timers";
