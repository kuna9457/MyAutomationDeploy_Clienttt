export const APP_NAME = "WelthWest AI"

/** Logo + wordmark. The source PNG is a navy roundel on a black square, so it
 *  is clipped to a circle and scaled up until the roundel meets the edge —
 *  otherwise the black corners would sit as a dark box on the light theme. */
export default function Brand({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11" : "h-8 w-8"
  const text = size === "lg" ? "text-2xl" : "text-lg"
  return (
    <div className="flex items-center gap-2.5">
      <span className={`${box} shrink-0 overflow-hidden rounded-full`}>
        <img
          src="/logo.png"
          alt=""
          aria-hidden="true"
          className="h-full w-full scale-150 object-cover"
        />
      </span>
      <h1 className={`${text} font-semibold text-slate-100`}>{APP_NAME}</h1>
    </div>
  )
}
