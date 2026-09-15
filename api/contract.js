import { db } from "./_lib/db.js";
import { requireUser } from "./_lib/auth.js";
import { allowMethods, json } from "./_lib/http.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  const user = await requireUser(req, res);
  if (!user) return;
  const sql = db();
  let contract;
  const requestId = String(req.query?.requestId || "");

  if (requestId) {
    if (!/^\d+$/.test(requestId)) return json(res, 400, { error: "Solicitação inválida." });
    const rows = await sql`
      SELECT a.contract_snapshot, a.user_id FROM request_plan_acceptances a
      WHERE a.request_id = ${requestId} LIMIT 1
    `;
    if (!rows[0] || (user.role !== "admin" && String(rows[0].user_id) !== String(user.id))) return json(res, 404, { error: "Contrato não encontrado." });
    try { contract = JSON.parse(rows[0].contract_snapshot); } catch { return json(res, 500, { error: "Não foi possível gerar o contrato." }); }
  } else {
    contract = {
      clientName: user.display_name, username: user.username, email: user.email || "Não informado",
      planName: user.plan_name || "Plano atual", planVersion: user.plan_version || "1.0",
      terms: user.plan_terms || "Condições do plano conforme a proposta comercial vigente entre as partes."
    };
  }

  const pdf = buildPdf(contract);
  const filename = `plano-atual-${safeFilename(contract.username || "cliente")}.pdf`;
  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
  res.setHeader("Cache-Control", "private, no-store");
  return res.end(pdf);
}

function buildPdf(contract) {
  const issued = new Intl.DateTimeFormat("pt-BR", { dateStyle:"long", timeZone:"America/Sao_Paulo" }).format(new Date());
  const lines = [
    "EPHEMEROS - CONTRATO DO PLANO ATUAL", "", `Cliente: ${contract.clientName}`, `Usuario: ${contract.username}`,
    `E-mail: ${contract.email || "Nao informado"}`, `Plano: ${contract.planName}`, `Versao: ${contract.planVersion}`,
    `Documento gerado em: ${issued}`, "", "TERMOS DO PLANO", "", ...wrapText(contract.terms || "", 84), "",
    "REGISTRO DIGITAL", "", "O aceite deste documento e registrado quando o cliente envia uma nova solicitacao pelo portal Ephemeros.",
    "O registro inclui a versao do plano, a copia destes termos, data, horario e identificadores tecnicos de seguranca."
  ].flatMap((line) => typeof line === "string" && line.length > 84 ? wrapText(line, 84) : [line]);
  const pages = [];
  for (let index = 0; index < lines.length; index += 46) pages.push(lines.slice(index, index + 46));
  const objects = [];
  const add = (value) => { objects.push(value); return objects.length; };
  const catalogId = add("");
  const pagesId = add("");
  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const pageIds = [];
  pages.forEach((pageLines, pageIndex) => {
    const commands = ["BT", "/F1 11 Tf", "50 790 Td", "15 TL"];
    pageLines.forEach((line) => commands.push(`(${pdfEscape(line)}) Tj`, "T*"));
    commands.push("ET", "BT", "/F1 9 Tf", `50 32 Td`, `(Ephemeros - pagina ${pageIndex + 1} de ${pages.length}) Tj`, "ET");
    const stream = commands.join("\n");
    const contentId = add(`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`);
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  });
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  let output = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output, "latin1")); output += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => { output += `${String(offset).padStart(10, "0")} 00000 n \n`; });
  output += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "latin1");
}

function wrapText(value, max) {
  const paragraphs = String(value || "").replace(/\r/g, "").split("\n");
  const result = [];
  paragraphs.forEach((paragraph) => {
    if (!paragraph.trim()) { result.push(""); return; }
    let line = "";
    paragraph.split(/\s+/).forEach((word) => {
      if ((line + " " + word).trim().length > max && line) { result.push(line); line = word; }
      else line = (line + " " + word).trim();
    });
    if (line) result.push(line);
  });
  return result;
}
function pdfEscape(value) { return String(value).replace(/[^\x20-\xFF]/g, "-").replace(/([\\()])/g, "\\$1"); }
function safeFilename(value) { return String(value).toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "cliente"; }
