import { QRCodeSVG } from "qrcode.react"

/** A scannable UPI payment QR for a fixed amount. The same link is offered as
 *  a button, because someone reading this on their phone can't scan their own
 *  screen — there it opens their UPI app with the amount already filled in. */
export default function UpiQr({ uri, size = 200 }: { uri: string; size?: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      {/* White card in both themes: scanners need dark-on-light with a quiet zone. */}
      <div className="rounded-xl bg-white p-3">
        <QRCodeSVG value={uri} size={size} level="M" marginSize={2} />
      </div>
      <a
        href={uri}
        className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
      >
        Pay with a UPI app
      </a>
    </div>
  )
}
