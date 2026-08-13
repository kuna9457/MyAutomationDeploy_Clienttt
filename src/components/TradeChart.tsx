import { useEffect, useRef } from "react"
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type SeriesMarker,
  type Time,
} from "lightweight-charts"
import type { ChartCandles, ChartTrade } from "../lib/types"

/* Colours. Profit/loss is a POLARITY encoding, and the position box carries the
 * sign three ways over — box side, fill hue, and the labelled entry/stop/target
 * lines — so hue is never the only channel. */
const UP = "#199e70"
const DOWN = "#e66767"
const GRID = "#1e293b"
const AXIS = "#94a3b8"
const BG = "#0b1220"

/** TradingView's own Long/Short Position tool, reimplemented as a series
 *  primitive: a green reward box from entry to target and a red risk box from
 *  entry to stop, spanning the bars the position was actually held for.
 *
 *  lightweight-charts has no built-in rectangle, so this draws straight onto
 *  the pane canvas. Coordinates come from the live scales every frame
 *  (`timeToCoordinate` / `priceToCoordinate`), which is what keeps the boxes
 *  glued to the candles while you pan and zoom. */
function positionBoxes(
  trades: ChartTrade[],
  getSeries: () => ISeriesApi<"Candlestick"> | null,
  getChart: () => IChartApi | null,
) {
  const view = {
    zOrder: () => "bottom" as const,
    renderer: () => ({
      draw(target: any) {
        const series = getSeries()
        const chart = getChart()
        if (!series || !chart) return
        const ts = chart.timeScale()

        target.useBitmapCoordinateSpace((scope: any) => {
          const ctx = scope.context as CanvasRenderingContext2D
          const hr = scope.horizontalPixelRatio
          const vr = scope.verticalPixelRatio
          const rightEdge = scope.bitmapSize.width

          for (const t of trades) {
            const x1 = ts.timeToCoordinate(t.entry_time as Time)
            if (x1 === null) continue
            // A position still open at the right edge of the data is drawn to
            // the edge rather than skipped.
            const x2raw =
              t.exit_time !== null ? ts.timeToCoordinate(t.exit_time as Time) : null
            const yEntry = series.priceToCoordinate(t.entry_price)
            if (yEntry === null) continue

            const bx1 = x1 * hr
            const bx2 = x2raw !== null ? x2raw * hr : rightEdge
            const by = yEntry * vr
            const w = Math.max(bx2 - bx1, 2 * hr)

            const yT =
              t.target !== null ? series.priceToCoordinate(t.target) : null
            const yS =
              t.stop_loss !== null ? series.priceToCoordinate(t.stop_loss) : null

            // Reward box (entry -> target) and risk box (entry -> stop). Drawn
            // from the entry line outward, so a long's reward is above and a
            // short's is below without any special-casing here.
            if (yT !== null) {
              ctx.fillStyle = "rgba(25,158,112,0.16)"
              ctx.fillRect(bx1, Math.min(by, yT * vr), w, Math.abs(by - yT * vr))
            }
            if (yS !== null) {
              ctx.fillStyle = "rgba(230,103,103,0.16)"
              ctx.fillRect(bx1, Math.min(by, yS * vr), w, Math.abs(by - yS * vr))
            }

            const line = (y: number, colour: string, dash: number[]) => {
              ctx.save()
              ctx.strokeStyle = colour
              ctx.lineWidth = Math.max(1, hr)
              ctx.setLineDash(dash.map((d) => d * hr))
              ctx.beginPath()
              ctx.moveTo(bx1, y)
              ctx.lineTo(bx1 + w, y)
              ctx.stroke()
              ctx.restore()
            }
            if (yT !== null) line(yT * vr, UP, [4, 3])
            if (yS !== null) line(yS * vr, DOWN, [4, 3])
            line(by, t.win ? UP : DOWN, [])

            // Outline the whole held range so overlapping trades stay separable.
            ctx.save()
            ctx.strokeStyle = t.win ? "rgba(25,158,112,0.55)" : "rgba(230,103,103,0.55)"
            ctx.lineWidth = Math.max(1, hr)
            const top = Math.min(by, yT !== null ? yT * vr : by, yS !== null ? yS * vr : by)
            const bot = Math.max(by, yT !== null ? yT * vr : by, yS !== null ? yS * vr : by)
            ctx.strokeRect(bx1, top, w, bot - top)
            ctx.restore()
          }
        })
      },
    }),
  }
  return {
    paneViews: () => [view],
    updateAllViews: () => {},
  }
}

export default function TradeChart({ data }: { data: ChartCandles }) {
  const boxRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)

  useEffect(() => {
    const el = boxRef.current
    if (!el) return

    const chart = createChart(el, {
      layout: {
        background: { color: BG },
        textColor: AXIS,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      rightPriceScale: { borderColor: GRID },
      timeScale: {
        borderColor: GRID,
        timeVisible: data.interval !== "1d",
        secondsVisible: false,
      },
      crosshair: { mode: 0 },   // free crosshair, like TradingView's default
      autoSize: true,
    })
    chartRef.current = chart

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    })
    seriesRef.current = candles
    candles.setData(data.candles as any)

    // Volume on its own overlay scale, pinned to the bottom fifth — the
    // standard TradingView arrangement.
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    })
    chart.priceScale("vol").applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    })
    volume.setData(
      data.candles.map((c) => ({
        time: c.time as Time,
        value: c.volume,
        color: c.close >= c.open ? "rgba(25,158,112,0.35)" : "rgba(230,103,103,0.35)",
      })) as any,
    )

    // Entry/exit arrows. Entry points the way the trade went; the exit is
    // coloured by the outcome, so a losing long reads red at the exit even
    // though its entry arrow is an up-arrow.
    const markers: SeriesMarker<Time>[] = []
    for (const t of data.trades) {
      const long = t.side === "BUY"
      markers.push({
        time: t.entry_time as Time,
        position: long ? "belowBar" : "aboveBar",
        shape: long ? "arrowUp" : "arrowDown",
        color: long ? UP : DOWN,
        text: `${t.side} ${t.entry_price}`,
      })
      if (t.exit_time !== null) {
        markers.push({
          time: t.exit_time as Time,
          position: long ? "aboveBar" : "belowBar",
          shape: long ? "arrowDown" : "arrowUp",
          color: t.win ? UP : DOWN,
          text: `${t.exit_reason || "EXIT"} ${t.pnl >= 0 ? "+" : ""}${t.pnl}`,
        })
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number))
    createSeriesMarkers(candles, markers)

    candles.attachPrimitive(
      positionBoxes(
        data.trades,
        () => seriesRef.current,
        () => chartRef.current,
      ) as any,
    )

    chart.timeScale().fitContent()

    return () => {
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [data])

  return (
    <div>
      <div
        ref={boxRef}
        className="h-[460px] w-full overflow-hidden rounded-lg border border-slate-800"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#199e70]/40" />
          reward zone (entry → target)
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-3 rounded-sm bg-[#e66767]/40" />
          risk zone (entry → stop)
        </span>
        <span>▲▼ entry / exit</span>
        <span>box outline: green = closed in profit, red = at a loss</span>
      </div>
    </div>
  )
}
