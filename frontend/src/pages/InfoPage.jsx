import { useEffect, useState } from "react";
import { api } from "../api/client";

export function InfoPage() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api("/api/info").then((data) => setItems(data.items));
  }, []);

  return (
    <div className="page page-base44">
      <div className="page-header hero-header">
        <div>
          <p className="eyebrow">Área informativa</p>
          <h1>Orientações gerais de uso</h1>
        </div>
      </div>
      <section className="stack">
        {items.map((item) => (
          <article className="card panel-card" key={item}>
            <p>{item}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
