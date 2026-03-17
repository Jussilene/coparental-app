import { db } from "./database.js";

const replacements = [
  ["JoÃ£o Santos", "João Santos"],
  ["ResponsÃ¡vel 1", "Responsável 1"],
  ["ResponsÃ¡vel 2", "Responsável 2"],
  ["FamÃ­lia CoParental", "Família CoParental"],
  ["Fam?lia Pai 1", "Família Pai 1"],
  ["Fam?lia Pai 2", "Família Pai 2"],
  ["MÃ£e", "Mãe"],
  ["PensÃ£o mensal referente Ã s despesas fixas da crianÃ§a.", "Pensão mensal referente às despesas fixas da criança."],
  ["Pens�o mensal referente �s despesas fixas da crian�a.", "Pensão mensal referente às despesas fixas da criança."],
  ["Consulta pediÃ¡trica trimestral", "Consulta pediátrica trimestral"],
  ["OlÃ¡. Registrei a consulta de hoje na Ã¡rea de despesas.", "Olá. Registrei a consulta de hoje na área de despesas."]
];

const updates = [
  { table: "users", column: "name" },
  { table: "users", column: "role_label" },
  { table: "families", column: "name" },
  { table: "family_members", column: "relation_label" },
  { table: "support_settings", column: "description" },
  { table: "expenses", column: "description" },
  { table: "chat_messages", column: "content" }
];

for (const { table, column } of updates) {
  const rows = db.prepare(`SELECT id, ${column} AS value FROM ${table}`).all();
  const update = db.prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`);

  for (const row of rows) {
    let nextValue = row.value;
    for (const [from, to] of replacements) {
      if (typeof nextValue === "string") {
        nextValue = nextValue.replaceAll(from, to);
      }
    }
    if (nextValue !== row.value) {
      update.run(nextValue, row.id);
    }
  }
}

console.log("Reparo de texto concluído.");
