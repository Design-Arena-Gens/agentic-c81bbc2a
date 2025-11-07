import './globals.css'

export const metadata = {
  title: 'Bitcoin Halving Analysis',
  description: 'Analyze Bitcoin price patterns around halving events',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
