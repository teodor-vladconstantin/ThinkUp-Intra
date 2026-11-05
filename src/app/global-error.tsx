"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ro">
      <body
        style={{
          display: "grid",
          minHeight: "100vh",
          placeItems: "center",
          margin: 0,
          padding: "24px",
          background: "#f8fafc",
          color: "#1e293b",
          fontFamily: "system-ui, sans-serif",
          textAlign: "center",
        }}
      >
        <main>
          <p style={{ color: "#7c3aed", fontSize: "0.875rem", fontWeight: 600, letterSpacing: "0.12em" }}>
            EROARE
          </p>
          <h1 style={{ fontSize: "1.5rem" }}>Aplicația a întâmpinat o problemă</h1>
          <p style={{ maxWidth: "28rem", color: "#64748b", lineHeight: 1.6 }}>
            A apărut o eroare neașteptată. Încearcă să reîncarci aplicația.
          </p>
          {error.digest && (
            <p style={{ color: "#64748b", fontSize: "0.75rem" }}>Cod eroare: {error.digest}</p>
          )}
          <button
            onClick={retry}
            style={{
              marginTop: "12px",
              border: 0,
              borderRadius: "9999px",
              padding: "10px 18px",
              background: "#7c3aed",
              color: "#fff",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            Încearcă din nou
          </button>
        </main>
      </body>
    </html>
  );
}
