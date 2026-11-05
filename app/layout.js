import "./globals.css";

export const metadata = {
  title: "Counter | Restaurant POS",
  description: "Multi-branch restaurant point of sale",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
