// Datas no fuso LOCAL da máquina (toISOString() usa UTC e adianta o dia após 21h no Brasil)
const pad = (n) => String(n).padStart(2, '0');

export function dataLocalISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function hojeLocal() {
  return dataLocalISO();
}

export function somarDiasLocal(dias, base = new Date()) {
  return dataLocalISO(new Date(base.getFullYear(), base.getMonth(), base.getDate() + dias));
}
