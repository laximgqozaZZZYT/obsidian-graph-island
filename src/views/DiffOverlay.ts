// ---------------------------------------------------------------------------
// DiffOverlay.ts — スナップショット差分のビジュアルオーバーレイ
// ---------------------------------------------------------------------------
// Canvas2D コンテキストに直接描画するポストレンダーパス。
// 既存のインタラクション（ホバー、クリック、ドラッグ）に干渉しない。
// ---------------------------------------------------------------------------

import type { SnapshotDiff, SnapshotNode, SnapshotEdge } from "../types";
import type { PixiNode } from "./InteractionManager";

// ---------------------------------------------------------------------------
// 描画定数
// ---------------------------------------------------------------------------

/** 追加ノードのリング色（緑） */
const ADDED_COLOR = "#22c55e";
/** 追加ノードのリングアルファ */
const ADDED_ALPHA = 0.7;

/** 削除ノードの色（グレー） */
const REMOVED_COLOR = "#9ca3af";
/** 削除ノードのフィルアルファ */
const REMOVED_ALPHA = 0.3;

/** メタデータ変更ノードのリング色（黄色） */
const CHANGED_COLOR = "#eab308";
/** メタデータ変更ノードのリングアルファ */
const CHANGED_ALPHA = 0.7;

/** 追加エッジの色（緑） */
const ADDED_EDGE_COLOR = "#22c55e";
/** 削除エッジの色（赤） */
const REMOVED_EDGE_COLOR = "#ef4444";

/** リングの線幅（px） */
const RING_LINE_WIDTH = 2;

/** ゴーストノードの半径（px） */
const GHOST_RADIUS = 6;
/** ゴーストノードのグリッド間隔（px） */
const GHOST_SPACING = 24;
/** ゴーストノードのラベルフォントサイズ（px） */
const GHOST_FONT_SIZE = 9;
/** ゴーストエリアのビューポート端からのマージン（px） */
const GHOST_MARGIN = 40;

/** ステータスバーの背景色 */
const STATUS_BG = "rgba(0, 0, 0, 0.6)";
/** ステータスバーのテキスト色 */
const STATUS_TEXT_COLOR = "#ffffff";
/** ステータスバーのフォントサイズ（px） */
const STATUS_FONT_SIZE = 12;
/** ステータスバーの余白（px） */
const STATUS_PADDING = 8;

export class DiffOverlay {
  private diff: SnapshotDiff | null = null;
  private snapshotName = "";
  /** Animation phase (0–1, cycles over time) for pulse effects */
  private _pulsePhase = 0;
  private _pulseStart = 0;

  /** 差分モードを有効化する */
  activate(diff: SnapshotDiff, snapshotName: string): void {
    this.diff = diff;
    this.snapshotName = snapshotName;
    this._pulseStart = performance.now();
  }

  /** 差分モードを無効化する */
  deactivate(): void {
    this.diff = null;
    this.snapshotName = "";
  }

  /** 差分モードが有効かどうか */
  isActive(): boolean {
    return this.diff !== null;
  }

  /** 差分の要約情報を取得する */
  getSummary(): { name: string; added: number; removed: number; changed: number } | null {
    if (!this.diff) return null;
    return {
      name: this.snapshotName,
      added: this.diff.addedNodeIds.size,
      removed: this.diff.removedNodes.length,
      changed: this.diff.changedNodeIds.size,
    };
  }

  /**
   * 差分ハイライトを既存グラフの上に描画する。
   * CanvasApp の onPostFlush コールバックから呼ばれる。
   *
   * @param ctx       Canvas2D 描画コンテキスト（DPR スケーリング済み）
   * @param pixiNodes 現在の PixiNode マップ（位置情報の参照用）
   * @param transform 現在のカメラ変換 {x, y, scale}
   * @param viewport  ビューポートサイズ {width, height}（CSS px）
   */
  render(
    ctx: CanvasRenderingContext2D,
    pixiNodes: Map<string, PixiNode>,
    transform: { x: number; y: number; scale: number },
    viewport: { width: number; height: number },
  ): void {
    if (!this.diff) return;

    const { x: tx, y: ty, scale } = transform;

    // ワールド座標→スクリーン座標変換
    const toScreen = (wx: number, wy: number): [number, number] => {
      return [wx * scale + tx, wy * scale + ty];
    };

    // Pulse animation: 2-second cycle (0→1→0)
    const elapsed = (performance.now() - this._pulseStart) / 1000;
    this._pulsePhase = (Math.sin(elapsed * Math.PI) + 1) / 2; // 0–1 sine wave
    const pulseScale = 1 + this._pulsePhase * 0.3; // 1.0–1.3 radius multiplier
    const pulseAlpha = 0.5 + this._pulsePhase * 0.3; // 0.5–0.8 alpha range

    // --- 追加ノードのリング（緑、パルス付き） ---
    ctx.strokeStyle = ADDED_COLOR;
    ctx.lineWidth = RING_LINE_WIDTH * pulseScale;
    ctx.globalAlpha = pulseAlpha;
    for (const nodeId of this.diff.addedNodeIds) {
      const pn = pixiNodes.get(nodeId);
      if (!pn) continue;
      const [sx, sy] = toScreen(pn.data.x, pn.data.y);
      const sr = (pn.radius * scale + 3) * pulseScale;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- メタデータ変更ノードのリング（黄色、パルス付き） ---
    ctx.strokeStyle = CHANGED_COLOR;
    ctx.lineWidth = RING_LINE_WIDTH * pulseScale;
    ctx.globalAlpha = pulseAlpha * 0.9;
    for (const nodeId of this.diff.changedNodeIds) {
      const pn = pixiNodes.get(nodeId);
      if (!pn) continue;
      const [sx, sy] = toScreen(pn.data.x, pn.data.y);
      const sr = (pn.radius * scale + 3) * pulseScale;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.stroke();
    }

    // --- 追加エッジ（緑の実線） ---
    ctx.strokeStyle = ADDED_EDGE_COLOR;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    ctx.setLineDash([]);
    for (const edgeKey of this.diff.addedEdgeKeys) {
      const [src, tgt] = edgeKey.split("\0");
      const pnSrc = pixiNodes.get(src);
      const pnTgt = pixiNodes.get(tgt);
      if (!pnSrc || !pnTgt) continue;
      const [sx1, sy1] = toScreen(pnSrc.data.x, pnSrc.data.y);
      const [sx2, sy2] = toScreen(pnTgt.data.x, pnTgt.data.y);
      ctx.beginPath();
      ctx.moveTo(sx1, sy1);
      ctx.lineTo(sx2, sy2);
      ctx.stroke();
    }

    // --- ゴーストノード（削除されたノード、右下にグリッド配置） ---
    const ghostPositions = this._layoutGhostNodes(
      this.diff.removedNodes,
      viewport,
    );

    ctx.fillStyle = REMOVED_COLOR;
    ctx.globalAlpha = REMOVED_ALPHA;
    for (const { x, y } of ghostPositions) {
      ctx.beginPath();
      ctx.arc(x, y, GHOST_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }

    // ゴーストノードのラベル
    ctx.fillStyle = REMOVED_COLOR;
    ctx.globalAlpha = 0.5;
    ctx.font = `${GHOST_FONT_SIZE}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (let i = 0; i < ghostPositions.length; i++) {
      const { x, y } = ghostPositions[i];
      const node = this.diff.removedNodes[i];
      // IDからラベルを生成（パスの最後の部分を使用）
      const label = node.id.split("/").pop()?.replace(/\.md$/, "") ?? node.id;
      // 長すぎるラベルは省略
      const displayLabel = label.length > 12 ? label.slice(0, 11) + "…" : label;
      ctx.fillText(displayLabel, x, y + GHOST_RADIUS + 2);
    }

    // --- 削除エッジ（赤い破線） ---
    // 両端ノードが現在のグラフかゴーストに存在する場合のみ描画
    ctx.strokeStyle = REMOVED_EDGE_COLOR;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4;
    ctx.setLineDash([4, 4]);

    // ゴーストノード位置マップを構築
    const ghostPosMap = new Map<string, { x: number; y: number }>();
    for (let i = 0; i < this.diff.removedNodes.length; i++) {
      ghostPosMap.set(this.diff.removedNodes[i].id, ghostPositions[i]);
    }

    for (const edge of this.diff.removedEdges) {
      const srcPn = pixiNodes.get(edge.source);
      const tgtPn = pixiNodes.get(edge.target);
      const srcGhost = ghostPosMap.get(edge.source);
      const tgtGhost = ghostPosMap.get(edge.target);

      let sx1: number | undefined, sy1: number | undefined;
      let sx2: number | undefined, sy2: number | undefined;

      if (srcPn) {
        [sx1, sy1] = toScreen(srcPn.data.x, srcPn.data.y);
      } else if (srcGhost) {
        sx1 = srcGhost.x;
        sy1 = srcGhost.y;
      }

      if (tgtPn) {
        [sx2, sy2] = toScreen(tgtPn.data.x, tgtPn.data.y);
      } else if (tgtGhost) {
        sx2 = tgtGhost.x;
        sy2 = tgtGhost.y;
      }

      if (sx1 !== undefined && sy1 !== undefined && sx2 !== undefined && sy2 !== undefined) {
        ctx.beginPath();
        ctx.moveTo(sx1, sy1);
        ctx.lineTo(sx2, sy2);
        ctx.stroke();
      }
    }

    // 破線リセット
    ctx.setLineDash([]);

    // --- ステータスバー（左下に表示） ---
    this._renderStatusBar(ctx, viewport);

    // グローバルアルファをリセット
    ctx.globalAlpha = 1;
  }

  /** 削除ノードをビューポート右下にグリッド配置する */
  private _layoutGhostNodes(
    removedNodes: SnapshotNode[],
    viewport: { width: number; height: number },
  ): Array<{ x: number; y: number }> {
    if (removedNodes.length === 0) return [];

    const cols = Math.max(1, Math.floor(
      (viewport.width * 0.3) / GHOST_SPACING,
    ));
    const startX = viewport.width - GHOST_MARGIN;
    const startY = viewport.height - GHOST_MARGIN;

    // 行数の上限: 画面高さの70%を超えないようにする
    const maxRows = Math.max(1, Math.floor((viewport.height * 0.7) / GHOST_SPACING));
    return removedNodes.map((_, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols); // rows grow downward (no wrapping to avoid overlap)
      return {
        x: startX - col * GHOST_SPACING,
        y: startY - row * GHOST_SPACING,
      };
    });
  }

  /** ステータスバーを左下に描画する */
  private _renderStatusBar(
    ctx: CanvasRenderingContext2D,
    viewport: { width: number; height: number },
  ): void {
    const summary = this.getSummary();
    if (!summary) return;

    const text = `Diff: vs '${summary.name}' — ${summary.added} added, ${summary.removed} removed, ${summary.changed} changed`;

    ctx.font = `${STATUS_FONT_SIZE}px sans-serif`;
    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const barH = STATUS_FONT_SIZE + STATUS_PADDING * 2;
    const barW = textW + STATUS_PADDING * 2;
    const barX = STATUS_PADDING;
    const barY = viewport.height - barH - STATUS_PADDING;

    // 背景
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = STATUS_BG;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 4);
    ctx.fill();

    // テキスト
    ctx.globalAlpha = 1;
    ctx.fillStyle = STATUS_TEXT_COLOR;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, barX + STATUS_PADDING, barY + barH / 2);
  }
}
