"use client";

import { useMemo } from "react";
import { useAnalysisStore } from "@/stores/analysis-store";
import { useShallow } from "zustand/react/shallow";
import { MoveClassification } from "@/types/chess";

export default function EvalGraph() {
  const { moves, moveAnalyses, currentMoveIndex, goToMove } = useAnalysisStore(
    useShallow((s) => ({ moves: s.moves, moveAnalyses: s.moveAnalyses, currentMoveIndex: s.currentMoveIndex, goToMove: s.goToMove }))
  );

  const points = useMemo(() => {
    if (moves.length === 0) return [];

    let lastKnownScore = 0;

    return moves.map((move, index) => {
      const analysis = moveAnalyses[index];
      let score = lastKnownScore;

      if (analysis) {
        score = analysis.evalAfter ?? 0;
        if (analysis.mateAfter !== null) {
          score = analysis.mateAfter > 0 ? 1500 : -1500;
        }
        lastKnownScore = score;
      }

      const clampedScore = Math.max(-1000, Math.min(score, 1000));
      return {
        x: index,
        y: clampedScore,
        classification: analysis?.classification,
      };
    });
  }, [moves, moveAnalyses]);

  const width = 500;
  const height = 80;
  const paddingY = 10;

  const svgPaths = useMemo(() => {
    if (points.length === 0) return { linePath: "", areaPath: "", zeroY: height / 2, pointsWithCoords: [] };

    const minX = 0;
    const maxX = points.length - 1;
    const minY = -1000;
    const maxY = 1000;

    const getXCoords = (xVal: number) => {
      if (maxX === 0) return width / 2;
      return (xVal / maxX) * width;
    };

    const getYCoords = (yVal: number) => {
      const range = maxY - minY;
      const heightRange = height - 2 * paddingY;
      const normalized = (yVal - minY) / range;
      return height - paddingY - normalized * heightRange;
    };

    const pointsWithCoords = points.map((p) => ({
      ...p,
      cx: getXCoords(p.x),
      cy: getYCoords(p.y),
    }));

    const linePoints = pointsWithCoords.map((p) => `${p.cx.toFixed(1)},${p.cy.toFixed(1)}`);
    const linePath = `M ${linePoints.join(" L ")}`;

    const zeroY = getYCoords(0);
    const startX = getXCoords(0);
    const endX = getXCoords(points.length - 1);

    const areaPath = `
      M ${startX.toFixed(1)},${zeroY.toFixed(1)}
      L ${linePoints.join(" L ")}
      L ${endX.toFixed(1)},${zeroY.toFixed(1)}
      Z
    `;

    return { linePath, areaPath, zeroY, pointsWithCoords };
  }, [points]);

  if (moves.length === 0) {
    return null;
  }

  const activeX = currentMoveIndex >= 0 ? (currentMoveIndex / (moves.length - 1)) * width : 0;

  return (
    <div>
      <div className="relative h-16 w-full overflow-hidden bg-background/50 rounded-md">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-full"
          preserveAspectRatio="none"
        >
          <line
            x1="0"
            y1={svgPaths.zeroY}
            x2={width}
            y2={svgPaths.zeroY}
            className="eval-graph-zero"
          />

          <path
            d={svgPaths.areaPath}
            className="eval-graph-area"
          />

          <path
            d={svgPaths.linePath}
            className="eval-graph-line"
          />

          {currentMoveIndex >= 0 && (
            <line
              x1={activeX}
              y1="0"
              x2={activeX}
              y2={height}
              className="eval-graph-cursor"
            />
          )}

          {svgPaths.pointsWithCoords.map((p, idx) => {
            if (!p.classification) return null;
            let fill = "#a3b86c";
            if (p.classification === MoveClassification.BRILLIANT) fill = "#1bada6";
            if (p.classification === MoveClassification.GREAT) fill = "#5c8bb0";
            if (p.classification === MoveClassification.BLUNDER) fill = "#ca3431";
            if (p.classification === MoveClassification.MISTAKE) fill = "#e58f2a";
            if (p.classification === MoveClassification.INACCURACY) fill = "#f7c631";

            if (
              p.classification === MoveClassification.BRILLIANT ||
              p.classification === MoveClassification.BLUNDER ||
              p.classification === MoveClassification.MISTAKE
            ) {
              return (
                <circle
                  key={idx}
                  cx={p.cx}
                  cy={p.cy}
                  r="3.5"
                  fill={fill}
                  stroke="#1a1d20"
                  strokeWidth="1"
                />
              );
            }
            return null;
          })}

          {points.map((p, index) => {
            const stepWidth = width / points.length;
            const clickX = (index / (points.length - 1)) * width - stepWidth / 2;

            return (
              <rect
                key={index}
                x={Math.max(0, clickX)}
                y="0"
                width={stepWidth}
                height={height}
                fill="transparent"
                className="cursor-pointer hover:fill-accent/5 transition-colors"
                onClick={() => goToMove(index)}
              />
            );
          })}
        </svg>
      </div>
    </div>
  );
}
